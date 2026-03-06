const express = require("express");
const axios = require("axios");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const { v4: uuid } = require("uuid");
const cors = require("cors"); // 👈 ДОБАВЬТЕ ЭТУ СТРОКУ

const app = express();

app.use(cors({
  origin: 'http://localhost:3000', // разрешаем только фронтенд
  credentials: true, // обязательно для cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(cookieParser());
app.use(express.json());

const PORT = process.env.PORT || 4000;

const {
  KEYCLOAK_INTERNAL_URL,
  KEYCLOAK_PUBLIC_URL,
  KEYCLOAK_REALM,
  CLIENT_ID,
  CLIENT_SECRET,
  SESSION_SECRET,
  ENCRYPTION_SECRET,
  API_URL,
  REDIRECT_URI,
  FRONTEND_URL
} = process.env;

const TOKEN_URL =
  `${KEYCLOAK_INTERNAL_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`;

const AUTH_URL =
  `${KEYCLOAK_PUBLIC_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/auth`;

/* =========================
   START LOGS
========================= */

console.log("========== CONFIG ==========");
console.log("PORT:", PORT);
console.log("REALM:", KEYCLOAK_REALM);
console.log("CLIENT_ID:", CLIENT_ID);
console.log("KEYCLOAK_INTERNAL_URL:", KEYCLOAK_INTERNAL_URL);
console.log("KEYCLOAK_PUBLIC_URL:", KEYCLOAK_PUBLIC_URL);
console.log("TOKEN_URL:", TOKEN_URL);
console.log("AUTH_URL:", AUTH_URL);
console.log("============================");

const sessions = new Map();

/* =========================
   PKCE helpers
========================= */

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function generatePKCE() {
  console.log("🔐 Generating PKCE pair");

  const verifier = base64url(crypto.randomBytes(32));

  const challenge = base64url(
    crypto.createHash("sha256").update(verifier).digest()
  );

  console.log("✅ PKCE generated");

  return { verifier, challenge };
}

/* =========================
   Encryption helpers
========================= */

function encrypt(text) {
  const iv = crypto.randomBytes(16);

  const key = crypto
    .createHash("sha256")
    .update(ENCRYPTION_SECRET)
    .digest();

  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(data) {
  const [ivHex, encrypted] = data.split(":");

  const iv = Buffer.from(ivHex, "hex");

  const key = crypto
    .createHash("sha256")
    .update(ENCRYPTION_SECRET)
    .digest();

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/* =========================
   Session helpers
========================= */

function createSession(tokens) {
  const sessionId = uuid();

  console.log("🧠 Creating session:", sessionId);

  sessions.set(sessionId, {
    accessToken: tokens.access_token,
    refreshToken: encrypt(tokens.refresh_token),
    expiresAt: Date.now() + tokens.expires_in * 1000
  });

  return sessionId;
}

function rotateSession(oldSessionId) {
  const data = sessions.get(oldSessionId);

  if (!data) return null;

  sessions.delete(oldSessionId);

  const newSessionId = uuid();

  sessions.set(newSessionId, data);

  console.log("🔄 Session rotated:", newSessionId);

  return newSessionId;
}

/* =========================
   Middleware
========================= */

async function authMiddleware(req, res, next) {

  let sessionId = req.cookies.sessionId;

  console.log("🔎 Checking session:", sessionId);

  if (!sessionId || !sessions.has(sessionId)) {
    console.log("❌ No valid session");
    return res.status(401).send("Unauthorized");
  }

  let session = sessions.get(sessionId);

  /* Refresh token */

  if (Date.now() > session.expiresAt) {

    console.log("♻️ Access token expired — refreshing...");

    try {

      const refreshToken = decrypt(session.refreshToken);

      console.log("➡ Refresh request:", TOKEN_URL);
      const response = await axios.post(
        TOKEN_URL,
        new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      session.accessToken = response.data.access_token;
      session.refreshToken = encrypt(response.data.refresh_token);
      session.expiresAt = Date.now() + response.data.expires_in * 1000;

      console.log("✅ Token refreshed");

    } catch (e) {

      sessions.delete(sessionId);

      console.error("❌ Token refresh failed:", e.response?.data || e.message);

      return res.status(401).send("Session expired");
    }
  }

  /* Rotate session */

  const newSessionId = rotateSession(sessionId);

  res.cookie("sessionId", newSessionId, {
    httpOnly: true,
    secure: true,
    sameSite: "strict"
  });

  req.accessToken = sessions.get(newSessionId).accessToken;

  next();
}

/* =========================
   LOGIN
========================= */

app.get("/login", (req, res) => {

  console.log("🔐 Login request");

  const { verifier, challenge } = generatePKCE();

  const state = crypto.randomBytes(16).toString("hex");

  console.log("🧾 State:", state);

  res.cookie("pkce_verifier", verifier, {
    httpOnly: true,
    secure: true,
    sameSite: "strict"
  });

  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "strict"
  });

  const url =
    `${AUTH_URL}?client_id=${CLIENT_ID}` +
    `&response_type=code` +
    `&scope=openid` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&code_challenge=${challenge}` +
    `&code_challenge_method=S256` +
    `&state=${state}`;

  console.log("➡ Redirecting to Keycloak:", url);

  res.redirect(url);
});

/* =========================
   CALLBACK
========================= */

app.get("/callback", async (req, res) => {

  console.log("📥 Callback received");

  const code = req.query.code;
  const state = req.query.state;

  const verifier = req.cookies.pkce_verifier;
  const storedState = req.cookies.oauth_state;

  if (!code) {
    console.error("❌ Missing code");
    return res.status(400).send("Missing code");
  }

  if (!verifier) {
    console.error("❌ Missing PKCE verifier");
    return res.status(400).send("Missing verifier");
  }

  if (state !== storedState) {
    console.error("❌ State mismatch");
    return res.status(400).send("Invalid state");
  }

  console.log("✅ Code + PKCE verified");

  try {
    console.log("➡ Token request to:", TOKEN_URL);
    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    console.log("✅ Tokens received");

    const sessionId = createSession(response.data);

    res.cookie("sessionId", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "strict"
    });

    res.clearCookie("pkce_verifier");
    res.clearCookie("oauth_state");

    console.log("🚀 Auth success → redirect frontend");

    res.redirect(FRONTEND_URL);

  } catch (e) {
    console.error("❌ Token exchange failed:", e.response?.data || e.message);
    res.status(500).send("Auth failed");
  }
});

/* =========================
   PROTECTED ROUTE
========================= */

app.get("/reports", authMiddleware, async (req, res) => {

  console.log("📊 Reports request");

  try {

    const apiResponse = await axios.get(`${API_URL}/reports`, {
      headers: {
        Authorization: `Bearer ${req.accessToken}`
      }
    });

    console.log("✅ API response ok");

    res.json(apiResponse.data);

  } catch (e) {

    console.error("❌ API error:", e.response?.data || e.message);

    res.status(500).send("API error");
  }
});

/* =========================
   START
========================= */

app.listen(PORT, () => {
  console.log(`✅ Auth server running on ${PORT}`);
});