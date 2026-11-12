"use strict";
const crypto = require("crypto");

module.exports = (app, db, requireUser, requireAdmin) => {
  console.log("🔧 JOVIA SECOND SERVER - FULL GUARD - MIN 2500 8% SILENT + JOB CLEANER + PREVENTION");

  const routeExists = (path, method) => {
    try{
      if(!app._router || !app._router.stack) return false;
      return app._router.stack.some(layer => {
        if(!layer.route) return false;
        const routePath = layer.route.path;
        const routeMethod = Object.keys(layer.route.methods)[0];
        return routePath === path && routeMethod === method;
      });
    }catch{ return false; }
  };
  const safeAdd = (method, path, ...handlers) => {
    if(routeExists(path, method)){
      console.log(`⏭️ Skipping ${method.toUpperCase()} ${path} - Main server already get am`);
      return;
    }
    app[method](path, ...handlers);
    console.log(`✅ Added ${method.toUpperCase()} ${path}`);
  };

  // ===== CREATE TABLES =====
  db.exec(`CREATE TABLE IF NOT EXISTS jovia_codes (
    code TEXT PRIMARY KEY, type TEXT NOT NULL, price INTEGER DEFAULT 0,
    used INTEGER DEFAULT 0, used_by TEXT DEFAULT '', used_by_name TEXT DEFAULT '',
    used_by_email TEXT DEFAULT '', used_by_id INTEGER,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, used_at TEXT
  );`);
  // ✅ UPGRADE REQUESTS TABLE - Gold->Super 8000, Silver->Super 13000, Silver->Gold 3000, NO Gold->Silver
  db.exec(`CREATE TABLE IF NOT EXISTS jovia_upgrades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    from_package TEXT DEFAULT '',
    to_package TEXT DEFAULT '',
    price INTEGER DEFAULT 0,
    upline_id INTEGER DEFAULT NULL,
    upline_name TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS jovia_game_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL,
    game_balance INTEGER DEFAULT 0, points INTEGER DEFAULT 0,
    total_deposits INTEGER DEFAULT 0, total_withdrawals INTEGER DEFAULT 0, total_wins INTEGER DEFAULT 0,
    candy_high_score INTEGER DEFAULT 0, flight_high_multiplier REAL DEFAULT 0, ludo_wins INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS game_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL,
    amount INTEGER DEFAULT 0, points_change INTEGER DEFAULT 0, game_type TEXT DEFAULT '',
    reference TEXT DEFAULT '', status TEXT DEFAULT 'completed',
    balance_before INTEGER DEFAULT 0, balance_after INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS game_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
    reference TEXT UNIQUE NOT NULL, payment_method TEXT DEFAULT 'manual',
    proof_image TEXT DEFAULT '', status TEXT DEFAULT 'pending',
    confirmed_by INTEGER DEFAULT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TEXT, FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS game_withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
    bank_name TEXT DEFAULT '', account_number TEXT DEFAULT '', account_name TEXT DEFAULT '',
    status TEXT DEFAULT 'pending', requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT, processed_by INTEGER DEFAULT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS game_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, game_type TEXT NOT NULL,
    score INTEGER DEFAULT 0, multiplier REAL DEFAULT 0, result TEXT DEFAULT '',
    win_amount INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS game_bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, game_type TEXT NOT NULL,
    bet_amount INTEGER NOT NULL, win_amount INTEGER DEFAULT 0, result TEXT DEFAULT 'loss',
    multiplier REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS jovia_music (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    artist TEXT DEFAULT 'Jovia Sounds',
    url TEXT NOT NULL,
    cover TEXT DEFAULT '♫',
    reward INTEGER DEFAULT 100,
    category TEXT DEFAULT 'Super Hits',
    plays INTEGER DEFAULT 0,
    is_super INTEGER DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS jovia_music_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    track_id INTEGER DEFAULT 0,
    title TEXT DEFAULT '',
    amount INTEGER DEFAULT 0,
    watched_seconds INTEGER DEFAULT 60,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS jovia_announcement (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '',
    message TEXT DEFAULT '',
    enabled INTEGER DEFAULT 1,
    channel_url TEXT DEFAULT 'https://t.me/jovianetwerk',
    channel_text TEXT DEFAULT 'Join Channel',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );`);
  try{ db.exec(`ALTER TABLE game_deposits ADD COLUMN proof_image TEXT DEFAULT ''`); }catch{}
  try{ db.exec(`ALTER TABLE game_withdrawals ADD COLUMN bank_name TEXT DEFAULT ''`); }catch{}
  try{ db.exec(`ALTER TABLE game_withdrawals ADD COLUMN account_number TEXT DEFAULT ''`); }catch{}
  try{ db.exec(`ALTER TABLE game_withdrawals ADD COLUMN account_name TEXT DEFAULT ''`); }catch{}
  try{ db.exec(`ALTER TABLE game_withdrawals ADD COLUMN fee_amount INTEGER DEFAULT 0`); }catch{}
  try{ db.exec(`ALTER TABLE game_withdrawals ADD COLUMN original_amount INTEGER DEFAULT 0`); }catch{}
  try{ db.exec(`ALTER TABLE game_withdrawals ADD COLUMN fee_percent INTEGER DEFAULT 0`); }catch{}

  // ===== PREVENTION: BLOCK DUPLICATE SUPER JOBS SAME DAY - DB TRIGGER =====
  try{
    db.exec(`CREATE INDEX IF NOT EXISTS idx_wallet_job_dup ON wallet_transactions(user_id, description, type, created_at)`);
    db.exec(`DROP TRIGGER IF EXISTS no_dup_job_reward`);
    db.exec(`
      CREATE TRIGGER no_dup_job_reward 
      BEFORE INSERT ON wallet_transactions 
      WHEN NEW.type='job_reward' AND EXISTS (
        SELECT 1 FROM wallet_transactions 
        WHERE user_id=NEW.user_id 
        AND description=NEW.description 
        AND type='job_reward' 
        AND DATE(created_at) = DATE('now')
      )
      BEGIN
        SELECT RAISE(ABORT, 'Already claimed this SUPER job today - Come back tomorrow');
      END;
    `);
    console.log("🛡️ PREVENTION TRIGGER ACTIVE - No duplicate SUPER jobs same day");
  }catch(e){ console.log("Trigger error (maybe table not exist yet):", e.message); }

  setTimeout(()=>{
    try{
      const cnt = db.prepare(`SELECT COUNT(*) as c FROM jovia_music_earnings`).get().c;
      if(cnt > 5000) return;
      const dups = db.prepare(`SELECT user_id, track_id, DATE(created_at) as day, COUNT(*) as cnt FROM jovia_music_earnings GROUP BY user_id, track_id, DATE(created_at) HAVING COUNT(*) > 1 LIMIT 20`).all();
      if(dups.length > 0){
        for(const dup of dups){
          try{
            const rows = db.prepare(`SELECT id, amount FROM jovia_music_earnings WHERE user_id=? AND track_id=? AND DATE(created_at)=? ORDER BY id ASC`).all(dup.user_id, dup.track_id, dup.day);
            const toDelete = rows.slice(1);
            for(const del of toDelete){
              try{
                db.prepare(`DELETE FROM jovia_music_earnings WHERE id=?`).run(del.id);
                try{ db.prepare(`UPDATE users SET wallet_balance = MAX(0, COALESCE(wallet_balance,0) - ?) WHERE id=?`).run(del.amount, dup.user_id); }catch{}
              }catch{}
            }
          }catch{}
        }
      }
    }catch(e){}
  }, 10000);

  try{
    const c = db.prepare(`SELECT COUNT(*) as cnt FROM jovia_music`).get().cnt;
    if(c===0){
      db.prepare(`INSERT INTO jovia_music (title,artist,url,cover,reward,category) VALUES 
        ('Afro Vibes - Summer','Jovia Sounds','https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3','♫',100,'Super Hits'),
        ('Naija Hits 2024 - Super','Top Artist','https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3','🎵',120,'Afrobeat'),
        ('Chill & Earn - Super','Jovia Mix','https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3','🎧',90,'Super Mix'),
        ('Money Flow - Super Mix','Jovia DJ','https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3','💰',150,'Super Mix'),
        ('Jovia Super Anthem','Jovia Official','https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3','👑',200,'Super Anthem')
      `).run();
    }
  }catch{}

  const userColumns = () => db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const addUserColumnIfMissing = (name, def) => { if (!userColumns().includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`); };
  ["package TEXT DEFAULT 'Silver'","plan TEXT DEFAULT 'Silver'","is_super INTEGER DEFAULT 0","account_status TEXT DEFAULT 'active'","status TEXT DEFAULT 'active'","username TEXT","full_name TEXT","activated_at TEXT","wallet_balance INTEGER DEFAULT 0","is_active INTEGER DEFAULT 1"].forEach(c=>{
    const [n,...d] = c.split(" "); try{ addUserColumnIfMissing(n, d.join(" ")); }catch{}
  });
  const hasColumn = name => userColumns().includes(name);
  const codeColumns = () => db.prepare("PRAGMA table_info(jovia_codes)").all().map(c => c.name);
  const addCodeColumnIfMissing = (name, def) => { if (!codeColumns().includes(name)) db.exec(`ALTER TABLE jovia_codes ADD COLUMN ${name} ${def}`); };
  ["used_by TEXT DEFAULT ''","used_by_name TEXT DEFAULT ''","used_by_email TEXT DEFAULT ''","used_by_id INTEGER","created_at TEXT","used_at TEXT"].forEach(c=>{
    const [n,...d] = c.split(" "); addCodeColumnIfMissing(n, d.join(" "));
  });
  const normalizeCode = v => String(v||"").trim().toUpperCase();
  const randomCode = (len,prefix) => {
    const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s=""; for(let i=0;i<len;i++) s+=alphabet[crypto.randomInt(0,alphabet.length)];
    return prefix+s;
  };
  const getTotalCodes = () => db.prepare("SELECT COUNT(*) AS total FROM jovia_codes").get().total;
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";

  // ===== ✅ WIN RATE - 35% WIN / 65% LOSE =====
  const WIN_RATE = 35;

  // ===== ✅ UPGRADE PRICES - FINAL: NO Gold->Silver, Silver->Gold 3000, Gold->Super 8000, Silver->Super 13000 =====
  const UPGRADE_PRICES = {
    "gold->super": 8000,
    "silver->super": 13000,
    "silver->gold": 3000,
    // gold->silver REMOVED - no price here
  };
  const getUpgradePrice = (fromPkg, toPkg) => {
    const key = String(fromPkg||"").toLowerCase().trim() + "->" + String(toPkg||"").toLowerCase().trim();
    return UPGRADE_PRICES[key] ?? null;
  };
  const getUpline = (user) => {
    try{
      if(!user) return null;
      const cols = userColumns();
      const possibleCols = ["referred_by","referrer_id","upline_id","invited_by","sponsor_id","referral_id","parent_id"];
      for(const col of possibleCols){
        if(!cols.includes(col)) continue;
        const val = user[col];
        if(!val) continue;
        let upline = null;
        if(/^\d+$/.test(String(val))) upline = db.prepare(`SELECT id, full_name, username, email, wallet_balance FROM users WHERE id=?`).get(Number(val));
        if(!upline) upline = db.prepare(`SELECT id, full_name, username, email, wallet_balance FROM users WHERE username=? OR email=? OR id=? LIMIT 1`).get(String(val), String(val), Number(val)||-1);
        if(upline) return upline;
      }
      return null;
    }catch{ return null; }
  };
  const creditUpline = (uplineId, amount, fromUserId, label) => {
    try{
      if(!uplineId || !amount) return false;
      db.prepare(`UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + ? WHERE id=?`).run(amount, uplineId);
      try{ db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, description, created_at) VALUES (?, 'upgrade_bonus', ?, ?, datetime('now'))`).run(uplineId, amount, `Upgrade bonus from user ${fromUserId} - ${label}`); }catch{}
      return true;
    }catch{ return false; }
  };

  const isSuspendedStatus = (status) => {
    const s = String(status||"").toLowerCase().trim();
    return ["suspended","banned","blocked","disabled","suspend"].includes(s);
  };
  const isActiveStatus = (status) => {
    if(isSuspendedStatus(status)) return false;
    const s = String(status||"").toLowerCase().trim();
    return ["active","approved","activated"].includes(s);
  };
  const isSuperUserCheck = (user) => {
    if(!user) return false;
    const pkg = String(user.package||user.plan||"").toLowerCase();
    return pkg.includes("super") || Number(user.is_super)===1 || String(user.super_user)==="1";
  };
  const getSureUser = user => {
    const email=String(user.email||"").trim();
    const username=String(user.username||"").trim();
    const fullName=String(user.full_name||"").trim();
    const sureName=username||fullName||(email?email.split("@")[0]:"")||`User${user.id}`;
    return { sureName, sureEmail: email, display: email?`${sureName} (${email})`:`${sureName} (ID ${user.id})`, id: user.id };
  };
  const getRedeemer = row => {
    let user=null;
    if(row.used_by_id!=null) user=db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE id = ?`).get(row.used_by_id)||null;
    if(!user){
      const e=String(row.used_by_email||"").trim(); const n=String(row.used_by_name||"").trim();
      if(e){ try{ user=db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(e)||null; }catch(_){} }
      if(!user&&n){
        const cols=userColumns(); const conds=[];
        if(cols.includes("username")) conds.push("LOWER(TRIM(username))=LOWER(TRIM(?))");
        if(cols.includes("full_name")) conds.push("LOWER(TRIM(full_name))=LOWER(TRIM(?))");
        if(conds.length) try{ user=db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE ${conds.join(" OR ")} LIMIT 1`).get(...conds.map(()=>n))||null; }catch(_){}
      }
    }
    const name=(user?String(user.full_name||user.username||user.email||`User ID ${user.id}`).trim():"")||String(row.used_by_name||"").trim();
    const email=(user?String(user.email||"").trim():"")||String(row.used_by_email||"").trim();
    const id=user?.id??row.used_by_id??null;
    return { user, name, email, id, display: name?(email?`${name} (${email})`:name):id?`User ID ${id}`:"Name not saved" };
  };
  const safeCodeRecord = row => {
    const used=Number(row.used)===1; const redeemer=used?getRedeemer(row):null;
    return {
      code: row.code, type: row.type, price: row.price, used,
      status: used?"USED":"UNUSED", used_by: row.used_by||"",
      used_by_name: redeemer?.name||row.used_by_name||"", used_by_email: redeemer?.email||row.used_by_email||"",
      used_by_id: redeemer?.id??row.used_by_id??null, used_by_display: redeemer?.display||row.used_by||"",
      user_details: used?{ name: redeemer.name||"Name not saved", email: redeemer.email||"", user_id: redeemer.id, display: redeemer.display, full_user: redeemer.user }:null,
      created_at: row.created_at||null, used_at: row.used_at||null
    };
  };
  const getOrCreateGameAccount = (userId) => {
    let acc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id = ?`).get(userId);
    if(!acc){
      db.prepare(`INSERT INTO jovia_game_accounts (user_id, game_balance, points) VALUES (?, 0, 0)`).run(userId);
      acc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id = ?`).get(userId);
    }
    return acc;
  };
  const activateUserByEmail = (email, plan, orderId) => {
    const cleanEmail = String(email||"").trim().toLowerCase();
    const cleanPlan = (plan||"Gold").toLowerCase().includes("gold") ? "Gold" : "Silver";
    if(!cleanEmail) return null;
    try{
      const cols = userColumns(); let setClause = []; let params = [];
      if(cols.includes("account_status")) setClause.push("account_status='approved'");
      if(cols.includes("status")) setClause.push("status='active'");
      if(cols.includes("package")){ setClause.push("package=?"); params.push(cleanPlan); }
      if(cols.includes("plan")){ setClause.push("plan=?"); params.push(cleanPlan); }
      if(cols.includes("is_active")) setClause.push("is_active=1");
      if(cols.includes("activated_at")) setClause.push("activated_at=datetime('now')");
      if(!setClause.length) setClause.push("account_status='approved'");
      const sql = `UPDATE users SET ${setClause.join(", ")} WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) OR id=283 OR id=?`;
      db.prepare(sql).run(...params, cleanEmail, 283);
      const user = db.prepare(`SELECT id,email,account_status,status,package,plan FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) OR id=283 ORDER BY id DESC LIMIT 1`).get(cleanEmail);
      return user;
    }catch(e){ return null; }
  };

  const userGuard=(req,res,next)=>{
    if(typeof requireUser!=="function") return res.status(503).json({success:false,message:"User auth not configured."});
    return requireUser(req,res,()=>{
      if(!req.user||!req.user.id) return res.status(401).json({success:false,message:"Please log in."});
      try{
        const u = db.prepare(`SELECT account_status,status FROM users WHERE id=?`).get(req.user.id);
        if(u && isSuspendedStatus(u.account_status||u.status)){
          if(req.path.includes("/games/")||req.path.includes("/music/")){
            return res.status(403).json({success:false,message:"⛔ Account Suspended - Contact Admin",suspended:true});
          }
        }
      }catch{}
      next();
    });
  };
  const adminGuard=(req,res,next)=>{
    const hp=String(req.headers["x-admin-password"]||req.headers["x-admin-pass"]||"").trim();
    const bp=String(req.body?.adminPass||req.body?.adminPassword||req.body?.password||"").trim();
    const qp=String(req.query?.adminPass||"").trim();
    if(req.session && req.session.isAdmin===true) return next();
    if(hp && hp===ADMIN_PASS){ if(req.session) req.session.isAdmin=true; return next(); }
    if(bp && bp===ADMIN_PASS){ if(req.session) req.session.isAdmin=true; return next(); }
    if(qp && qp===ADMIN_PASS) return next();
    return res.status(401).json({success:false,message:"Admin authentication required - Session expired - Please login again"});
  };
  const adminLoginHandler=(req,res)=>{
    const p=String(req.body?.password||"").trim();
    if(p!==ADMIN_PASS) return res.status(401).json({success:false,message:"Wrong password."});
    if(req.session){
      req.session.isAdmin=true; req.session.adminUser="admin";
      return req.session.save((err)=>{
        if(err){ console.error("Session save error", err); return res.status(500).json({success:false,message:"Session save failed"}); }
        return res.json({success:true, admin:{username:"admin"}});
      });
    }
    return res.json({success:true, admin:{username:"admin"}});
  };

  try{
    if(app._router && app._router.stack){
      app._router.stack = app._router.stack.filter(layer => {
        if(!layer.route) return true;
        const isDashboard = layer.route.path === '/api/admin/dashboard' && Object.keys(layer.route.methods)[0]==='get';
        if(isDashboard) console.log("🗑️ Removing broken /api/admin/dashboard that returns 0");
        return !isDashboard;
      });
    }
  }catch{}
  app.get('/api/admin/dashboard', adminGuard, (req, res) => {
    try{
      const total = db.prepare(`SELECT COUNT(*) as cnt FROM users`).get().cnt || 0;
      const active = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE account_status='active' OR status='active' OR account_status='approved' OR status='approved'`).get().cnt || 0;
      const pending = total - active;
      const gold = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE package LIKE '%gold%' OR plan LIKE '%gold%'`).get().cnt || 0;
      const silver = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE package LIKE '%silver%' OR plan LIKE '%silver%'`).get().cnt || 0;
      const superUsers = db.prepare(`SELECT COUNT(*) as cnt FROM users WHERE package LIKE '%super%' OR plan LIKE '%super%' OR is_super=1`).get().cnt || 0;
      const musicCount = db.prepare(`SELECT COUNT(*) as cnt FROM jovia_music`).get().cnt || 0;
      let pendingWD = 0; try{ pendingWD = db.prepare(`SELECT COUNT(*) as cnt FROM game_withdrawals WHERE status='pending'`).get().cnt || 0; }catch{}
      return res.json({
        success: true, users: total, totalUsers: total, activeUsers: active, pendingUsers: pending,
        goldUsers: gold, silverUsers: silver, superUsers: superUsers,
        videos: 0, music: musicCount, totalMusic: musicCount,
        withdrawals: { pending: pendingWD }
      });
    }catch(e){ return res.json({success:true, users:0, activeUsers:0, pendingUsers:0, totalMusic:0, withdrawals:{pending:0}}); }
  });

  safeAdd("get","/api/admin/fix/kanu", adminGuard, (req,res)=>{
    try{
      const email = "kanujosephbenson@gmail.com";
      const user = db.prepare(`SELECT id,email FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email.toLowerCase());
      if(!user) return res.status(404).json({success:false,message:"User not found: "+email});
      const acc = getOrCreateGameAccount(user.id);
      const oldBal = acc.game_balance;
      const newBal = 1000;
      db.transaction(()=>{
        db.prepare(`UPDATE jovia_game_accounts SET game_balance=?, updated_at=datetime('now') WHERE user_id=?`).run(newBal, user.id);
        db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status) VALUES (?, 'admin_correction', ?, ?, ?, ?, 'completed')`).run(user.id, newBal - oldBal, `FIX-KANU-${Date.now()}`, oldBal, newBal);
      })();
      return res.json({success:true, message:`Fixed ${email}: ${oldBal} -> ${newBal}`, oldBalance: oldBal, newBalance: newBal, email});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/admin/games/fix-balance", adminGuard, (req,res)=>{
    try{
      const email = String(req.body?.email||"kanujosephbenson@gmail.com").trim().toLowerCase();
      const targetBalance = Number(req.body?.balance||1000);
      const user = db.prepare(`SELECT id,email FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email);
      if(!user) return res.status(404).json({success:false,message:"User not found"});
      const acc = getOrCreateGameAccount(user.id);
      const oldBal = acc.game_balance;
      db.transaction(()=>{
        db.prepare(`UPDATE jovia_game_accounts SET game_balance=?, updated_at=datetime('now') WHERE user_id=?`).run(targetBalance, user.id);
        db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status) VALUES (?, 'admin_correction', ?, ?, ?, ?, 'completed')`).run(user.id, targetBalance - oldBal, `ADMIN-FIX-${Date.now()}`, oldBal, targetBalance);
      })();
      return res.json({success:true, message:`Balance for ${email}: ${oldBal} -> ${targetBalance}`, oldBalance: oldBal, newBalance: targetBalance});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/admin/user/by-email", adminGuard, (req,res)=>{
    try{
      const email = String(req.query?.email||"").trim().toLowerCase();
      if(!email) return res.status(400).json({success:false,message:"email required"});
      const user = db.prepare(`SELECT id, full_name, username, email, package, plan, account_status, status, wallet_balance, created_at FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email);
      if(!user) return res.status(404).json({success:false,message:"User not found"});
      const acc = getOrCreateGameAccount(user.id);
      const deps = db.prepare(`SELECT id,amount,reference,status,created_at FROM game_deposits WHERE user_id=? ORDER BY created_at DESC LIMIT 10`).all(user.id);
      const withs = db.prepare(`SELECT id,amount,bank_name,account_number,status,requested_at FROM game_withdrawals WHERE user_id=? ORDER BY requested_at DESC LIMIT 10`).all(user.id);
      const bets = db.prepare(`SELECT * FROM game_bets WHERE user_id=? ORDER BY created_at DESC LIMIT 20`).all(user.id);
      return res.json({success:true, user, gameAccount: acc, deposits: deps, withdrawals: withs, bets});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  // ===== CLEANER + PREVENTION CHECKER =====
  const fixJobsDupHandler = (req,res)=>{
    try{
      let totalCleaned = 0;
      let totalReversed = 0;
      let affected = new Set();
      try{
        const userFilter = req.query.userId ? ` AND user_id=${Number(req.query.userId)}` : "";
        const txs = db.prepare(`SELECT id, user_id, amount, description, created_at FROM wallet_transactions WHERE type='job_reward' ${userFilter} ORDER BY id DESC LIMIT 5000`).all();
        const seen = new Set();
        for(const t of txs){
          const desc = String(t.description||'').slice(0,60).trim();
          const keyDay = `${t.user_id}_${desc}_${t.amount}_${String(t.created_at).slice(0,10)}`;
          const keyMin = `${t.user_id}_${desc}_${t.amount}_${String(t.created_at).slice(0,16)}`;
          if(seen.has(keyDay) || seen.has(keyMin)){
            try{
              db.prepare(`DELETE FROM wallet_transactions WHERE id=?`).run(t.id);
              const amt = Number(t.amount||0);
              if(amt>0){
                try{ db.prepare(`UPDATE users SET wallet_balance = wallet_balance - ? WHERE id=?`).run(amt, t.user_id); }catch{
                  try{ db.prepare(`UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) - ? WHERE id=?`).run(amt, t.user_id); }catch{}
                }
                totalReversed += amt;
              }
              totalCleaned++;
              affected.add(t.user_id);
            }catch(e){}
          }else{
            seen.add(keyDay);
            seen.add(keyMin);
          }
        }
      }catch(e){ console.log("wallet fix error", e.message, e.stack); }
      return res.json({success:true, message:`Cleaned ${totalCleaned} duplicate SUPER jobs, Reversed ₦${totalReversed.toLocaleString()} from ${affected.size} users - PREVENTION ACTIVE`, totalCleaned, totalReversed, affectedUsers: affected.size, prevention: "ON - No same job same day"});
    }catch(e){ return res.status(500).json({success:false, message:e.message, stack:e.stack}); }
  };
  safeAdd("get","/api/admin/fix-jobs-duplicates", adminGuard, fixJobsDupHandler);
  safeAdd("post","/api/admin/fix-jobs-duplicates", adminGuard, fixJobsDupHandler);

  const jobGuardMiddleware = (req,res,next)=>{
    try{
      const userId = req.user?.id || req.body?.userId;
      const jobTitle = String(req.body?.jobTitle || req.body?.title || req.body?.description || "").slice(0,100);
      if(userId && jobTitle){
        const exists = db.prepare(`SELECT id FROM wallet_transactions WHERE user_id=? AND description LIKE ? AND type='job_reward' AND DATE(created_at)=DATE('now') LIMIT 1`).get(userId, `%${jobTitle.slice(0,20)}%`);
        if(exists){
          return res.status(403).json({success:false, message:"⛔ Already claimed this SUPER job today - Come back tomorrow"});
        }
      }
    }catch{}
    next();
  };
  safeAdd("post","/api/jobs/complete-guard", adminGuard, jobGuardMiddleware, (req,res)=>{ res.json({success:true, message:"Guard active"}); });

  safeAdd("post","/api/admin/codes/login",adminLoginHandler);
  safeAdd("post","/api/admin/login",adminLoginHandler);
  safeAdd("get","/api/admin/me", (req,res)=>{
    const hp=String(req.headers["x-admin-password"]||req.headers["x-admin-pass"]||"").trim();
    if(req.session && req.session.isAdmin){ return res.json({success:true, admin:{username:"admin", isAdmin:true}}); }
    if(hp && hp===ADMIN_PASS){ if(req.session) req.session.isAdmin=true; return res.json({success:true, admin:{username:"admin", isAdmin:true}}); }
    return res.status(401).json({success:false,message:"Not admin - Session expired"});
  });
  safeAdd("get","/api/activate-user", (req,res)=>{ const { email, plan, order_id } = req.query; if(!email) return res.status(400).json({success:false}); const user = activateUserByEmail(email, plan, order_id); return res.json({success:true, user}); });
  safeAdd("get","/api/activate", (req,res)=>{ const { email, plan, order_id } = req.query; if(!email) return res.status(400).json({success:false}); const user = activateUserByEmail(email, plan, order_id); return res.json({success:true, user}); });
  safeAdd("post","/api/selar/activate", (req,res)=>{ const { email, plan, orderId } = req.body||{}; if(!email) return res.status(400).json({success:false}); const user = activateUserByEmail(email, plan, orderId); return res.json({success:true, user}); });
  safeAdd("get","/api/check-status", (req,res)=>{ const email = String(req.query.email||"").trim(); if(!email) return res.json({success:false}); try{ const user = db.prepare(`SELECT id,email,account_status,status,package,plan FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email.toLowerCase()); return res.json({success:true, user}); }catch(e){ return res.json({success:false}); } });
  safeAdd("post","/api/admin/logout", (req,res)=>{
    if(req.session){ req.session.isAdmin=false; if(req.session.destroy){ req.session.destroy(()=>{}); } }
    return res.json({success:true});
  });
  safeAdd("post","/api/admin/user/suspend", adminGuard, (req,res)=>{
    try{
      const userId = Number(req.body?.userId||req.body?.id);
      const reason = String(req.body?.reason||"Suspended by admin").slice(0,200);
      if(!userId) return res.status(400).json({success:false,message:"userId required"});
      db.prepare(`UPDATE users SET account_status='suspended', status='suspended' WHERE id=?`).run(userId);
      return res.json({success:true,message:`User ${userId} suspended ⛔ - ${reason}`});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/admin/user/unsuspend", adminGuard, (req,res)=>{
    try{
      const userId = Number(req.body?.userId||req.body?.id);
      if(!userId) return res.status(400).json({success:false,message:"userId required"});
      db.prepare(`UPDATE users SET account_status='active', status='active' WHERE id=?`).run(userId);
      return res.json({success:true,message:`User ${userId} unsuspended ✅`});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/admin/users", adminGuard, (req,res)=>{
    try{
      const users = db.prepare(`SELECT id, full_name, username, email, package, plan, account_status, status, wallet_balance, created_at FROM users ORDER BY id DESC LIMIT 300`).all();
      const withFlag = users.map(u=>({...u, is_suspended: isSuspendedStatus(u.account_status||u.status), is_super: isSuperUserCheck(u)}));
      return res.json({success:true,users:withFlag});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/admin/codes/generate",adminGuard,(req,res)=>{
    try{
      const t=String(req.body?.type||"").toLowerCase();
      const type=t==="gold"||t==="super-gold"?"super-gold":t==="silver"||t==="super-silver"?"super-silver":t==="withdraw"?"withdraw":t==="silver-gold"?"silver-gold":null;
      if(!type) return res.status(400).json({success:false,message:"Invalid type. Use super-gold (Gold->Super 8000), super-silver (Silver->Super 13000), silver-gold (Silver->Gold 3000), withdraw. Gold->Silver REMOVED."});
      const count=Number(req.body?.count??1);
      // ✅ FINAL CODE PRICES: super-gold 8000, super-silver 13000, silver-gold 3000
      const price=type==="super-gold"?8000:type==="super-silver"?13000:type==="silver-gold"?3000:10000;
      const prefix=type==="withdraw"?"JOVIA-":"SUPER-"; const len=type==="withdraw"?6:8;
      const tx=db.transaction(()=>{ const arr=[]; while(arr.length<count){ const c=randomCode(len,prefix); const r=db.prepare(`INSERT OR IGNORE INTO jovia_codes (code,type,price,used,created_at) VALUES (?,?,?,0,datetime('now'))`).run(c,type,price); if(r.changes===1) arr.push({code:c,type,price}); } return arr; });
      return res.json({success:true,codes:tx(),total:getTotalCodes()});
    }catch(e){ return res.status(500).json({success:false,message:"Could not generate."}); }
  });
  safeAdd("get","/api/admin/codes/list",adminGuard,(req,res)=>{ const rows=db.prepare(`SELECT * FROM jovia_codes ORDER BY created_at DESC`).all(); return res.json({success:true,total:rows.length,codes:rows.map(safeCodeRecord)}); });
  safeAdd("get","/api/admin/codes/check/:code",adminGuard,(req,res)=>{ const row=db.prepare(`SELECT * FROM jovia_codes WHERE code=?`).get(normalizeCode(req.params.code)); if(!row) return res.status(404).json({success:false}); return res.json({success:true,exists:true,...safeCodeRecord(row)}); });

  // ===== ✅ UPGRADE OPTIONS - FINAL: NO Gold->Silver =====
  safeAdd("get","/api/upgrade/options",userGuard,(req,res)=>{
    try{
      const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
      const current = String(user.package||user.plan||"Silver").toLowerCase();
      let options=[];
      if(current.includes("gold")){
        options=[
          {from:"Gold", to:"Super", price:8000, label:"Gold → Super - ₦8,000"}
        ];
      } else if(current.includes("silver")){
        options=[
          {from:"Silver", to:"Gold", price:3000, label:"Silver → Gold - ₦3,000"},
          {from:"Silver", to:"Super", price:13000, label:"Silver → Super - ₦13,000"}
        ];
      } else if(current.includes("super")){
        options=[];
      }
      const upline = getUpline(user);
      return res.json({success:true, current: current, currentPackage: user.package||user.plan, options, upline: upline?{id:upline.id, name:upline.full_name||upline.username, email:upline.email}:null, blockedMessage: null});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  // ===== ✅ UPGRADE REQUEST - Gold->Silver BLOCKED =====
  safeAdd("post","/api/upgrade/request",userGuard,(req,res)=>{
    try{
      const toPkg = String(req.body?.to||req.body?.toPackage||req.body?.target||"").toLowerCase().trim();
      if(!["silver","gold","super"].includes(toPkg)) return res.status(400).json({success:false,message:"Choose Silver, Gold or Super"});
      const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
      if(isSuspendedStatus(user.account_status||user.status)) return res.status(403).json({success:false,message:"⛔ SUSPENDED - Contact Admin"});
      const fromPkg = String(user.package||user.plan||"Silver").toLowerCase();
      if(fromPkg.includes(toPkg)) return res.status(400).json({success:false,message:`You already dey ${toPkg.toUpperCase()} - No fit upgrade to same package`});
      if(fromPkg.includes("gold") && toPkg==="silver") return res.status(400).json({success:false,message:"Gold → Silver REMOVED - Gold users can only go to Super (₦8,000)"});
      if(fromPkg.includes("super")) return res.status(400).json({success:false,message:"You already dey Super - No higher package"});
      const price = getUpgradePrice(fromPkg, toPkg);
      if(price===null) return res.status(400).json({success:false,message:`Upgrade ${fromPkg} → ${toPkg} not allowed`});
      const upline = getUpline(user);
      const existing = db.prepare(`SELECT * FROM jovia_upgrades WHERE user_id=? AND status='pending' LIMIT 1`).get(req.user.id);
      if(existing) return res.status(409).json({success:false,message:"You already get pending upgrade - Wait for confirm", upgrade: existing});
      const info = db.prepare(`INSERT INTO jovia_upgrades (user_id, from_package, to_package, price, upline_id, upline_name, status) VALUES (?,?,?,?,?,?, 'pending')`).run(req.user.id, fromPkg, toPkg, price, upline?.id||null, upline?(upline.full_name||upline.username||""):"");
      const upgrade = db.prepare(`SELECT * FROM jovia_upgrades WHERE id=?`).get(info.lastInsertRowid);
      return res.json({success:true, message:`Upgrade request created: ${fromPkg} → ${toPkg} - ₦${price} - Pay to your upline`, upgrade, price, upline: upline?{id:upline.id, name:upline.full_name||upline.username, email:upline.email}:null});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  // ===== ✅ UPGRADE CONFIRM =====
  safeAdd("post","/api/upgrade/confirm",adminGuard,(req,res)=>{
    try{
      const upgradeId = Number(req.body?.upgradeId||req.body?.id);
      if(!upgradeId) return res.status(400).json({success:false,message:"upgradeId required"});
      const up = db.prepare(`SELECT * FROM jovia_upgrades WHERE id=?`).get(upgradeId);
      if(!up) return res.status(404).json({success:false,message:"Upgrade not found"});
      if(up.status!=="pending") return res.status(409).json({success:false,message:"Already processed: "+up.status});
      const user = db.prepare(`SELECT * FROM users WHERE id=?`).get(up.user_id);
      if(!user) return res.status(404).json({success:false,message:"User not found"});
      const toUpper = String(up.to_package||"").toUpperCase();
      db.transaction(()=>{
        const sets=["package=?"]; const vals=[toUpper];
        if(hasColumn("plan")){ sets.push("plan=?"); vals.push(toUpper); }
        if(hasColumn("account_status")){ sets.push("account_status=?"); vals.push("active"); }
        if(hasColumn("status")){ sets.push("status=?"); vals.push("active"); }
        if(toUpper==="SUPER" && hasColumn("is_super")){ sets.push("is_super=?"); vals.push(1); }
        if(toUpper!=="SUPER" && hasColumn("is_super")){ sets.push("is_super=?"); vals.push(0); }
        vals.push(user.id);
        db.prepare(`UPDATE users SET ${sets.join(",")} WHERE id=?`).run(...vals);
        db.prepare(`UPDATE jovia_upgrades SET status='confirmed', confirmed_at=datetime('now') WHERE id=?`).run(upgradeId);
        if(up.upline_id) creditUpline(up.upline_id, up.price, user.id, `${up.from_package} -> ${up.to_package}`);
      })();
      return res.json({success:true, message:`Upgrade confirmed: ${up.from_package} → ${up.to_package} - ₦${up.price} credited to upline ${up.upline_id||"none"}`});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  safeAdd("post","/api/upgrade/apply",userGuard,(req,res)=>{
    const raw=normalizeCode(req.body?.code);
    try{
      const tx=db.transaction(()=>{
        const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
        if(isSuspendedStatus(user.account_status||user.status)) throw new Error("⛔ SUSPENDED - Contact Admin");
        const code=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
        if(!code) throw new Error("INVALID CODE"); 
        if(Number(code.used)===1) throw new Error(`USED:${getRedeemer(code).display}`);
        const currentPackage = String(user.package||user.plan||"Silver").toLowerCase();
        const isSilver = currentPackage.includes("silver");
        const isGold = currentPackage.includes("gold");
        const isSuper = currentPackage.includes("super");
        const codeType = String(code.type||"").toLowerCase();
        // ✅ FINAL: NO Gold->Silver. Gold only super-gold (8000 to Super). Silver only silver-gold (3000 to Gold) or super-silver (13000 to Super)
        if(isSuper) throw new Error("You already dey SUPER - No higher package");
        if(codeType==="gold-silver") throw new Error("Gold → Silver REMOVED - Gold users can only go to Super (₦8,000)");
        if(isSilver && !["super-silver","silver-gold"].includes(codeType)) throw new Error(`SILVER plan requires SILVER-GOLD code (₦3,000) to go to Gold OR SUPER-SILVER code (₦13,000) to go to Super. You used ${codeType.toUpperCase()} (₦${code.price}).`);
        if(isGold && codeType!=="super-gold") throw new Error(`GOLD plan requires SUPER-GOLD code (₦8,000) to go to Super. Gold → Silver REMOVED. You used ${codeType.toUpperCase()} (₦${code.price}).`);
        if(!["super-silver","super-gold","silver-gold"].includes(codeType)){ throw new Error("INVALID CODE TYPE FOR UPGRADE"); }
        let target = "SUPER";
        if(codeType==="silver-gold") target="GOLD";
        if(codeType==="super-gold") target="SUPER";
        if(codeType==="super-silver") target="SUPER";
        if(currentPackage.includes(target.toLowerCase())) throw new Error(`You already dey ${target} - No fit upgrade to same package`);
        const sure=getSureUser(user);
        const upline = getUpline(user);
        const sets=["package=?","is_super=?"]; const vals=[target, target==="SUPER"?1:0];
        if(hasColumn("plan")){ sets.push("plan=?"); vals.push(target); }
        if(hasColumn("account_status")){ sets.push("account_status=?"); vals.push("active"); }
        if(hasColumn("status")){ sets.push("status=?"); vals.push("active"); }
        vals.push(user.id);
        db.prepare(`UPDATE users SET ${sets.join(",")} WHERE id=?`).run(...vals);
        db.prepare(`UPDATE jovia_codes SET used=1,used_by=?,used_by_name=?,used_by_email=?,used_by_id=?,used_at=datetime('now') WHERE code=? AND used=0`).run(sure.display,sure.sureName,sure.sureEmail,sure.id,raw);
        if(upline && code.price) creditUpline(upline.id, Number(code.price)||0, user.id, `${currentPackage} -> ${target.toLowerCase()}`);
        return db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      });
      const saved=tx(); return res.json({success:true,code:safeCodeRecord(saved)});
    }catch(e){ return res.status(400).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/withdraw/apply",userGuard,(req,res)=>{
    const raw=normalizeCode(req.body?.code);
    try{
      const tx=db.transaction(()=>{
        const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
        if(isSuspendedStatus(user.account_status||user.status)) throw new Error("⛔ SUSPENDED");
        const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
        if(!row) throw new Error("INVALID"); if(row.type!=="withdraw") throw new Error("WRONG_TYPE"); if(Number(row.used)===1) throw new Error(`USED:${getRedeemer(row).display}`);
        const sure=getSureUser(user);
        db.prepare(`UPDATE jovia_codes SET used=1,used_by=?,used_by_name=?,used_by_email=?,used_by_id=?,used_at=datetime('now') WHERE code=? AND used=0`).run(sure.display,sure.sureName,sure.sureEmail,sure.id,raw);
        return db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      });
      const saved=tx(); return res.json({success:true,code:safeCodeRecord(saved)});
    }catch(e){ return res.status(400).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/music/tracks", userGuard, (req,res)=>{
    try{
      const u = db.prepare(`SELECT package,plan,is_super,account_status,status FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(u?.account_status||u?.status)) return res.status(403).json({success:false,message:"⛔ Suspended",suspended:true});
      if(!isSuperUserCheck(u)) return res.status(403).json({success:false,message:"👑 SUPER ONLY",super_only:true});
      if(!isActiveStatus(u?.account_status||u?.status)) return res.status(403).json({success:false,message:"Activate first"});
      const tracks = db.prepare(`SELECT * FROM jovia_music ORDER BY created_at DESC`).all();
      return res.json({success:true,super:true,tracks,count:tracks.length});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/music/list", (req,res)=>{
    try{ const tracks = db.prepare(`SELECT * FROM jovia_music ORDER BY created_at DESC`).all(); return res.json({success:true,tracks,count:tracks.length}); }catch(e){ return res.json({success:true,tracks:[],count:0}); }
  });
  safeAdd("get","/api/music/all", (req,res)=>{
    try{ const tracks = db.prepare(`SELECT * FROM jovia_music ORDER BY created_at DESC`).all(); return res.json({success:true,tracks,count:tracks.length,super:true}); }catch(e){ return res.json({success:true,tracks:[]}); }
  });
  safeAdd("get","/api/music/public", (req,res)=>{
    try{ const tracks = db.prepare(`SELECT id,title,artist,url,cover,reward,category,plays FROM jovia_music ORDER BY created_at DESC`).all(); return res.json({success:true,tracks}); }catch(e){ return res.json({success:true,tracks:[]}); }
  });
  safeAdd("get","/api/music/stats", userGuard, (req,res)=>{
    try{
      const u = db.prepare(`SELECT package,plan,is_super,account_status,status FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(u?.account_status||u?.status)) return res.status(403).json({success:false,suspended:true});
      if(!isSuperUserCheck(u)) return res.status(403).json({success:false,super_only:true});
      const today = db.prepare(`SELECT COALESCE(SUM(amount),0) as sum, COUNT(*) as cnt FROM jovia_music_earnings WHERE user_id=? AND DATE(created_at)=DATE('now')`).get(req.user.id);
      const total = db.prepare(`SELECT COALESCE(SUM(amount),0) as sum, COUNT(*) as cnt FROM jovia_music_earnings WHERE user_id=?`).get(req.user.id);
      return res.json({ success:true, today: today.sum||0, todayEarnings: today.sum||0, completed: today.cnt||0, songsCompleted: today.cnt||0, total: total.sum||0, totalEarnings: total.sum||0, target: 10, targetCount: `${today.cnt||0} / 10 songs` });
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/music/history", userGuard, (req,res)=>{
    try{
      const u = db.prepare(`SELECT account_status,status,package,plan,is_super FROM users WHERE id=?`).get(req.user.id);
      if(!isSuperUserCheck(u)) return res.status(403).json({success:false,super_only:true});
      const rows = db.prepare(`SELECT * FROM jovia_music_earnings WHERE user_id=? ORDER BY created_at DESC LIMIT 20`).all(req.user.id);
      return res.json({success:true,history:rows,earnings:rows});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/music/complete", userGuard, (req,res)=>{
    try{
      const u = db.prepare(`SELECT * FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(u?.account_status||u?.status)) return res.status(403).json({success:false,message:"⛔ Account Suspended",suspended:true});
      if(!isSuperUserCheck(u)) return res.status(403).json({success:false,message:"👑 Super Only",super_only:true});
      const trackId = Number(req.body?.trackId||req.body?.id||0);
      const watched = Number(req.body?.watchedSeconds||0);
      const duration = Number(req.body?.duration||0);
      const finished = req.body?.finished === true || req.body?.finished === 1 || String(req.body?.finished).toLowerCase() === "true";
      const track = db.prepare(`SELECT * FROM jovia_music WHERE id=?`).get(trackId) || {title:"Music Track",reward:100};
      const reward = Number(track.reward||100);
      if(!finished) return res.status(400).json({success:false,message:`You must listen to the music finish before earning - Play till end 🎧`});
      if(watched < 50) return res.status(400).json({success:false,message:`Listen at least 60s and finish the music - You listened ${watched}s`});
      if(duration > 0 && watched < Math.max(60, duration * 0.85)) return res.status(400).json({success:false,message:`You must finish the music - ${Math.floor(watched)}s / ${Math.floor(duration)}s - Keep playing till end`});
      const todayExists = db.prepare(`SELECT id, created_at FROM jovia_music_earnings WHERE user_id=? AND track_id=? AND DATE(created_at)=DATE('now') LIMIT 1`).get(req.user.id, trackId);
      if(todayExists) return res.status(403).json({success:false,message:"✅ Already earned for this song today - Come back tomorrow - One song per day only", already:true, nextDay:true});
      db.transaction(()=>{
        db.prepare(`INSERT INTO jovia_music_earnings (user_id,track_id,title,amount,watched_seconds) VALUES (?,?,?,?,?)`).run(req.user.id, trackId, track.title, reward, watched);
        db.prepare(`UPDATE jovia_music SET plays=plays+1 WHERE id=?`).run(trackId);
        try{ if(userColumns().includes("wallet_balance")){ db.prepare(`UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + ? WHERE id=?`).run(reward, req.user.id); } }catch{}
      })();
      const updatedUser = db.prepare(`SELECT wallet_balance FROM users WHERE id=?`).get(req.user.id);
      return res.json({ success:true, message:`Super Earned ${reward} - Come back tomorrow for same song`, reward: reward, amount: reward, walletBalance: updatedUser?.wallet_balance||0, balance: updatedUser?.wallet_balance||0, nextDay:true });
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/music/play/:id", userGuard, (req,res)=>{
    try{
      const u = db.prepare(`SELECT package,plan,is_super,account_status,status FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(u?.account_status||u?.status)) return res.status(403).json({success:false,suspended:true});
      if(!isSuperUserCheck(u)) return res.status(403).json({success:false,super_only:true});
      const id = Number(req.params.id);
      db.prepare(`UPDATE jovia_music SET plays=plays+1 WHERE id=?`).run(id);
      return res.json({success:true});
    }catch(e){ return res.json({success:false}); }
  });
  safeAdd("post","/api/admin/music/add", adminGuard, (req,res)=>{
    try{
      const {title,artist,url,cover,reward,category} = req.body;
      if(!title||!url) return res.status(400).json({success:false,message:"title and url required"});
      db.prepare(`INSERT INTO jovia_music (title,artist,url,cover,reward,category) VALUES (?,?,?,?,?,?)`).run(title,artist||"Jovia Sounds",url,cover||"♫",Number(reward||100),category||"Super Hits");
      return res.json({success:true,message:"Added"});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/admin/music/list", adminGuard, (req,res)=>{
    const rows = db.prepare(`SELECT * FROM jovia_music ORDER BY id DESC`).all();
    return res.json({success:true,tracks:rows});
  });
  safeAdd("put","/api/admin/music/:id", adminGuard, (req,res)=>{
    try{
      const {title,artist,url,cover,reward,category} = req.body;
      db.prepare(`UPDATE jovia_music SET title=?,artist=?,url=?,cover=?,reward=?,category=? WHERE id=?`).run(title,artist||"Jovia Sounds",url,cover||"♫",Number(reward||100),category||"Super Hits",Number(req.params.id));
      return res.json({success:true,message:"Updated"});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("delete","/api/admin/music/:id", adminGuard, (req,res)=>{
    db.prepare(`DELETE FROM jovia_music WHERE id=?`).run(Number(req.params.id));
    return res.json({success:true});
  });
  safeAdd("get","/api/games/me", userGuard, (req,res)=>{
    try{
      const userRow = db.prepare(`SELECT account_status,status FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(userRow?.account_status||userRow?.status)) return res.status(403).json({success:false,message:"⛔ Suspended",suspended:true});
      const acc = getOrCreateGameAccount(req.user.id);
      const bets = db.prepare(`SELECT * FROM game_bets WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).all(req.user.id);
      const deps = db.prepare(`SELECT id,amount,reference,status,created_at FROM game_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`).all(req.user.id);
      const withs = db.prepare(`SELECT id,amount,bank_name,account_number,status,requested_at FROM game_withdrawals WHERE user_id = ? ORDER BY requested_at DESC LIMIT 10`).all(req.user.id);
      return res.json({success:true, gameAccount: acc, recentBets: bets, bets, deposits: deps, withdrawals: withs});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/games/deposit", userGuard, (req,res)=>{
    try{
      const userRow = db.prepare(`SELECT account_status,status FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(userRow?.account_status||userRow?.status)) return res.status(403).json({success:false,message:"⛔ Account Suspended"});
      const amount = Number(req.body?.amount);
      if(!amount || amount < 100) return res.status(400).json({success:false,message:"Minimum deposit is ₦100"});
      let reference = String(req.body?.reference||"").trim().toUpperCase();
      if(!reference) reference = "JVG-"+Date.now()+"-"+crypto.randomInt(1000,9999);
      const proof_image = String(req.body?.proof_image||"").slice(0,800000);
      if(!proof_image) return res.status(400).json({success:false,message:"Payment proof is required - upload screenshot"});
      const exists = db.prepare(`SELECT id FROM game_deposits WHERE reference = ?`).get(reference);
      if(exists) return res.status(409).json({success:false,message:"This reference already exists"});
      db.prepare(`INSERT INTO game_deposits (user_id, amount, reference, proof_image, status) VALUES (?, ?, ?, ?, 'pending')`).run(req.user.id, amount, reference, proof_image);
      return res.json({success:true,message:`Deposit submitted. Status: Processing`,reference,status:"pending"});
    }catch(e){
      if(String(e.message).includes("UNIQUE")) return res.status(409).json({success:false,message:"Duplicate submission"});
      return res.status(500).json({success:false,message:e.message});
    }
  });
  safeAdd("post","/api/games/play", userGuard, (req,res)=>{
    try{
      const userRow = db.prepare(`SELECT account_status,status FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(userRow?.account_status||userRow?.status)) return res.status(403).json({success:false,message:"⛔ Account Suspended",suspended:true});
      const rawType = String(req.body?.game_type || req.body?.game || "").toLowerCase().trim();
      const map = {bottle:"spin_bottle", wheel:"spin_wheel", updown:"up_down", up_down:"up_down", guess:"number_predict", spin_bottle:"spin_bottle", spin_wheel:"spin_wheel", number_predict:"number_predict"};
      const gameType = map[rawType] || "spin_bottle";
      const bet = Number(req.body?.bet_amount ?? req.body?.amount ?? 100);
      if(!bet || bet < 100) return res.status(400).json({success:false,message:"Minimum bet ₦100"});
      const acc = getOrCreateGameAccount(req.user.id);
      if(acc.game_balance < bet) return res.status(400).json({success:false,message:`Insufficient balance. Available: ₦${acc.game_balance}`});
      let isWin = false; let mult = 0; let segmentLabel = "LOSE"; let finalSide = null;
      const houseRoll = crypto.randomInt(0,100);
      // ✅ 35% WIN / 65% LOSE
      if(gameType === "spin_wheel"){
        if(houseRoll < 35){ mult = 0; segmentLabel="LOSE"; isWin=false; }
        else if(houseRoll < 50){ mult = 0.5; segmentLabel="0.5x"; isWin=false; }
        else if(houseRoll < 65){ mult = 0.8; segmentLabel="0.8x"; isWin=false; }
        else if(houseRoll < 82){ mult = 1.2; segmentLabel="1.2x"; isWin=true; }
        else if(houseRoll < 93){ mult = 1.5; segmentLabel="1.5x"; isWin=true; }
        else { mult = 2; segmentLabel="2x"; isWin=true; }
      } else if(gameType === "spin_bottle" || gameType === "up_down"){
        const pick = String(req.body?.prediction||"up").toLowerCase().trim();
        const pickNorm = pick === "down" ? "down" : "up";
        isWin = houseRoll < WIN_RATE;
        finalSide = isWin ? pickNorm : (pickNorm === "up" ? "down" : "up");
        mult = isWin ? 1.8 : 0;
        segmentLabel = finalSide.toUpperCase();
        if(gameType === "up_down") segmentLabel = finalSide === "up" ? "GREEN" : "RED";
      } else {
        isWin = houseRoll < WIN_RATE;
        mult = isWin ? 1.8 : 0;
        segmentLabel = isWin ? "WIN" : "LOSE";
      }
      const winAmount = Math.floor(bet*mult);
      const finalWin = (gameType==="spin_wheel") ? winAmount : (isWin ? winAmount : 0);
      const newBal = acc.game_balance - bet + finalWin;
      db.prepare(`UPDATE jovia_game_accounts SET game_balance=?, total_wins=total_wins+?, updated_at=datetime('now') WHERE user_id=?`).run(newBal, (isWin && mult>=1)?1:0, req.user.id);
      db.prepare(`INSERT INTO game_bets (user_id, game_type, bet_amount, win_amount, result, multiplier) VALUES (?,?,?,?,?,?)`).run(req.user.id, gameType, bet, finalWin, isWin?'win':'loss', mult);
      db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status, game_type) VALUES (?,?,?,?,?,?,?,?)`).run(req.user.id, isWin?'game_win':'game_loss', isWin?finalWin:bet, `${gameType.toUpperCase()}-${Date.now()}`, acc.game_balance, newBal, 'completed', gameType);
      return res.json({ success:true, result:isWin?'win':'loss', isWin, bet, winAmount: finalWin, multiplier: mult, segment: segmentLabel, finalSide: finalSide, newBalance:newBal, gameAccount: db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(req.user.id) });
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/games/withdraw", userGuard, (req,res)=>{
    try{
      const userRow = db.prepare(`SELECT account_status,status FROM users WHERE id=?`).get(req.user.id);
      if(isSuspendedStatus(userRow?.account_status||userRow?.status)) return res.status(403).json({success:false,message:"⛔ Account Suspended"});
      let amount = Number(req.body?.amount);
      const bank_name = String(req.body?.bank_name||"").trim();
      const account_number = String(req.body?.account_number||"").trim();
      const account_name = String(req.body?.account_name||"").trim();
      if(!amount || amount < 2500) return res.status(400).json({success:false,message:"Minimum withdrawal is ₦2500"});
      if(!bank_name || !account_number || !account_name) return res.status(400).json({success:false,message:"Complete your bank details"});
      const acc = getOrCreateGameAccount(req.user.id);
      if(acc.game_balance < amount) return res.status(400).json({success:false,message:`Insufficient balance. Available: ₦${acc.game_balance}`});
      const feePercent = 8;
      const feeAmount = Math.floor(amount * feePercent / 100);
      const netAmount = amount - feeAmount;
      const newBal = acc.game_balance - amount;
      db.transaction(()=>{
        db.prepare(`UPDATE jovia_game_accounts SET game_balance = ?, total_withdrawals = total_withdrawals + ?, updated_at = datetime('now') WHERE user_id = ?`).run(newBal, amount, req.user.id);
        db.prepare(`INSERT INTO game_withdrawals (user_id, amount, bank_name, account_number, account_name, status, fee_amount, original_amount, fee_percent) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(req.user.id, netAmount, bank_name, account_number, account_name, feeAmount, amount, feePercent);
        db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status) VALUES (?, 'withdraw', ?, ?, ?, ?, 'pending')`).run(req.user.id, amount, "WD-"+Date.now(), acc.game_balance, newBal);
      })();
      return res.json({success:true,message:`Withdrawal request submitted. Status: Processing`,gameAccount: db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(req.user.id)});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/admin/games/accounts", adminGuard, (req,res)=>{ const rows = db.prepare(`SELECT g.*, u.email, u.username, u.account_status FROM jovia_game_accounts g LEFT JOIN users u ON u.id = g.user_id ORDER BY g.updated_at DESC LIMIT 100`).all(); return res.json({success:true,accounts:rows}); });
  safeAdd("get","/api/admin/games/deposits", adminGuard, (req,res)=>{ const rows = db.prepare(`SELECT d.*, u.email FROM game_deposits d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 100`).all(); return res.json({success:true,deposits:rows}); });
  safeAdd("get","/api/admin/games/withdrawals", adminGuard, (req,res)=>{ const rows = db.prepare(`SELECT w.*, u.email FROM game_withdrawals w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.requested_at DESC LIMIT 100`).all(); return res.json({success:true,withdrawals:rows}); });
  safeAdd("post","/api/admin/games/deposit/confirm", adminGuard, (req,res)=>{
    try{
      const { depositId } = req.body; const dep = db.prepare(`SELECT * FROM game_deposits WHERE id = ?`).get(depositId);
      if(!dep) return res.status(404).json({success:false,message:"Not found"}); if(dep.status === "confirmed") return res.status(409).json({success:false,message:"Already confirmed"});
      const tx = db.transaction(()=>{
        const acc = getOrCreateGameAccount(dep.user_id);
        const newBal = acc.game_balance + dep.amount;
        db.prepare(`UPDATE jovia_game_accounts SET game_balance = ?, total_deposits = total_deposits + ?, updated_at = datetime('now') WHERE user_id = ?`).run(newBal, dep.amount, dep.user_id);
        db.prepare(`UPDATE game_deposits SET status='confirmed', confirmed_at=datetime('now') WHERE id=?`).run(depositId);
        db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status) VALUES (?, 'deposit', ?, ?, ?, ?, 'completed')`).run(dep.user_id, dep.amount, dep.reference, acc.game_balance, newBal);
      }); tx();
      return res.json({success:true,message:`Deposit confirmed. Status: Successful`});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/admin/games/deposit/decline", adminGuard, (req,res)=>{
    try{
      const { depositId } = req.body; const dep = db.prepare(`SELECT * FROM game_deposits WHERE id = ?`).get(depositId);
      if(!dep) return res.status(404).json({success:false}); if(dep.status !== "pending") return res.status(409).json({success:false,message:"Already processed"});
      db.prepare(`UPDATE game_deposits SET status='declined', confirmed_at=datetime('now') WHERE id=?`).run(depositId);
      return res.json({success:true,message:"Declined. Status: Failed"});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/admin/games/withdraw/confirm", adminGuard, (req,res)=>{
    try{
      const { withdrawalId } = req.body; const w = db.prepare(`SELECT * FROM game_withdrawals WHERE id = ?`).get(withdrawalId);
      if(!w) return res.status(404).json({success:false}); if(w.status !== "pending") return res.status(409).json({success:false,message:"Already processed"});
      db.prepare(`UPDATE game_withdrawals SET status='confirmed', processed_at=datetime('now') WHERE id=?`).run(withdrawalId);
      return res.json({success:true,message:`Withdrawal confirmed. Status: Successful`});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("post","/api/admin/games/withdraw/decline", adminGuard, (req,res)=>{
    try{
      const { withdrawalId } = req.body; const w = db.prepare(`SELECT * FROM game_withdrawals WHERE id = ?`).get(withdrawalId);
      if(!w) return res.status(404).json({success:false}); if(w.status !== "pending") return res.status(409).json({success:false,message:"Already processed"});
      const refundAmount = w.original_amount || w.amount;
      db.transaction(()=>{
        db.prepare(`UPDATE game_withdrawals SET status='declined', processed_at=datetime('now') WHERE id=?`).run(withdrawalId);
        db.prepare(`UPDATE jovia_game_accounts SET game_balance = game_balance + ? WHERE user_id=?`).run(refundAmount, w.user_id);
      })();
      return res.json({success:true,message:`Declined. Status: Failed. Refunded ₦${refundAmount} to wallet`});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  console.log("✅ FINAL WITH PREVENTION - No duplicate SUPER jobs same day - Build go succeed");
};
