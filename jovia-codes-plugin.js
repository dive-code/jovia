
const crypto = require("crypto");

module.exports = (app, db, requireUser, requireAdmin) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jovia_codes (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      price INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0,
      used_by TEXT DEFAULT '',
      used_by_name TEXT DEFAULT '',
      used_by_email TEXT DEFAULT '',
      used_by_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT
    );
  `);

  const userColumns = () => db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  let columns = userColumns();
  if (!columns.includes("package")) db.exec("ALTER TABLE users ADD COLUMN package TEXT DEFAULT 'Silver'");
  columns = userColumns();
  if (!columns.includes("plan")) db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'Silver'");
  columns = userColumns();
  if (!columns.includes("is_super")) db.exec("ALTER TABLE users ADD COLUMN is_super INTEGER DEFAULT 0");
  columns = userColumns();
  if (!columns.includes("account_status")) try{ db.exec("ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'"); }catch(e){}
  if (!columns.includes("status")) try{ db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); }catch(e){}

  const hasColumn = (name) => userColumns().includes(name);
  const randomCode = (length, prefix) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let suffix = "";
    for (let i = 0; i < length; i++) suffix += alphabet[crypto.randomInt(0, alphabet.length)];
    return prefix + suffix;
  };
  const normalizeCode = (value) => String(value || "").trim().toUpperCase();
  const getTotalCodes = () => db.prepare("SELECT COUNT(*) AS total FROM jovia_codes").get().total;

  const userGuard = (req, res, next) => {
    if (typeof requireUser !== "function") return res.status(503).json({ success: false, message: "User auth not configured." });
    return requireUser(req, res, () => {
      if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: "Please log in." });
      next();
    });
  };
  const adminGuard = (req, res, next) => {
    if (typeof requireAdmin !== "function") return res.status(503).json({ success: false, message: "Admin auth not configured." });
    return requireAdmin(req, res, next);
  };

  app.post("/api/admin/codes/generate", adminGuard, (req, res) => {
    try {
      const requestedType = String(req.body?.type || "").toLowerCase();
      const type = requestedType === "gold" || requestedType === "super-gold" ? "super-gold" : requestedType === "silver" || requestedType === "super-silver" ? "super-silver" : requestedType === "withdraw" ? "withdraw" : null;
      if (!type) return res.status(400).json({ success: false, message: "Invalid code type." });
      const count = Number(req.body?.count);
      if (!Number.isInteger(count) || count < 1 || count > 50) return res.status(400).json({ success: false, message: "Choose 1-50." });
      const price = type === "super-gold" ? 12000 : type === "super-silver" ? 16000 : 0;
      const prefix = type === "withdraw" ? "JOVIA-" : "SUPER-";
      const length = type === "withdraw" ? 6 : 8;
      const generateTransaction = db.transaction(() => {
        const generated = [];
        while (generated.length < count) {
          const code = randomCode(length, prefix);
          const result = db.prepare(`INSERT OR IGNORE INTO jovia_codes (code, type, price, used, created_at) VALUES (?, ?, ?, 0, datetime('now'))`).run(code, type, price);
          if (result.changes === 1) generated.push({ code, type, price, used: 0 });
        }
        return generated;
      });
      const generated = generateTransaction();
      return res.json({ success: true, codes: generated, total: getTotalCodes() });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Could not generate codes." });
    }
  });

  app.post("/api/upgrade/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);
    if (!raw) return res.status(400).json({ success: false, message: "Enter a SUPER code." });
    try {
      const upgradeTransaction = db.transaction(() => {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
        if (!user) throw new Error("USER_NOT_FOUND");
        const code = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(raw);
        if (!code) throw new Error("INVALID_CODE");
        if (code.type !== "super-gold" && code.type !== "super-silver") throw new Error("WRONG_CODE_TYPE");
        if (Number(code.used) === 1) throw new Error("CODE_ALREADY_USED");

        const assignments = ["package = ?", "is_super = ?"];
        const values = ["SUPER", 1];
        if (hasColumn("plan")) { assignments.push("plan = ?"); values.push("SUPER"); }
        if (hasColumn("account_status")) { assignments.push("account_status = ?"); values.push("active"); }
        if (hasColumn("status")) { assignments.push("status = ?"); values.push("active"); }
        values.push(user.id);

        const updateUser = db.prepare(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
        if (updateUser.changes !== 1) throw new Error("USER_UPDATE_FAILED");

        const email = String(user.email || "");
        const username = String(user.username || email.split("@")[0] || "User");
        const displayName = `${username} (${email})`;
        const markCode = db.prepare(`UPDATE jovia_codes SET used = 1, used_by = ?, used_by_name = ?, used_by_email = ?, used_by_id = ?, used_at = datetime('now') WHERE code = ? AND used = 0`).run(displayName, username, email, user.id, raw);
        if (markCode.changes !== 1) throw new Error("CODE_REDEMPTION_FAILED");

        return db.prepare(`SELECT id, full_name, username, email, package, plan, is_super FROM users WHERE id = ?`).get(user.id);
      });
      const updatedUser = upgradeTransaction();
      return res.json({ success: true, message: "SUPER upgrade successful - unlimited jobs!", user: updatedUser });
    } catch (error) {
      const messages = { USER_NOT_FOUND: "Account not found.", INVALID_CODE: "Invalid SUPER code.", WRONG_CODE_TYPE: "Wrong code type - use SUPER code.", CODE_ALREADY_USED: "Code already used.", USER_UPDATE_FAILED: "Update failed.", CODE_REDEMPTION_FAILED: "Could not redeem." };
      if (messages[error.message]) return res.status(error.message === "INVALID_CODE" ? 404 : error.message === "CODE_ALREADY_USED" ? 409 : 400).json({ success: false, message: messages[error.message] });
      console.error("Upgrade error:", error);
      return res.status(500).json({ success: false, message: "Upgrade failed." });
    }
  });

  app.get("/api/admin/codes/check/:code", adminGuard, (req, res) => {
    try {
      const code = normalizeCode(req.params.code);
      const row = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(code);
      if (!row) return res.json({ success: true, exists: false, total: getTotalCodes() });
      return res.json({ success: true, exists: true, code: row.code, type: row.type, price: row.price, used: row.used, used_by: row.used_by, created_at: row.created_at, used_at: row.used_at });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Could not check." });
    }
  });

  app.get("/api/admin/codes/list", adminGuard, (req, res) => {
    try {
      const codes = db.prepare(`SELECT code, type, price, used, used_by, used_by_name, used_by_email, used_by_id, created_at, used_at FROM jovia_codes ORDER BY created_at DESC`).all();
      return res.json({ success: true, total: codes.length, codes });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Could not load." });
    }
  });

  console.log("✅ JOVIA Codes plugin loaded - SECURE PRODUCTION - SUPER UNLIMITED ACTIVE");
};
