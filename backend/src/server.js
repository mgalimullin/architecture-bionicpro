const express = require("express");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");

const app = express();

const {
  PORT,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  KEYCLOAK_URL,
  KEYCLOAK_REALM
} = process.env;

/* =========================
   Postgres pool
========================= */

const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD
});

/* =========================
   Keycloak JWT verify
   Docs:
   https://www.keycloak.org/docs/latest/securing_apps/
========================= */

const client = jwksClient({
  jwksUri: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`,
  cache: true,
  rateLimit: true
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function (err, key) {

    if (err) {
      console.error("❌ JWKS error:", err);
      return callback(err);
    }

    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

function authMiddleware(req, res, next) {

  const authHeader = req.headers.authorization;

  if (!authHeader){
    console.error("❌ No token");
    return res.status(401).send("No token");
  }

  const token = authHeader.split(" ")[1];

  jwt.verify(
    token,
    getKey,
    {
      issuer: `http://localhost:8080/realms/${KEYCLOAK_REALM}`,
      algorithms: ["RS256"]
    },
    (err, decoded) => {

      if (err){
        console.error("❌ Invalid token:", err.message);
        return res.status(401).send("Invalid token");
      }

      if (!decoded.buyer_id) {
        console.error("❌ buyer_id missing in token", decoded);
        return res.status(403).send("buyer_id missing");
      }

      req.user = decoded;
      next();
    }
  );
}

/* =========================
   /reports endpoint
========================= */

app.get("/reports", authMiddleware, async (req, res) => {

  try {

    console.log("📤 req.user:", req.user);

    // 🔐 Доступ только к своему отчёту
    const userId = Number(req.user.buyer_id);

    if (isNaN(userId)) {
      return res.status(400).send("Invalid buyer_id");
    }

    /* OLAP-style query — без realtime вычислений */
    const result = await pool.query(`
      SELECT 
        buyer_id,
        COUNT(*) as orders_count,
        SUM(total) as total_sum,
        SUM(discount) as total_discount
      FROM sample_table
      WHERE buyer_id = $1
      GROUP BY buyer_id
    `, [userId]);

    return res.json(result.rows[0] || {
      buyer_id: userId,
      orders_count: 0,
      total_sum: 0,
      total_discount: 0
    });

  } catch (e) {

    console.error("❌ DB error:", e);

    res.status(500).send("DB error");
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend started on ${PORT}`);
});