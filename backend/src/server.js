const express = require("express");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const Minio = require("minio");

const app = express();

const {
  PORT,
  DB_HOST,
  DB_PORT,
  DB_NAME,
  DB_USER,
  DB_PASSWORD,
  KEYCLOAK_URL,
  KEYCLOAK_REALM,
  S3_ENDPOINT,
  S3_PORT,
  S3_ACCESS_KEY,
  S3_SECRET_KEY,
  S3_BUCKET,
  CDN_URL
} = process.env;

/* =========================
   S3
========================= */
const s3Client = new Minio.Client({
  endPoint: S3_ENDPOINT,
  port: Number(S3_PORT),
  useSSL: false,
  accessKey: S3_ACCESS_KEY,
  secretKey: S3_SECRET_KEY
});

async function ensureBucket() {

  const exists = await s3Client.bucketExists(S3_BUCKET);

  if (!exists) {
    await s3Client.makeBucket(S3_BUCKET);
  }

}

ensureBucket();

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

  console.log("📤 req.user:", req.user);
  const userId = Number(req.user.buyer_id);

  if (isNaN(userId)) {
    return res.status(400).send("Invalid buyer_id");
  }

  const objectName = `${userId}.json`;

  try {

    /* 1️⃣ Проверяем наличие отчёта в S3 */

    try {

      await s3Client.statObject(S3_BUCKET, objectName);

      return res.json({
        source: "cache",
        url: `${CDN_URL}/reports/${objectName}`
      });

    } catch(e) {
       console.log("📤 cache: object not found ${CDN_URL}/reports/${objectName}");
    }

    /* 2️⃣ Генерируем отчёт */

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

    const report = result.rows[0] || {
      buyer_id: userId,
      orders_count: 0,
      total_sum: 0,
      total_discount: 0
    };

    const buffer = Buffer.from(JSON.stringify(report));

    /* 3️⃣ сохраняем в S3 */

    await s3Client.putObject(
      S3_BUCKET,
      objectName,
      buffer,
      buffer.length,
      { "Content-Type": "application/json" }
    );

    /* 4️⃣ возвращаем CDN ссылку */

    res.json({
      source: "generated",
      url: `${CDN_URL}/reports/${objectName}`
    });

  } catch (e) {

    console.error("❌ DB error:", e);

    res.status(500).send("report error");

  }

});

app.listen(PORT, () => {
  console.log(`✅ Backend started on ${PORT}`);
});