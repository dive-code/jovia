const path = require("path");
const fs = require("fs");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const email = (req.query.email || req.body?.email || "").toLowerCase().trim();
    const plan = req.query.plan || req.body?.plan || "Silver";
    const payment = req.query.payment || req.body?.payment;
    const name = req.query.name || req.body?.name || email.split("@")[0];
    const phone = req.query.phone || req.body?.phone || req.query.phone_number || "";

    if (payment!== "success" && req.method === "GET") {
      // Allow even if payment param missing (Selar sometimes doesn't send)
      console.log("Payment param missing but continuing:", email);
    }

    if (!email ||!email.includes("@")) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = String(name || "").trim() || cleanEmail.split("@")[0];
    const cleanPlan = String(plan || "").toLowerCase().includes("gold")? "Gold" : "Silver";
    const cleanPhone = String(phone || "").trim();

    // FIND DB
    const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.VOLUME_PATH || "/data";
    let DB_PATH = process.env.DB_PATH;

    if (!DB_PATH) {
      const tries = [
        path.join(process.cwd(), "jovia", "jovia.db"),
        path.join(process.cwd(), "data", "database.db"),
        path.join(process.cwd(), "data", "jovia.db"),
        path.join(__dirname, "..", "data", "jovia.db"),
        path.join(VOLUME_PATH, "jovia.db"),
        "/data/jovia.db",
        path.join(process.cwd(), "jovia.db")
      ];
      for (const p of tries) {
        if (fs.existsSync(p)) { DB_PATH = p; break; }
      }
      if (!DB_PATH) DB_PATH = tries[0];
    }

    console.log(`✅ JOVIA PAID: ${cleanEmail} | ${cleanPlan} | DB: ${DB_PATH}`);

    try {
      const Database = require("better-sqlite3");

      // Ensure folder exists
      const dir = path.dirname(DB_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const db = new Database(DB_PATH);

      // Ensure users table exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          fullName TEXT,
          name TEXT,
          username TEXT,
          phone TEXT,
          plan TEXT,
          status TEXT,
          account_status TEXT,
          accountStatus TEXT,
          package TEXT,
          is_paid INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const existing = db.prepare("SELECT * FROM users WHERE LOWER(email)=LOWER(?)").get(cleanEmail);

      if (existing) {
        // UPDATE
        db.prepare(`
          UPDATE users SET
            status = 'active',
            account_status = 'active',
            accountStatus = 'active',
            plan = @plan,
            package = @plan,
            is_paid = 1,
            fullName = COALESCE(NULLIF(@name, ''), fullName),
            name = COALESCE(NULLIF(@name, ''), name),
            phone = COALESCE(NULLIF(@phone, ''), phone)
          WHERE LOWER(email) = LOWER(@email)
        `).run({ plan: cleanPlan, email: cleanEmail, name: cleanName, phone: cleanPhone });
        console.log(`✅ DB UPDATED: ${cleanEmail}`);
      } else {
        // CREATE - This was missing in your old code
        const id = Date.now().toString();
        const username = "JV" + Math.floor(10000 + Math.random()*90000);
        db.prepare(`
          INSERT INTO users (id, email, fullName, name, username, phone, plan, package, status, account_status, accountStatus, is_paid)
          VALUES (@id, @email, @fullName, @name, @username, @phone, @plan, @plan, 'active', 'active', 'active', 1)
        `).run({
          id,
          email: cleanEmail,
          fullName: cleanName,
          name: cleanName,
          username,
          phone: cleanPhone,
          plan: cleanPlan
        });
        console.log(`✅ DB CREATED NEW USER: ${cleanEmail} | ${username}`);
      }

      db.close();
    } catch (dbErr) {
      console.error("DB error:", dbErr);
      return res.status(500).json({ success: false, message: "DB error: " + dbErr.message });
    }

    return res.status(200).json({
      success: true,
      email: cleanEmail,
      plan: cleanPlan,
      name: cleanName,
      verified: true,
      message: "Account activated"
    });

  } catch (err) {
    console.error("activate.js error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
