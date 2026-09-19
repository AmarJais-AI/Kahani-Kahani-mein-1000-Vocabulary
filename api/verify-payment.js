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
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      name,
      email
    } = req.body || {};

    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature
    ) {
      return res.status(400).json({
        error: "Missing payment verification details"
      });
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const accessSecret = process.env.EBOOK_ACCESS_SECRET;

    if (!keySecret || !accessSecret) {
      return res.status(500).json({
        error: "Server configuration is incomplete"
      });
    }

    // Verify Razorpay signature
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (
      !crypto.timingSafeEqual(
        Buffer.from(expectedSignature),
        Buffer.from(razorpay_signature)
      )
    ) {
      return res.status(400).json({
        error: "Invalid payment signature"
      });
    }

    // Check payment status directly with Razorpay
    const auth = Buffer.from(
      `${process.env.RAZORPAY_KEY_ID}:${keySecret}`
    ).toString("base64");

    const paymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );

    if (!paymentResponse.ok) {
      return res.status(400).json({
        error: "Unable to verify payment with Razorpay"
      });
    }

    const payment = await paymentResponse.json();

    if (payment.status !== "captured") {
      return res.status(400).json({
        error: "Payment has not been captured"
      });
    }

    // Create a temporary access token valid for 24 hours
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    const payload = {
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      name: name || "",
      email: email || "",
      expires_at: expiresAt
    };

    const payloadString = Buffer.from(
      JSON.stringify(payload)
    ).toString("base64url");

    const signature = crypto
      .createHmac("sha256", accessSecret)
      .update(payloadString)
      .digest("base64url");

    const accessToken = `${payloadString}.${signature}`;

    return res.status(200).json({
      success: true,
      access_token: accessToken,
      expires_at: expiresAt
    });

  } catch (error) {
    console.error("Payment verification error:", error);

    return res.status(500).json({
      error: "Payment verification failed"
    });
  }
};