
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
  let cols = userColumns();
  if (!cols.includes("package")) db.exec("ALTER TABLE users ADD COLUMN package TEXT DEFAULT 'Silver'");
  cols = userColumns();
  if (!cols.includes("plan")) db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'Silver'");
  cols = userColumns();
  if (!cols.includes("is_super")) db.exec("ALTER TABLE users ADD COLUMN is_super INTEGER DEFAULT 0");
  cols = userColumns();
  if (!cols.includes("account_status")) try{ db.exec("ALTER TABLE users ADD COLUMN account_status TEXT DEFAULT 'active'"); }catch(e){}
  if (!cols.includes("status")) try{ db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'"); }catch(e){}
  cols = userColumns();
  if (!cols.includes("username")) try{ db.exec("ALTER TABLE users ADD COLUMN username TEXT"); }catch(e){}
  if (!cols.includes("full_name")) try{ db.exec("ALTER TABLE users ADD COLUMN full_name TEXT"); }catch(e){}

  const hasColumn = (name) => userColumns().includes(name);
  const randomCode = (length, prefix) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < length; i++) s += alphabet[crypto.randomInt(0, alphabet.length)];
    return prefix + s;
  };
  const normalizeCode = (v) => String(v || "").trim().toUpperCase();
  const getTotalCodes = () => db.prepare("SELECT COUNT(*) AS total FROM jovia_codes").get().total;
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";

  // SURE USERNAME FUNCTION - NO MORE UNKNOWN
  const getSureUser = (user) => {
    const email = String(user.email || "").trim();
    const username = String(user.username || "").trim();
    const fullName = String(user.full_name || "").trim();
    const id = user.id;
    
    // Priority: username -> full_name -> email prefix -> id
    let sureName = username;
    if(!sureName) sureName = fullName;
    if(!sureName) sureName = email.split("@")[0];
    if(!sureName) sureName = "User"+id;
    
    let sureEmail = email || `${sureName}@noemail.com`;
    let display = `${sureName} (${sureEmail})`;
    
    return { sureName, sureEmail, display, id };
  };

  const userGuard = (req, res, next) => {
    if (typeof requireUser !== "function") return res.status(503).json({ success: false, message: "User auth not configured." });
    return requireUser(req, res, () => {
      if (!req.user || !req.user.id) return res.status(401).json({ success: false, message: "Please log in." });
      next();
    });
  };

  const adminGuard = (req, res, next) => {
    const headerPass = req.headers['x-admin-password'] || req.headers['x-admin-pass'] || req.body?.adminPass || req.body?.password;
    const bodyPass = String(req.body?.password || "").trim();
    if(headerPass === ADMIN_PASS || bodyPass === ADMIN_PASS) return next();
    if (req.session && req.session.isAdmin === true) return next();
    return res.status(401).json({ success: false, message: "Admin authentication required" });
  };

  app.post("/api/admin/codes/login", (req, res) => {
    const p = String(req.body?.password || "").trim();
    const u = String(req.body?.username || "admin").trim();
    if(!u || !p) return res.status(400).json({ success: false, message: "Username and password are required." });
    if(p !== ADMIN_PASS) return res.status(401).json({ success: false, message: "Wrong password" });
    if(req.session){ req.session.isAdmin = true; req.session.save(()=>{}); }
    return res.json({ success: true });
  });
  app.post("/api/admin/login", (req, res) => {
    const p = String(req.body?.password || "").trim();
    const u = String(req.body?.username || "admin").trim();
    if(!u || !p) return res.status(400).json({ success: false, message: "Username and password are required." });
    if(p !== ADMIN_PASS) return res.status(401).json({ success: false, message: "Wrong password" });
    if(req.session){ req.session.isAdmin = true; req.session.save(()=>{}); }
    return res.json({ success: true });
  });

  app.post("/api/admin/codes/generate", adminGuard, (req, res) => {
    try {
      const t = String(req.body?.type || "").toLowerCase();
      const type = t === "gold" || t === "super-gold" ? "super-gold" : t === "silver" || t === "super-silver" ? "super-silver" : t === "withdraw" ? "withdraw" : null;
      if (!type) return res.status(400).json({ success: false, message: "Invalid type" });
      const count = Number(req.body?.count) || 1;
      const price = type === "super-gold" ? 12000 : type === "super-silver" ? 16000 : 0;
      const prefix = type === "withdraw" ? "JOVIA-" : "SUPER-";
      const length = type === "withdraw" ? 6 : 8;
      const gen = db.transaction(() => {
        const arr = [];
        while(arr.length < count){
          const code = randomCode(length, prefix);
          const r = db.prepare(`INSERT OR IGNORE INTO jovia_codes (code, type, price, used, created_at) VALUES (?, ?, ?, 0, datetime('now'))`).run(code, type, price);
          if(r.changes === 1) arr.push({ code, type, price });
        }
        return arr;
      });
      const codes = gen();
      return res.json({ success: true, codes, total: getTotalCodes() });
    } catch (e) { return res.status(500).json({ success: false, message: "Could not generate" }); }
  });

  app.get("/api/admin/codes/list", adminGuard, (req, res) => {
    const codes = db.prepare(`SELECT * FROM jovia_codes ORDER BY created_at DESC`).all();
    return res.json({ success: true, total: codes.length, codes });
  });

  app.get("/api/admin/codes/check/:code", adminGuard, (req, res) => {
    const code = normalizeCode(req.params.code);
    const row = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(code);
    if(!row) return res.json({ success: true, exists: false });
    return res.json({ success: true, exists: true, code: row.code, type: row.type, price: row.price, used: row.used, used_by: row.used_by, used_by_name: row.used_by_name, used_by_email: row.used_by_email, used_by_id: row.used_by_id, created_at: row.created_at, used_at: row.used_at });
  });

  // UPGRADE - WITH SURE USERNAME
  app.post("/api/upgrade/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);
    if(!raw) return res.status(400).json({ success: false, message: "Enter code" });
    try{
      const tx = db.transaction(()=>{
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
        if(!user) throw new Error("USER_NOT_FOUND");
        const code = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(raw);
        if(!code) throw new Error("INVALID");
        if(Number(code.used) === 1) throw new Error("USED");
        if(code.type !== "super-gold" && code.type !== "super-silver") throw new Error("WRONG");

        const sure = getSureUser(user);
        
        db.prepare(`UPDATE users SET package='SUPER', is_super=1 WHERE id=?`).run(user.id);
        db.prepare(`UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_by_id=?, used_at=datetime('now') WHERE code=? AND used=0`).run(sure.display, sure.sureName, sure.sureEmail, sure.id, raw);
        return sure;
      });
      const sure = tx();
      return res.json({ success: true, message: `SUPER upgrade successful for ${sure.sureName}!` });
    }catch(e){
      if(e.message==="INVALID") return res.status(404).json({ success: false, message: "Invalid code" });
      if(e.message==="USED") return res.status(409).json({ success: false, message: "Code already used" });
      if(e.message==="WRONG") return res.status(400).json({ success: false, message: "Wrong code type" });
      return res.status(500).json({ success: false, message: "Upgrade failed" });
    }
  });

  // WITHDRAW - WITH SURE USERNAME - FIXED
  app.post("/api/withdraw/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);
    if (!raw) return res.status(400).json({ success: false, message: "Enter withdrawal code." });
    try {
      const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
      if(!user) return res.status(404).json({ success: false, message: "User not found" });
      
      const row = db.prepare("SELECT * FROM jovia_codes WHERE code = ?").get(raw);
      if (!row) return res.status(404).json({ success: false, message: "Invalid withdrawal code." });
      if (row.type !== "withdraw") return res.status(400).json({ success: false, message: "Wrong code type." });
      if (Number(row.used) === 1) {
        const who = row.used_by_name || row.used_by_email || row.used_by || `User ID ${row.used_by_id}`;
        return res.status(409).json({ success: false, message: `❌ Already USED by ${who}` });
      }
      
      const sure = getSureUser(user);
      
      // MARK AS USED WITH SURE USERNAME
      const update = db.prepare(`UPDATE jovia_codes SET used = 1, used_by = ?, used_by_name = ?, used_by_email = ?, used_by_id = ?, used_at = datetime('now') WHERE code = ? AND used = 0`).run(sure.display, sure.sureName, sure.sureEmail, sure.id, raw);
      
      if(update.changes !== 1) return res.status(409).json({ success: false, message: "Code just used by someone else" });
      
      return res.json({ success: true, message: `Withdrawal code accepted for ${sure.sureName}`, user: sure });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "Check failed" });
    }
  });

  console.log("✅ JOVIA Codes FINAL - SURE USERNAME - No more unknown");
};
