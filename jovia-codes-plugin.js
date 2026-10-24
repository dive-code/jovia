const crypto = require("crypto");

module.exports = (app, db, requireUser, requireAdmin) => {
  // ============================================================
  // JOVIA CODES PLUGIN - FINAL FIXED - NO SESSION NEEDED
  // SUPER upgrades, withdrawal codes, admin checks and user audit
  // ============================================================

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

  // ------------------------------------------------------------
  // DATABASE MIGRATIONS
  // ------------------------------------------------------------

  const userColumns = () =>
    db.prepare("PRAGMA table_info(users)").all().map(c => c.name);

  const addUserColumnIfMissing = (name, definition) => {
    if (!userColumns().includes(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    }
  };

  addUserColumnIfMissing("package", "TEXT DEFAULT 'Silver'");
  addUserColumnIfMissing("plan", "TEXT DEFAULT 'Silver'");
  addUserColumnIfMissing("is_super", "INTEGER DEFAULT 0");

  for (const [name, definition] of [
    ["account_status", "TEXT DEFAULT 'active'"],
    ["status", "TEXT DEFAULT 'active'"],
    ["username", "TEXT"],
    ["full_name", "TEXT"]
  ]) {
    try {
      addUserColumnIfMissing(name, definition);
    } catch (error) {
      console.error(`Could not migrate users.${name}:`, error.message);
    }
  }

  const hasColumn = name => userColumns().includes(name);

  const codeColumns = () =>
    db.prepare("PRAGMA table_info(jovia_codes)").all().map(c => c.name);

  const addCodeColumnIfMissing = (name, definition) => {
    if (!codeColumns().includes(name)) {
      db.exec(`ALTER TABLE jovia_codes ADD COLUMN ${name} ${definition}`);
    }
  };

  addCodeColumnIfMissing("used_by", "TEXT DEFAULT ''");
  addCodeColumnIfMissing("used_by_name", "TEXT DEFAULT ''");
  addCodeColumnIfMissing("used_by_email", "TEXT DEFAULT ''");
  addCodeColumnIfMissing("used_by_id", "INTEGER");
  addCodeColumnIfMissing("created_at", "TEXT");
  addCodeColumnIfMissing("used_at", "TEXT");

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------

  const normalizeCode = value =>
    String(value || "").trim().toUpperCase();

  const randomCode = (length, prefix) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let suffix = "";
    for (let i = 0; i < length; i++) {
      suffix += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    return prefix + suffix;
  };

  const getTotalCodes = () =>
    db.prepare("SELECT COUNT(*) AS total FROM jovia_codes").get().total;

  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";

  const getSureUser = user => {
    const email = String(user.email || "").trim();
    const username = String(user.username || "").trim();
    const fullName = String(user.full_name || "").trim();
    const sureName =
      username ||
      fullName ||
      (email ? email.split("@")[0] : "") ||
      `User${user.id}`;
    const sureEmail = email;
    const display = sureEmail
      ? `${sureName} (${sureEmail})`
      : `${sureName} (User ID ${user.id})`;
    return { sureName, sureEmail, display, id: user.id };
  };

  const getRedeemer = row => {
    let user = null;
    if (row.used_by_id != null) {
      user = db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE id = ?`).get(row.used_by_id) || null;
    }
    if (!user) {
      const savedEmail = String(row.used_by_email || "").trim();
      const savedName = String(row.used_by_name || "").trim();
      if (savedEmail) {
        try {
          user = db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE LOWER(TRIM(email)) = LOWER(TRIM(?)) LIMIT 1`).get(savedEmail) || null;
        } catch(e){}
      }
      if (!user && savedName) {
        const userCols = userColumns();
        const possibleConditions = [];
        if (userCols.includes("username")) possibleConditions.push("LOWER(TRIM(username)) = LOWER(TRIM(?))");
        if (userCols.includes("full_name")) possibleConditions.push("LOWER(TRIM(full_name)) = LOWER(TRIM(?))");
        if (possibleConditions.length) {
          const query = `SELECT id, full_name, username, email, phone, package, plan FROM users WHERE ${possibleConditions.join(" OR ")} LIMIT 1`;
          const params = possibleConditions.map(() => savedName);
          try { user = db.prepare(query).get(...params) || null; } catch(e){}
        }
      }
    }
    const storedName = String(row.used_by_name || "").trim();
    const storedEmail = String(row.used_by_email || "").trim();
    const recoveredName = user ? String(user.full_name || user.username || user.email || `User ID ${user.id}`).trim() : "";
    const recoveredEmail = user ? String(user.email || "").trim() : "";
    const name = recoveredName || storedName || "";
    const email = recoveredEmail || storedEmail || "";
    const id = user?.id ?? row.used_by_id ?? null;
    return {
      user,
      name,
      email,
      id,
      display: name ? (email ? `${name} (${email})` : name) : id != null ? `User ID ${id} (name unavailable)` : "Name not saved for this code"
    };
  };

  const safeCodeRecord = row => {
    const used = Number(row.used) === 1;
    const redeemer = used ? getRedeemer(row) : null;
    return {
      code: row.code,
      type: row.type,
      price: row.price,
      used,
      status: used ? "USED" : "UNUSED",
      used_by: row.used_by || "",
      used_by_name: redeemer?.name || row.used_by_name || "",
      used_by_email: redeemer?.email || row.used_by_email || "",
      used_by_id: redeemer?.id ?? row.used_by_id ?? null,
      used_by_display: redeemer?.display || row.used_by || "",
      user_details: used ? { name: redeemer.name || "Name not saved", email: redeemer.email || "", user_id: redeemer.id ?? null, display: redeemer.display } : null,
      created_at: row.created_at || null,
      used_at: row.used_at || null
    };
  };

  // ------------------------------------------------------------
  // AUTHENTICATION - NO SESSION REQUIRED
  // ------------------------------------------------------------

  const userGuard = (req, res, next) => {
    if (typeof requireUser !== "function") {
      return res.status(503).json({ success: false, message: "User authentication is not configured." });
    }
    return requireUser(req, res, () => {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ success: false, message: "Please log in to continue." });
      }
      next();
    });
  };

  const adminGuard = (req, res, next) => {
    const headerPass = String(req.headers["x-admin-password"] || req.headers["x-admin-pass"] || "").trim();
    const bodyPass = String(req.body?.adminPass || req.body?.password || "").trim();
    if ((headerPass && headerPass === ADMIN_PASS) || (bodyPass && bodyPass === ADMIN_PASS) || req.session?.isAdmin === true) {
      return next();
    }
    return res.status(401).json({ success: false, message: "Admin authentication required." });
  };

  const adminLoginHandler = (req, res) => {
    const password = String(req.body?.password || "").trim();
    const username = String(req.body?.username || "admin").trim();
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required." });
    }
    if (password !== ADMIN_PASS) {
      return res.status(401).json({ success: false, message: "Wrong password." });
    }
    // Session is OPTIONAL now - header auth will work even without it
    if (req.session) {
      req.session.isAdmin = true;
      return req.session.save(error => {
        if (error) {
          console.error("Admin session save failed:", error);
          return res.json({ success: true, message: "Login ok (header auth)" });
        }
        return res.json({ success: true });
      });
    }
    return res.json({ success: true, message: "Login successful - header auth" });
  };

  app.post("/api/admin/codes/login", adminLoginHandler);
  app.post("/api/admin/login", adminLoginHandler);
  app.post("/api/admin/codes/logout", (req, res) => {
    if(req.session) req.session.isAdmin = false;
    res.json({ success: true });
  });
  app.post("/api/admin/logout", (req, res) => {
    if(req.session) req.session.isAdmin = false;
    res.json({ success: true });
  });

  // ------------------------------------------------------------
  // GENERATE CODES
  // ------------------------------------------------------------

  app.post("/api/admin/codes/generate", adminGuard, (req, res) => {
    try {
      const requestedType = String(req.body?.type || "").toLowerCase();
      const type =
        requestedType === "gold" || requestedType === "super-gold" ? "super-gold" :
        requestedType === "silver" || requestedType === "super-silver" ? "super-silver" :
        requestedType === "withdraw" ? "withdraw" : null;
      if (!type) return res.status(400).json({ success: false, message: "Invalid code type." });
      const count = Number(req.body?.count ?? 1);
      if (!Number.isInteger(count) || count < 1 || count > 50) return res.status(400).json({ success: false, message: "Choose 1-50." });
      const price = type === "super-gold" ? 12000 : type === "super-silver" ? 16000 : 0;
      const prefix = type === "withdraw" ? "JOVIA-" : "SUPER-";
      const length = type === "withdraw" ? 6 : 8;
      const generateTransaction = db.transaction(() => {
        const generated = [];
        while (generated.length < count) {
          const code = randomCode(length, prefix);
          const result = db.prepare(`INSERT OR IGNORE INTO jovia_codes (code, type, price, used, used_by, used_by_name, used_by_email, used_by_id, created_at, used_at) VALUES (?, ?, ?, 0, '', '', '', NULL, datetime('now'), NULL)`).run(code, type, price);
          if (result.changes === 1) generated.push({ code, type, price, used: false, status: "UNUSED" });
        }
        return generated;
      });
      return res.json({ success: true, codes: generateTransaction(), total: getTotalCodes() });
    } catch (error) {
      console.error("Code generation failed:", error);
      return res.status(500).json({ success: false, message: "Could not generate codes." });
    }
  });

  // ------------------------------------------------------------
  // LIST / CHECK
  // ------------------------------------------------------------

  app.get("/api/admin/codes/list", adminGuard, (req, res) => {
    try {
      const rows = db.prepare(`SELECT * FROM jovia_codes ORDER BY created_at DESC, code ASC`).all();
      return res.json({ success: true, total: rows.length, codes: rows.map(safeCodeRecord) });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Could not load codes." });
    }
  });

  app.get("/api/admin/codes/check/:code", adminGuard, (req, res) => {
    try {
      const code = normalizeCode(req.params.code);
      const row = db.prepare(`SELECT * FROM jovia_codes WHERE code = ?`).get(code);
      if (!row) return res.status(404).json({ success: false, exists: false, message: "Code not found." });
      return res.json({ success: true, exists: true, ...safeCodeRecord(row) });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Could not check code." });
    }
  });

  app.post("/api/upgrade/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);
    if (!raw) return res.status(400).json({ success: false, message: "Enter a SUPER code." });
    try {
      const redeemTransaction = db.transaction(() => {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
        if (!user) throw new Error("USER_NOT_FOUND");
        const code = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(raw);
        if (!code) throw new Error("INVALID");
        if (Number(code.used) === 1) throw new Error("USED");
        if (code.type !== "super-gold" && code.type !== "super-silver") throw new Error("WRONG");
        const sure = getSureUser(user);
        const assignments = ["package = ?", "is_super = ?"];
        const values = ["SUPER", 1];
        if (hasColumn("plan")) { assignments.push("plan = ?"); values.push("SUPER"); }
        if (hasColumn("account_status")) { assignments.push("account_status = ?"); values.push("active"); }
        if (hasColumn("status")) { assignments.push("status = ?"); values.push("active"); }
        values.push(user.id);
        const userUpdate = db.prepare(`UPDATE users SET ${assignments.join(", ")} WHERE id = ?`).run(...values);
        if (userUpdate.changes !== 1) throw new Error("USER_UPDATE_FAILED");
        const codeUpdate = db.prepare(`UPDATE jovia_codes SET used = 1, used_by = ?, used_by_name = ?, used_by_email = ?, used_by_id = ?, used_at = datetime('now') WHERE code = ? AND used = 0`).run(sure.display, sure.sureName, sure.sureEmail, sure.id, raw);
        if (codeUpdate.changes !== 1) throw new Error("CODE_UPDATE_FAILED");
        const savedCode = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(raw);
        const savedUser = db.prepare(`SELECT id, full_name, username, email, package, plan, is_super FROM users WHERE id = ?`).get(user.id);
        return { sure, savedCode, savedUser };
      });
      const result = redeemTransaction();
      return res.json({ success: true, message: `SUPER upgrade successful for ${result.sure.sureName}!`, user: result.savedUser, code: safeCodeRecord(result.savedCode) });
    } catch (error) {
      const responses = { USER_NOT_FOUND: [404, "User not found."], INVALID: [404, "Invalid code."], USED: [409, "Code already used."], WRONG: [400, "Not a SUPER code."], USER_UPDATE_FAILED: [500, "Account update failed."], CODE_UPDATE_FAILED: [409, "Code could not be redeemed."] };
      if (responses[error.message]) { const [s, m] = responses[error.message]; return res.status(s).json({ success: false, message: m }); }
      return res.status(500).json({ success: false, message: "Upgrade failed." });
    }
  });

  app.post("/api/withdraw/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);
    if (!raw) return res.status(400).json({ success: false, message: "Enter a withdrawal code." });
    try {
      const redeemTransaction = db.transaction(() => {
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
        if (!user) throw new Error("USER_NOT_FOUND");
        const row = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(raw);
        if (!row) throw new Error("INVALID");
        if (row.type !== "withdraw") throw new Error("WRONG");
        if (Number(row.used) === 1) { const redeemer = getRedeemer(row); throw new Error(`USED:${redeemer.display}`); }
        const sure = getSureUser(user);
        const update = db.prepare(`UPDATE jovia_codes SET used = 1, used_by = ?, used_by_name = ?, used_by_email = ?, used_by_id = ?, used_at = datetime('now') WHERE code = ? AND used = 0`).run(sure.display, sure.sureName, sure.sureEmail, sure.id, raw);
        if (update.changes !== 1) throw new Error("CODE_UPDATE_FAILED");
        const savedCode = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(raw);
        return { sure, savedCode };
      });
      const result = redeemTransaction();
      return res.json({ success: true, message: `Withdrawal code accepted for ${result.sure.sureName}.`, user: result.sure, code: safeCodeRecord(result.savedCode) });
    } catch (error) {
      if (error.message === "USER_NOT_FOUND") return res.status(404).json({ success: false, message: "User not found." });
      if (error.message === "INVALID") return res.status(404).json({ success: false, message: "Invalid withdrawal code." });
      if (error.message === "WRONG") return res.status(400).json({ success: false, message: "Wrong code type." });
      if (error.message.startsWith("USED:")) return res.status(409).json({ success: false, used: true, message: `❌ Already USED by ${error.message.slice(5)}` });
      if (error.message === "CODE_UPDATE_FAILED") return res.status(409).json({ success: false, message: "Code was just used." });
      return res.status(500).json({ success: false, message: "Could not process withdrawal code." });
    }
  });

  app.get("/api/admin/codes/:code/user", adminGuard, (req, res) => {
    try {
      const code = normalizeCode(req.params.code);
      const row = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(code);
      if (!row) return res.status(404).json({ success: false, message: "Code not found." });
      if (Number(row.used) !== 1) return res.json({ success: true, used: false, message: "Not used." });
      const redeemer = getRedeemer(row);
      return res.json({ success: true, used: true, code: safeCodeRecord(row), user: redeemer.user, redeemer: { name: redeemer.name, email: redeemer.email, id: redeemer.id, display: redeemer.display } });
    } catch (error) {
      return res.status(500).json({ success: false, message: "Could not look up user." });
    }
  });

  console.log("✅ JOVIA Codes FINAL - No session needed, Sure username, No unknown");
};
