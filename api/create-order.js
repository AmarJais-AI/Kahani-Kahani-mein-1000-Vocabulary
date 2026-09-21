const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WELCOME50_OFFER_ID = "offer_TcJ6j2zmNLbkRa";
const ALLOWED_ORIGIN = "https://amarjais-ai.github.io";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(500).json({ error: "Razorpay server credentials are not configured." });
  }

  try {
    const body = req.body || {};
    const coupon = String(body.coupon || "").trim().toUpperCase();
    const name = String(body.name || "").trim().slice(0, 100);
    const email = String(body.email || "").trim().slice(0, 150);

    let amount = 19900;

    // WELCOME50: normal ₹199 order with the existing Razorpay 50% offer.
    // AMAR75: direct ₹49.75 order.
    if (coupon === "AMAR75") {
      amount = 4975;
    }

    const order = {
      amount,
      currency: "INR",
      receipt: `kv_${Date.now()}`,
      notes: {
        product: "Kahani-Kahani Mein 1000 Vocabulary",
        buyer_name: name,
        buyer_email: email,
        coupon: coupon === "WELCOME50" || coupon === "AMAR75" ? coupon : "NONE"
      }
    };

    if (coupon === "WELCOME50") {
      order.offers = [WELCOME50_OFFER_ID];
      order.force_offer = true;
    }

    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString("base64");

    const rp = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify(order)
    });

    const data = await rp.json();

    if (!rp.ok) {
      console.error("Razorpay order error:", data);
      return res.status(rp.status).json({
        error: data?.error?.description || "Razorpay order creation failed."
      });
    }

    return res.status(200).json({
      key_id: RAZORPAY_KEY_ID,
      order_id: data.id,
      amount: data.amount,
      currency: data.currency
    });
  } catch (error) {
    console.error("Create order error:", error);
    return res.status(500).json({ error: "Server error while creating order." });
  }
};
