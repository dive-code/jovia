export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { email, plan, payment, name, phone } = req.query;

    // 1. Only allow success
    if (payment !== "success") {
      return res.status(400).json({ success: false, message: "Not paid" });
    }

    // 2. Validate email
    if (!email || !email.includes("@")) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPlan = String(plan || "").toLowerCase().includes("gold") ? "Gold" : "Silver";
    const cleanName = name || "";
    const cleanPhone = phone || "";

    // 3. LOG - You will see this in Vercel Logs
    console.log(`✅ JOVIA PAYMENT VERIFIED: ${cleanEmail} | ${cleanPlan} | ${cleanName} | ${cleanPhone} | ${new Date().toISOString()}`);

    // 4. TODO: Save to your database
    // Right now /api/me reads from your DB - add update here:
    // Example:
    // await sql`UPDATE users SET status='active', plan=${cleanPlan}, paid_at=NOW() WHERE email=${cleanEmail}`

    // 5. Return success so payment.html can unlock
    return res.status(200).json({
      success: true,
      email: cleanEmail,
      plan: cleanPlan,
      verified: true,
      message: "Payment verified - account will be activated"
    });

  } catch (err) {
    console.error("activate.js error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
}
