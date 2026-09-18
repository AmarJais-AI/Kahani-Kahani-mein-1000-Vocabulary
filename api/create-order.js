export default async function handler(req, res) {
  // Allow GitHub Pages to call this API
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://amarjais-ai.github.io"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  // Handle browser CORS preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { name, email, coupon } = req.body || {};

    // Get Razorpay credentials from Vercel Environment Variables
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return res.status(500).json({
        error: "Razorpay API keys are not configured."
      });
    }

    // Create Basic Authentication
    const auth = Buffer
      .from(`${keyId}:${keySecret}`)
      .toString("base64");

    // Server-side price calculation
    // ₹199 normally
    // ₹99.50 with WELCOME50
    const amount =
      coupon === "WELCOME50"
        ? 9950
        : 19900;

    // Create Razorpay order
    const orderData = {
      amount: amount,
      currency: "INR",
      receipt: `vocab_${Date.now()}`,

      notes: {
        product: "Kahani-Kahani Mein 1000 Vocabulary",
        buyer_name: name || "",
        buyer_email: email || "",
        coupon: coupon === "WELCOME50"
          ? "WELCOME50"
          : "NONE"
      }
    };

    // Send order request to Razorpay
    const response = await fetch(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",

        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json"
        },

        body: JSON.stringify(orderData)
      }
    );

    const data = await response.json();

    // Handle Razorpay errors
    if (!response.ok) {
      console.error("Razorpay error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.description ||
          data?.error?.reason ||
          JSON.stringify(data)
      });
    }

    // Send successful order details back to website
    return res.status(200).json({
      order_id: data.id,
      amount: data.amount,
      currency: data.currency,
      key_id: keyId
    });

  } catch (error) {
    console.error("Create order error:", error);

    return res.status(500).json({
      error:
        error?.message ||
        "Unable to create Razorpay order."
    });
  }
}