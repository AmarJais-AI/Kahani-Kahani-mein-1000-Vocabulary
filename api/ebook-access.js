const crypto = require("crypto");

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "https://amarjais-ai.github.io");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { access_token } = req.body || {};

    if (!access_token) {
      return res.status(401).json({
        error: "Access token required"
      });
    }

    const accessSecret = process.env.EBOOK_ACCESS_SECRET;
    const ebookUrl = process.env.EBOOK_DRIVE_URL;

    if (!accessSecret || !ebookUrl) {
      return res.status(500).json({
        error: "E-book access is not configured"
      });
    }

    const parts = access_token.split(".");

    if (parts.length !== 2) {
      return res.status(401).json({
        error: "Invalid access token"
      });
    }

    const payloadString = parts[0];
    const receivedSignature = parts[1];

    // Re-create token signature
    const expectedSignature = crypto
      .createHmac("sha256", accessSecret)
      .update(payloadString)
      .digest("base64url");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(receivedSignature)
      )
    ) {
      return res.status(401).json({
        error: "Invalid access token"
      });
    }

    // Decode payload
    let payload;

    try {
      payload = JSON.parse(
        Buffer.from(payloadString, "base64url").toString("utf8")
      );
    } catch {
      return res.status(401).json({
        error: "Invalid token data"
      });
    }

    // Check expiry
    if (
      !payload.expires_at ||
      Date.now() > Number(payload.expires_at)
    ) {
      return res.status(401).json({
        error: "Access has expired"
      });
    }

    // Return the Drive URL only after successful validation
    return res.status(200).json({
      success: true,
      ebook_url: ebookUrl,
      expires_at: payload.expires_at
    });

  } catch (error) {
    console.error("E-book access error:", error);

    return res.status(500).json({
      error: "Unable to provide e-book access"
    });
  }
};