const crypto = require("crypto");

const ALLOWED_ORIGIN = "https://amarjais-ai.github.io";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      name,
      email
    } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification details" });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const accessSecret = process.env.EBOOK_ACCESS_SECRET;

    if (!keyId || !keySecret || !accessSecret) {
      return res.status(500).json({ error: "Server configuration is incomplete" });
    }

    // 1. Verify Razorpay's payment signature.
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (!safeEqualHex(expectedSignature, razorpay_signature)) {
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

    // 2. Confirm the payment is captured.
    const paymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!paymentResponse.ok) {
      return res.status(400).json({ error: "Unable to verify payment with Razorpay" });
    }

    const payment = await paymentResponse.json();

    if (payment.status !== "captured") {
      return res.status(400).json({ error: "Payment has not been captured" });
    }

    if (payment.order_id !== razorpay_order_id) {
      return res.status(400).json({ error: "Payment/order mismatch" });
    }

    // 3. Retrieve the server-created order. The coupon is taken from our
    // server-side order notes, never from the browser after payment.
    const orderResponse = await fetch(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpay_order_id)}`,
      { headers: { Authorization: `Basic ${auth}` } }
    );

    if (!orderResponse.ok) {
      return res.status(400).json({ error: "Unable to verify Razorpay order" });
    }

    const order = await orderResponse.json();
    const coupon = String(order.notes?.coupon || "NONE").toUpperCase();

    // Access rules:
    // NONE       -> lifetime
    // WELCOME50  -> lifetime
    // AMAR75     -> 365 days
    let expiresAt = null;
    if (coupon === "AMAR75") {
      expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000;
    }

    const payload = {
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      name: name || order.notes?.buyer_name || "",
      email: email || order.notes?.buyer_email || "",
      coupon,
      expires_at: expiresAt
    };

    const payloadString = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", accessSecret)
      .update(payloadString)
      .digest("base64url");

    return res.status(200).json({
      success: true,
      access_token: `${payloadString}.${signature}`,
      expires_at: expiresAt,
      access_type: expiresAt === null ? "lifetime" : "one_year"
    });
  } catch (error) {
    console.error("Payment verification error:", error);
    return res.status(500).json({ error: "Payment verification failed" });
  }
};
