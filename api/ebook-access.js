const crypto = require("crypto");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "https://amarjais-ai.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { access_token } = req.body || {};
    const accessSecret = process.env.EBOOK_ACCESS_SECRET;
    const ebookUrl = process.env.EBOOK_DRIVE_URL;

    if (!accessTokenValid(access_token, accessSecret)) {
      return res.status(401).json({ error: "Invalid or expired access token" });
    }

    // This legacy endpoint is retained for compatibility. The new protected
    // reader uses /api/page and does not expose the Google Drive URL.
    return res.status(200).json({
      success: true,
      ebook_url: ebookUrl || null,
      protected_reader: true
    });
  } catch (error) {
    console.error("E-book access error:", error);
    return res.status(500).json({ error: "Unable to provide e-book access" });
  }
};

function accessTokenValid(token, secret) {
  if (!token || !secret) return false;
  const parts = String(token).split(".");
  if (parts.length !== 2) return false;

  const [payloadString, receivedSignature] = parts;
  const expectedSignature = crypto.createHmac("sha256", secret).update(payloadString).digest("base64url");
  const a = Buffer.from(expectedSignature);
  const b = Buffer.from(receivedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  try {
    const payload = JSON.parse(Buffer.from(payloadString, "base64url").toString("utf8"));
    return payload.expires_at === null || (payload.expires_at && Date.now() <= Number(payload.expires_at));
  } catch {
    return false;
  }
}
