const crypto = require("crypto");

const ALLOWED_ORIGIN = "https://amarjais-ai.github.io";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function verifyToken(token, secret) {
  if (!token || !secret) return null;

  const parts = String(token).split(".");
  if (parts.length !== 2) return null;

  const payloadString = parts[0];
  const receivedSignature = parts[1];

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadString)
    .digest("base64url");

  const a = Buffer.from(expectedSignature);
  const b = Buffer.from(receivedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(payloadString, "base64url").toString("utf8")
    );

    if (
      payload.expires_at !== null &&
      (!payload.expires_at || Date.now() > Number(payload.expires_at))
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { access_token } = req.body || {};
    const accessSecret = process.env.EBOOK_ACCESS_SECRET;
    const ebookUrl = process.env.EBOOK_DRIVE_URL;

    if (!accessSecret || !ebookUrl) {
      return res.status(500).json({
        error: "E-book access is not configured"
      });
    }

    const payload = verifyToken(access_token, accessSecret);

    if (!payload) {
      return res.status(401).json({
        error: "Invalid or expired access"
      });
    }

    return res.status(200).json({
      success: true,
      ebook_url: ebookUrl,
      expires_at: payload.expires_at,
      access_type: payload.expires_at === null ? "lifetime" : "one_year"
    });
  } catch (error) {
    console.error("E-book access error:", error);
    return res.status(500).json({
      error: "Unable to provide e-book access"
    });
  }
};
