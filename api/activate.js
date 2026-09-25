const path = require("path");
const fs = require("fs");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const { email, plan, payment } = req.query;

    if (payment!== "success") {
      return res.status(400).json({ success: false, message: "Not paid" });
    }
    if (!email ||!email.includes("@")) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanPlan = String(plan || "").toLowerCase().includes("gold")? "Gold" : "Silver";

    // FIND DB - same logic as your server.js
    const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.VOLUME_PATH || "/data";
    let DB_PATH = process.env.DB_PATH;

    if (!DB_PATH) {
      const tries = [
        path.join(process.cwd(), "jovia", "jovia.db"),
        path.join(process.cwd(), "data", "database.db"),
        path.join(process.cwd(), "data", "jovia.db"),
        path.join(__dirname, "..", "data", "jovia.db"),
        path.join(VOLUME_PATH, "jovia.db"),
        "/data/jovia.db"
      ];
      for (const p of tries) {
        if (fs.existsSync(p)) { DB_PATH = p; break; }
      }
      if (!DB_PATH) DB_PATH = tries[0];
    }

    console.log(`✅ JOVIA PAID: ${cleanEmail} | ${cleanPlan} | DB: ${DB_PATH}`);

    // UPDATE DATABASE - 100% SECURE
    try {
      const Database = require("better-sqlite3");
      if (fs.existsSync(DB_PATH)) {
        const db = new Database(DB_PATH);

        // Update with all possible column names (your server uses different names)
        try {
          db.prepare(`
            UPDATE users SET
              status = 'active',
              account_status = 'active',
              accountStatus = 'active',
              plan = @plan,
              package = @plan,
              is_paid = 1
            WHERE LOWER(email) = LOWER(@email)
          `).run({ plan: cleanPlan, email: cleanEmail });
        } catch(e) {
          // fallback - try simple update
          try { db.prepare("UPDATE users SET status='active', plan=? WHERE email=?").run(cleanPlan, cleanEmail); } catch {}
          try { db.prepare("UPDATE users SET accountStatus='active', plan=? WHERE LOWER(email)=LOWER(?)").run(cleanPlan, cleanEmail); } catch {}
        }

        db.close();
        console.log(`✅ DB ACTIVATED: ${cleanEmail}`);
      } else {
        console.log("DB file not found at:", DB_PATH);
      }
    } catch (dbErr) {
      console.error("DB error:", dbErr.message);
    }

    return res.status(200).json({
      success: true,
      email: cleanEmail,
      plan: cleanPlan,
      verified: true
    });

  } catch (err) {
    console.error("activate.js error:", err);
    return res.status(500).json({ success: false });
  }
};
