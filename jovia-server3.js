"use strict";

module.exports = (app, db, requireUser, requireAdmin) => {
  try{
  console.log("🔧 JOVIA SERVER 3 - BALANCE HISTORY + BALANCE ADD/DEDUCT + AFFILIATE + BACKPAY + SUSPEND");

  if(!app || typeof app.get !== "function" || typeof app.post !== "function"){
    console.log("⚠️ Server3 skip: app.get/app.post no dey - no crash");
    return;
  }

  // ============================================================
  // ✅ BLOCK OTHER SERVERS BACKPAY - ONLY SERVER 3 BACKPAY GO WORK
  // Crash-proof: everything inside try/catch, e no go crash Vercel
  // ============================================================
  const BLOCKED_BACKPAY_PATHS = [
    "/api/admin/backpay",
    "/api/admin/backpay-all",
    "/api/admin/approve",
    "/api/admin/users/approve",
  ];
  const isBlockedBackpayPath = (p) => {
    try{
      if(typeof p !== "string") return false;
      return BLOCKED_BACKPAY_PATHS.includes(p) || p.includes("backpay");
    }catch{ return false; }
  };

  let server3Allow = false;
  const withServer3Allow = (fn) => { server3Allow = true; try{ fn(); } finally{ server3Allow = false; } };

  // Patch app.get / app.post ONCE - block other servers from adding backpay after Server 3 load
  try{
    if(!app.__joviaServer3BlockerInstalled){
      app.__joviaServer3BlockerInstalled = true;
      const origGet = app.get.bind(app);
      const origPost = app.post.bind(app);
      app.get = function(path, ...handlers){
        try{
          if(!server3Allow && isBlockedBackpayPath(path)){
            console.log(`🚫 BLOCKED other server backpay: GET ${path} - only Server 3 backpay go work`);
            return app;
          }
        }catch{}
        return origGet(path, ...handlers);
      };
      app.post = function(path, ...handlers){
        try{
          if(!server3Allow && isBlockedBackpayPath(path)){
            console.log(`🚫 BLOCKED other server backpay: POST ${path} - only Server 3 backpay go work`);
            return app;
          }
        }catch{}
        return origPost(path, ...handlers);
      };
      console.log("✅ Server3 Blocker installed - other servers backpay BLOCKED");
    }
  }catch(e){ console.log("⚠️ Server3 blocker install skip (no crash):", e.message); }

  const routeExists = (path, method) => {
    try{
      if(!app._router || !app._router.stack) return false;
      return app._router.stack.some(l => {
        if(!l.route) return false;
        return l.route.path === path && Object.keys(l.route.methods)[0] === method;
      });
    }catch{ return false; }
  };
  const safeAdd = (method, path, ...handlers) => {
    try{
      if(routeExists(path, method)){
        console.log(`⏭️ Server3 Skipping ${method.toUpperCase()} ${path} - already get am`);
        return;
      }
      withServer3Allow(()=>{ app[method](path, ...handlers); });
      console.log(`✅ Server3 Added ${method.toUpperCase()} ${path}`);
    }catch(e){ console.log("⚠️ Server3 safeAdd skip (no crash):", e.message); }
  };
  // ✅ FORCE ADD - for backpay/approve only: remove old route first, so Server 3 must win
  const forceAdd = (method, path, ...handlers) => {
    try{
      if(app._router && app._router.stack){
        app._router.stack = app._router.stack.filter(l => {
          if(!l.route) return true;
          if(l.route.path !== path) return true;
          return !(Object.keys(l.route.methods)[0] === method);
        });
      }
    }catch{}
    try{ withServer3Allow(()=>{ app[method](path, ...handlers); }); }catch(e){ console.log("⚠️ Server3 forceAdd skip (no crash):", e.message); return; }
    console.log(`✅ Server3 FORCE Added ${method.toUpperCase()} ${path}`);
  };

  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";
  const userColumns = () => { try{ return db.prepare("PRAGMA table_info(users)").all().map(c => c.name); }catch{ return []; } };
  const hasColumn = n => userColumns().includes(n);
  try{ if(!hasColumn("affiliate_balance")) db.exec(`ALTER TABLE users ADD COLUMN affiliate_balance INTEGER DEFAULT 0`); }catch{}
  try{ if(!hasColumn("referral_balance")) db.exec(`ALTER TABLE users ADD COLUMN referral_balance INTEGER DEFAULT 0`); }catch{}

  const adminGuard = (req,res,next) => {
    const hp = String(req.headers["x-admin-password"]||req.headers["x-admin-pass"]||"").trim();
    const bp = String(req.body?.adminPass||req.body?.adminPassword||req.body?.password||"").trim();
    const qp = String(req.query?.adminPass||"").trim();
    if(req.session && req.session.isAdmin===true) return next();
    if(hp && hp===ADMIN_PASS){ if(req.session) req.session.isAdmin=true; return next(); }
    if(bp && bp===ADMIN_PASS){ if(req.session) req.session.isAdmin=true; return next(); }
    if(qp && qp===ADMIN_PASS) return next();
    return res.status(401).json({success:false,message:"Admin authentication required"});
  };

  // === SERVER 3 AUTH - FOR BACKPAY + SUSPEND - FIXED FOR VERCEL DASHBOARD ===
  const server3AdminGuard = (req,res,next) => {
    try{
      if(req.query.key === 'jovia123') return next();
      if(req.query.adminPass === ADMIN_PASS) return next();
      if(req.query.adminPass && req.query.adminPass === 'jovia123') return next();
      const hKey = String(req.headers['x-admin-key'] || "").trim();
      const hPass = String(req.headers['x-admin-password'] || req.headers['x-admin-pass'] || "").trim();
      const hToken = String(req.headers['x-admin-token'] || "").trim();
      if(hKey === 'jovia123') return next();
      if(hPass === ADMIN_PASS) return next();
      if(hToken === 'jovia123' || hToken === ADMIN_PASS) return next();
      const b = req.body || {};
      if(b.key === 'jovia123') return next();
      if(b.adminPass === ADMIN_PASS || b.adminPassword === ADMIN_PASS || b.password === ADMIN_PASS) return next();
      if(req.session && req.session.isAdmin===true) return next();
      if(req.admin) return next();
      const auth = String(req.headers.authorization || req.headers.Authorization || "").trim();
      if(auth){
        const token = auth.replace(/^Bearer\s+/i, "").trim();
        if(token === 'jovia123' || token === ADMIN_PASS) return next();
        try{
          const secret = process.env.JWT_SECRET || process.env.JWTSECRET || "jovia-secret";
          const jwt = require("jsonwebtoken");
          const decoded = jwt.verify(token, secret);
          if(decoded && (decoded.role === 'admin' || decoded.isAdmin || decoded.admin)) { req.admin = decoded; return next(); }
        }catch{}
        try{
          const parts = token.split(".");
          if(parts.length === 3){
            const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
            if(payload && (payload.role === 'admin' || payload.isAdmin || payload.admin)) { req.admin = payload; return next(); }
          }
        }catch{}
      }
      if(typeof requireAdmin === 'function') return requireAdmin(req,res,next);
      return res.status(401).json({success:false,message:"Admin authentication required - Session expired - Please login again"});
    }catch(e){ return res.status(401).json({success:false,message:"Admin authentication required - Session expired - Please login again"}); }
  };

  // === BACKPAY HELPERS - SEPARATE ===
  const findReferrerForUser = (u, cols) => {
    const list = ["referrer_id","referred_by","referrer","upline_id","invited_by","sponsor_id","referral_id","parent_id","invite_by","referred_by_code","referral_code_used"];
    for(const col of list){
      if(!cols.includes(col)) continue;
      const raw = u[col];
      if(!raw) continue;
      const s = String(raw).trim();
      if(!s) continue;
      let r = null;
      if(/^\d+$/.test(s)) r = db.prepare("SELECT * FROM users WHERE id=?").get(Number(s));
      if(!r){ try{ r = db.prepare("SELECT * FROM users WHERE referral_code=? OR username=? OR email=? LIMIT 1").get(s,s,s); }catch{} }
      if(!r){ try{ r = db.prepare("SELECT * FROM users WHERE username=? OR email=? LIMIT 1").get(s,s); }catch{} }
      if(!r){ try{ const cr = db.prepare("SELECT * FROM referral_codes WHERE code=? LIMIT 1").get(s); if(cr && cr.user_id) r = db.prepare("SELECT * FROM users WHERE id=?").get(cr.user_id); }catch{} }
      if(r && r.id !== u.id) return {referrer:r, col, raw:s};
    }
    return {referrer:null, col:null, raw:null};
  };

  // ============================================================
  // ✅ BLOCKER - SAME PERSON + SAME AMOUNT = BLOCK
  // Same person + HIGHER amount = ALLOW, but pay ONLY difference, NO ADD UP FULL
  // Same person + LOWER amount = BLOCK
  // ============================================================
  const getAlreadyPaidForPerson = (referrer, referredUser) => {
    const uid = referredUser.id;
    const uname = String(referredUser.username||"").toLowerCase();
    const rid = referrer ? referrer.id : null;
    let fromRewards = 0;
    let fromRefWallet = 0;
    let fromUpgradeWallet = 0;
    try{
      const row = db.prepare("SELECT * FROM referral_rewards WHERE referred_user_id=?").get(uid);
      if(row) fromRewards = Number(row.amount||0);
    }catch{}
    try{
      if(rid){
        const row = db.prepare("SELECT COALESCE(SUM(amount),0) as total FROM wallet_transactions WHERE user_id=? AND reference=?").get(rid, `REF_${uid}`);
        if(row) fromRefWallet = Number(row.total||0);
      }
    }catch{}
    try{
      if(rid){
        const rows = db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND (type LIKE '%upgrade%' OR description LIKE '%upgrade%' OR reference LIKE '%UPGRADE%')").all(rid);
        for(const tx of rows){
          const desc = String(tx.description||"").toLowerCase();
          const ref = String(tx.reference||"");
          const isForThisUser = (uname && desc.includes(uname)) || desc.includes(String(uid)) || ref.includes(String(uid));
          if(!isForThisUser) continue;
          if(ref === `REF_${uid}`) continue;
          fromUpgradeWallet += Number(tx.amount||0);
        }
      }
    }catch{}
    const base = Math.max(fromRewards, fromRefWallet);
    const total = base + fromUpgradeWallet;
    return { total, fromRewards, fromRefWallet, fromUpgradeWallet };
  };

  const payReferralForUser = (referredUser) => {
    try{
      if(!referredUser || !referredUser.id) return {paid:0, reason:"no user"};
      db.exec(`CREATE TABLE IF NOT EXISTS referral_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER NOT NULL,
        referred_user_id INTEGER NOT NULL UNIQUE,
        amount INTEGER DEFAULT 0,
        referrer_package TEXT DEFAULT '',
        referred_package TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );`);
      db.exec(`CREATE TABLE IF NOT EXISTS welcome_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        amount INTEGER DEFAULT 0,
        package TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );`);
      const cols = userColumns();
      const pkgRaw = String(referredUser.package || referredUser.plan || referredUser.membership || "").toUpperCase().trim();
      let pkg = pkgRaw;
      if(pkgRaw.includes("SILVER") || pkgRaw.includes("BASIC") || pkgRaw.includes("STARTER")) pkg = "SILVER";
      else if(pkgRaw.includes("GOLD")) pkg = "GOLD";
      else if(pkgRaw.includes("SUPER") || pkgRaw.includes("PLATINUM") || pkgRaw.includes("DIAMOND") || pkgRaw.includes("VIP")) pkg = "SUPER";
      else return {paid:0, reason:"no package: "+pkgRaw};

      let correct = 0;
      let welcomeBonus = 0;
      if(pkg === "SILVER"){ correct = 8000; welcomeBonus = 9000; }
      else if(pkg === "GOLD"){ correct = 13000; welcomeBonus = 15000; }
      else if(pkg === "SUPER"){ correct = 19000; welcomeBonus = 21000; }

      let welcomePaid = 0;
      const welcomeExisting = db.prepare("SELECT * FROM welcome_rewards WHERE user_id=?").get(referredUser.id);
      let welcomeAlreadyInTx = null;
      try{ welcomeAlreadyInTx = db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND (reference=? OR type='welcome_bonus') LIMIT 1").get(referredUser.id, `WELCOME_${referredUser.id}`); }catch{}
      if(!welcomeExisting && !welcomeAlreadyInTx && welcomeBonus > 0){
        try{ db.prepare("INSERT INTO welcome_rewards (user_id, amount, package) VALUES (?,?,?)").run(referredUser.id, welcomeBonus, pkg); }catch{}
        try{ db.prepare("UPDATE users SET wallet_balance = COALESCE(wallet_balance,0) + ?, balance = COALESCE(balance,0) + ? WHERE id=?").run(welcomeBonus, welcomeBonus, referredUser.id); }catch{}
        try{ db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, balance_type, reference, description, created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(referredUser.id, "welcome_bonus", welcomeBonus, "wallet", `WELCOME_${referredUser.id}`, `Welcome bonus - ${pkg} activated`); }catch{}
        welcomePaid = welcomeBonus;
      } else if(!welcomeExisting && welcomeAlreadyInTx){
        try{ db.prepare("INSERT OR IGNORE INTO welcome_rewards (user_id, amount, package) VALUES (?,?,?)").run(referredUser.id, Number(welcomeAlreadyInTx.amount||welcomeBonus), pkg); }catch{}
        console.log(`🚫 BLOCKER welcome: ${referredUser.username} same person + same amount ₦${welcomeAlreadyInTx.amount} don enter before - BLOCKED`);
      }

      const {referrer} = findReferrerForUser(referredUser, cols);
      if(!referrer) return {paid:0, reason:"no referrer found", welcomePaid, welcomeBonus, package:pkg};

      const paidInfo = getAlreadyPaidForPerson(referrer, referredUser);
      const alreadyPaid = paidInfo.total;

      if(alreadyPaid === correct){
        console.log(`🚫 BLOCKER: ${referredUser.username} same person + same amount ₦${correct} don enter before - BLOCKED`);
        return {paid:0, reason:"blocked - same person + same amount", alreadyPaid, correct, welcomePaid, welcomeBonus, package:pkg, blocked:true};
      }
      if(alreadyPaid > correct){
        console.log(`🚫 BLOCKER: ${referredUser.username} same person don already collect higher ₦${alreadyPaid} > ₦${correct} - BLOCKED`);
        return {paid:0, reason:"blocked - already collected higher amount", alreadyPaid, correct, welcomePaid, welcomeBonus, package:pkg, blocked:true};
      }
      const toPay = correct - alreadyPaid;
      try{
        const dup = db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND amount=? AND description LIKE ? LIMIT 1").get(referrer.id, toPay, `%${referredUser.username}%`);
        if(dup && String(dup.description||"").toLowerCase().includes("upgrade")){
          console.log(`🚫 BLOCKER: ${referredUser.username} same person + same difference ₦${toPay} don enter before - BLOCKED`);
          return {paid:0, reason:"blocked - same person + same difference amount", alreadyPaid, correct, welcomePaid, welcomeBonus, package:pkg, blocked:true};
        }
      }catch{}
      if(toPay <= 0) return {paid:0, reason:"blocked - same person + same amount", alreadyPaid, correct, welcomePaid, welcomeBonus, package:pkg, blocked:true};

      const existing = db.prepare("SELECT * FROM referral_rewards WHERE referred_user_id=?").get(referredUser.id);
      if(existing){
        db.prepare("UPDATE referral_rewards SET amount=? WHERE referred_user_id=?").run(correct, referredUser.id);
      } else {
        db.prepare("INSERT INTO referral_rewards (referrer_id, referred_user_id, amount, referrer_package, referred_package) VALUES (?,?,?,?,?)").run(referrer.id, referredUser.id, correct, referrer.package, referredUser.package);
      }
      if(cols.includes("referral_balance")){
        db.prepare("UPDATE users SET referral_balance = COALESCE(referral_balance,0) + ? WHERE id=?").run(toPay, referrer.id);
      }
      try{
        db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, balance_type, reference, description, created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(referrer.id, "referral_reward", toPay, "referral", `REF_${referredUser.id}`, `Referral bonus - ${referredUser.username} ${referredUser.package} approved`);
      }catch{
        try{ db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?,?,?,?)").run(referrer.id, "referral_reward", toPay, `Referral bonus - ${referredUser.username} ${referredUser.package} approved`); }catch{}
      }
      return {paid:toPay, referrer:referrer.username, referrer_id:referrer.id, correct, alreadyPaid, welcomePaid, welcomeBonus, package:pkg};
    }catch(e){ return {paid:0, reason:e.message}; }
  };

  const backpayHandler = (req,res) => {
    try{
      let allActivated = [];
      try{ allActivated = db.prepare("SELECT * FROM users WHERE account_status IN ('active','approved') ORDER BY id ASC").all(); }catch{}
      if(allActivated.length===0){
        try{ allActivated = db.prepare("SELECT * FROM users WHERE status IN ('active','approved') ORDER BY id ASC").all(); }catch{}
      }
      let paidCount = 0, totalPaid = 0, welcomeCount = 0, totalWelcome = 0, details = [];
      let skippedNoReferrer = 0, blockedCount = 0;
      for(const u of allActivated){
        try{
          const bonus = payReferralForUser(u);
          if(bonus.welcomePaid > 0){ welcomeCount++; totalWelcome += bonus.welcomePaid; }
          if(bonus.paid > 0){
            paidCount++; totalPaid += bonus.paid;
            details.push({referrer: bonus.referrer, referrer_id: bonus.referrer_id, referred: u.username, referred_id: u.id, package: u.package, alreadyPaid: bonus.alreadyPaid||0, correct: bonus.correct, paid: bonus.paid, welcomePaid: bonus.welcomePaid||0});
          } else {
            if(bonus.reason === "no referrer found") skippedNoReferrer++;
            else if(bonus.blocked) blockedCount++;
          }
        }catch{}
      }
      return res.json({success:true, message:`Backpay done - Referral: ${paidCount} people, ₦${totalPaid} | Welcome: ${welcomeCount} people, ₦${totalWelcome} | Checked ${allActivated.length}, No-referrer: ${skippedNoReferrer}, BLOCKED (same person + same amount): ${blockedCount}`, paidCount, totalPaid, welcomeCount, totalWelcome, details, skippedNoReferrer, blockedCount, totalActivated: allActivated.length});
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };
  forceAdd("get", "/api/admin/backpay-all", server3AdminGuard, backpayHandler);
  forceAdd("get", "/api/admin/backpay", server3AdminGuard, backpayHandler);
  const approveHandler = (req,res) => {
    try{
      const userId = Number(req.body?.userId || req.body?.id || req.body?.user_id || req.query.id || req.query.userId || req.params.id);
      if(!userId) return res.status(400).json({success:false, message:"User ID required"});
      const before = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      if(!before) return res.status(404).json({success:false, message:"User not found"});
      try{ db.prepare("UPDATE users SET account_status='approved' WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET status='active' WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET account_status='active' WHERE id=?").run(userId); }catch{}
      const fresh = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      const bonus = payReferralForUser(fresh);
      return res.json({success:true, message:`User approved. Referral bonus: ₦${bonus.paid} to ${bonus.referrer||'none'} | Welcome bonus: ₦${bonus.welcomePaid||0} to user`, user:{id:fresh.id, username:fresh.username, package:fresh.package, account_status:fresh.account_status}, referralBonus: bonus});
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };
  forceAdd("post", "/api/admin/approve", server3AdminGuard, approveHandler);
  forceAdd("post", "/api/admin/users/approve", server3AdminGuard, approveHandler);

  // ✅ RE-FORCE AFTER ALL SERVERS DON LOAD - Vercel safe, inside try/catch, no crash
  try{
    if(typeof setTimeout === "function"){
      setTimeout(()=>{ try{ forceAdd("get", "/api/admin/backpay-all", server3AdminGuard, backpayHandler); forceAdd("get", "/api/admin/backpay", server3AdminGuard, backpayHandler); forceAdd("post", "/api/admin/approve", server3AdminGuard, approveHandler); forceAdd("post", "/api/admin/users/approve", server3AdminGuard, approveHandler); console.log("✅ Server3 Re-force done - only Server 3 backpay dey work"); }catch{} }, 1000);
      setTimeout(()=>{ try{ forceAdd("get", "/api/admin/backpay-all", server3AdminGuard, backpayHandler); forceAdd("get", "/api/admin/backpay", server3AdminGuard, backpayHandler); forceAdd("post", "/api/admin/approve", server3AdminGuard, approveHandler); forceAdd("post", "/api/admin/users/approve", server3AdminGuard, approveHandler); console.log("✅ Server3 Re-force 2 done - only Server 3 backpay dey work"); }catch{} }, 3000);
    }
  }catch{}

  const handleSuspendUser = (req,res) => {
    try{
      const userId = Number(req.body?.userId || req.body?.id || req.body?.user_id || req.query.id || req.query.userId || req.params.id);
      if(!userId) return res.status(400).json({success:false, message:"User ID required"});
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      if(!user) return res.status(404).json({success:false, message:"User not found"});
      try{ db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET is_suspended=1 WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET is_active=0 WHERE id=?").run(userId); }catch{}
      const fresh = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      return res.json({success:true, message:`${fresh.username} don suspend - account don STOP`, user:{id:fresh.id, username:fresh.username, account_status:fresh.account_status, status:fresh.status}});
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };
  const handleUnsuspendUser = (req,res) => {
    try{
      const userId = Number(req.body?.userId || req.body?.id || req.body?.user_id || req.query.id || req.query.userId || req.params.id);
      if(!userId) return res.status(400).json({success:false, message:"User ID required"});
      const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      if(!user) return res.status(404).json({success:false, message:"User not found"});
      try{ db.prepare("UPDATE users SET account_status='active' WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET status='active' WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET is_suspended=0 WHERE id=?").run(userId); }catch{}
      try{ db.prepare("UPDATE users SET is_active=1 WHERE id=?").run(userId); }catch{}
      const fresh = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      return res.json({success:true, message:`${fresh.username} don unsuspend - account don START again`, user:{id:fresh.id, username:fresh.username, account_status:fresh.account_status, status:fresh.status}});
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };
  safeAdd("post", "/api/admin/suspend", server3AdminGuard, handleSuspendUser);
  safeAdd("post", "/api/admin/users/suspend", server3AdminGuard, handleSuspendUser);
  safeAdd("post", "/api/admin/user/suspend", server3AdminGuard, handleSuspendUser);
  safeAdd("post", "/api/admin/suspend-user", server3AdminGuard, handleSuspendUser);
  safeAdd("post", "/api/admin/users/block", server3AdminGuard, handleSuspendUser);
  safeAdd("get", "/api/admin/suspend", server3AdminGuard, handleSuspendUser);
  safeAdd("post", "/api/admin/unsuspend", server3AdminGuard, handleUnsuspendUser);
  safeAdd("post", "/api/admin/users/unsuspend", server3AdminGuard, handleUnsuspendUser);
  safeAdd("post", "/api/admin/user/unsuspend", server3AdminGuard, handleUnsuspendUser);
  safeAdd("post", "/api/admin/users/unblock", server3AdminGuard, handleUnsuspendUser);
  safeAdd("get", "/api/admin/unsuspend", server3AdminGuard, handleUnsuspendUser);

  const notifyUser = (userId, title, message) => {
    try{
      const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notifications','jovia_notifications','user_notifications','user_notification')`).all().map(r=>r.name);
      if(!tables.length){
        db.exec(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT, message TEXT, type TEXT DEFAULT 'system', is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))`);
        tables.push("notifications");
      }
      for(const tbl of tables){
        try{
          const cols = db.prepare(`PRAGMA table_info(${tbl})`).all().map(c=>c.name);
          const has = (n) => cols.includes(n);
          if(has("user_id") && has("title") && has("message")){
            const typeCol = has("type") ? ", type" : "";
            const typeVal = has("type") ? ", 'system'" : "";
            const readCol = has("is_read") ? ", is_read" : "";
            const readVal = has("is_read") ? ", 0" : "";
            const createdCol = has("created_at") ? ", created_at" : "";
            const createdVal = has("created_at") ? ", datetime('now')" : "";
            db.prepare(`INSERT INTO ${tbl} (user_id, title, message${typeCol}${readCol}${createdCol}) VALUES (?, ?, ?${typeVal}${readVal}${createdVal})`).run(userId, title, message);
            return true;
          }
          if(has("user_id") && has("message")){
            db.prepare(`INSERT INTO ${tbl} (user_id, message) VALUES (?, ?)`).run(userId, `${title} - ${message}`);
            return true;
          }
        }catch{}
      }
    }catch(e){ console.log("⚠️ notifyUser failed:", e.message); }
    return false;
  };

  const balanceHistoryHandler = (req,res) => {
    try{
      const userId = Number(req.query?.userId||req.query?.id||req.query?.user_id||0);
      const email = String(req.query?.email||"").trim().toLowerCase();
      const type = String(req.query?.type||"").trim().toLowerCase();
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit||100)));
      let user = null;
      if(userId) user = db.prepare(`SELECT id FROM users WHERE id=?`).get(userId);
      if(!user && email) user = db.prepare(`SELECT id FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email);
      if(user){
        let rows;
        if(type){
          rows = db.prepare(`SELECT id, user_id, type, amount, description, created_at FROM wallet_transactions WHERE user_id=? AND LOWER(type)=? ORDER BY id DESC LIMIT ?`).all(user.id, type, limit);
        } else {
          rows = db.prepare(`SELECT id, user_id, type, amount, description, created_at FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(user.id, limit);
        }
        const u2 = db.prepare(`SELECT id, email, username, full_name, wallet_balance, affiliate_balance, referral_balance FROM users WHERE id=?`).get(user.id);
        return res.json({success:true, history: rows, transactions: rows, total: rows.length, user: u2});
      }
      let rows;
      if(type){
        rows = db.prepare(`SELECT w.id, w.user_id, w.type, w.amount, w.description, w.created_at, u.email, u.username, u.full_name FROM wallet_transactions w LEFT JOIN users u ON u.id=w.user_id WHERE LOWER(w.type)=? ORDER BY w.id DESC LIMIT ?`).all(type, limit);
      } else {
        rows = db.prepare(`SELECT w.id, w.user_id, w.type, w.amount, w.description, w.created_at, u.email, u.username, u.full_name FROM wallet_transactions w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT ?`).all(limit);
      }
      return res.json({success:true, history: rows, transactions: rows, total: rows.length});
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };
  const balanceHistoryPaths = [
    "/api/admin/balance/history",
    "/api/admin/wallet/history",
    "/api/admin/user/balance/history",
    "/api/admin/users/balance/history",
    "/api/admin/balance-history",
    "/api/admin/wallet/transactions"
  ];
  balanceHistoryPaths.forEach(p=> safeAdd("get", p, adminGuard, balanceHistoryHandler));

  const balanceUserHandler = (req,res) => {
    try{
      const email = String(req.query?.email||"").trim().toLowerCase();
      const username = String(req.query?.username||"").trim();
      const userId = Number(req.query?.userId||req.query?.id||req.query?.user_id||0);
      let user = null;
      if(userId) user = db.prepare(`SELECT * FROM users WHERE id=?`).get(userId);
      if(!user && email) user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email);
      if(!user && username) user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username))=LOWER(TRIM(?)) OR LOWER(TRIM(full_name))=LOWER(TRIM(?)) LIMIT 1`).get(username, username);
      if(!user) return res.status(404).json({success:false, message:"User not found"});
      let gameAcc = null;
      try{ gameAcc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(user.id); }catch{}
      const gameBal = Number(gameAcc?.game_balance||0);
      const walletBal = Number(user.wallet_balance||0);
      const affBal = Number(user.affiliate_balance||0);
      const refBal = Number(user.referral_balance||0);
      return res.json({success:true, user:{id:user.id,email:user.email,username:user.username,full_name:user.full_name,package:user.package||user.plan,plan:user.plan||user.package,wallet_balance:walletBal,available_balance:walletBal,affiliate_balance:affBal,referral_balance:refBal,referral_earnings:refBal,game_balance:gameBal,account_status:user.account_status,status:user.status}, wallet_balance:walletBal, available_balance:walletBal, affiliate_balance:affBal, referral_balance:refBal, referral_earnings:refBal, game_balance:gameBal});
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };
  ["/api/admin/balance/user","/api/admin/balance/user-by-email","/api/admin/user/balance-detail","/api/admin/balance/detail"].forEach(p=> safeAdd("get", p, adminGuard, balanceUserHandler));

  const findUserForBalance = (body) => {
    const uid = Number(body?.userId||body?.id||body?.user_id||0);
    const em = String(body?.email||"").trim().toLowerCase();
    const un = String(body?.username||body?.user||"").trim();
    let u=null;
    if(uid) u=db.prepare(`SELECT * FROM users WHERE id=?`).get(uid);
    if(!u && em) u=db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(em);
    if(!u && un) u=db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username))=LOWER(TRIM(?)) OR LOWER(TRIM(full_name))=LOWER(TRIM(?)) LIMIT 1`).get(un, un);
    return u;
  };
  const resolveCol = (body) => {
    const t = String(body?.balanceType||body?.balance||body?.walletType||body?.target||"wallet").toLowerCase();
    if(t.includes("referral")) return "referral_balance";
    if(t.includes("affiliate")) return "affiliate_balance";
    if(t.includes("game")) return "game_balance";
    return "wallet_balance";
  };
  const adjustHandler = (isAdd) => (req,res) => {
    try{
      const body = req.body||{};
      const amount = Number(body?.amount||body?.value||0);
      if(!amount || amount<=0) return res.status(400).json({success:false,message:"Enter valid amount"});
      const user = findUserForBalance(body);
      if(!user) return res.status(404).json({success:false,message:"User not found"});
      const reason = String(body?.reason||body?.note||body?.description||(isAdd?"Admin add balance":"Admin deduct balance")).slice(0,300);
      const col = resolveCol(body);
      const label = col==="referral_balance" ? "Referral Earnings" : col==="affiliate_balance" ? "Affiliate" : col==="game_balance" ? "Game" : "Available";
      if(col==="game_balance"){
        let acc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(user.id);
        if(!acc){ db.prepare(`INSERT INTO jovia_game_accounts (user_id, game_balance, points) VALUES (?,0,0)`).run(user.id); acc=db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(user.id); }
        const before = Number(acc.game_balance||0);
        const after = isAdd ? before+amount : Math.max(0, before-amount);
        const wasShort = !isAdd && before < amount;
        db.prepare(`UPDATE jovia_game_accounts SET game_balance=?, updated_at=datetime('now') WHERE user_id=?`).run(after, user.id);
        try{ db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(user.id, isAdd?"admin_add":"admin_deduct", isAdd?amount:-amount, `${reason} [game_balance]`); }catch{}
        if(!isAdd){
          notifyUser(user.id, "Balance Deduction - System", `Hello ${user.full_name||user.username||""}, ₦${amount.toLocaleString()} was deducted from your ${label} Balance by the System. Reason: ${reason}. Your previous balance was ₦${before.toLocaleString()} and your new balance is ₦${after.toLocaleString()}. If you have any questions, please contact support. - Jovia System`);
        } else {
          notifyUser(user.id, "Balance Added - System", `Hello ${user.full_name||user.username||""}, ₦${amount.toLocaleString()} was added to your ${label} Balance by the System. Reason: ${reason}. Your new balance is ₦${after.toLocaleString()}. - Jovia System`);
        }
        return res.json({success:true, message: wasShort ? `✅ Game balance deducted: ₦${amount.toLocaleString()} - User only get ₦${before.toLocaleString()}, balance now ₦0. User don get notification.` : `✅ Game balance ${isAdd?"added":"deducted"}: ₦${amount.toLocaleString()}. User don get notification.`, userId:user.id, beforeBalance:before, newBalance:after, balance:after});
      }
      const before = Number(user[col]||0);
      const after = isAdd ? before+amount : Math.max(0, before-amount);
      const wasShort = !isAdd && before < amount;
      db.prepare(`UPDATE users SET ${col} = ? WHERE id=?`).run(after, user.id);
      if(col==="wallet_balance"){
        try{ db.prepare(`UPDATE users SET balance=? WHERE id=?`).run(after, user.id); }catch{}
      }
      try{ db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(user.id, isAdd?"admin_add":"admin_deduct", isAdd?amount:-amount, `${reason} [${col}]`); }catch{}
      if(!isAdd){
        notifyUser(user.id, "Balance Deduction - System", `Hello ${user.full_name||user.username||""}, ₦${amount.toLocaleString()} was deducted from your ${label} Balance by the System. Reason: ${reason}. Your previous balance was ₦${before.toLocaleString()} and your new balance is ₦${after.toLocaleString()}. If you have any questions, please contact support. - Jovia System`);
      } else {
        notifyUser(user.id, "Balance Added - System", `Hello ${user.full_name||user.username||""}, ₦${amount.toLocaleString()} was added to your ${label} Balance by the System. Reason: ${reason}. Your new balance is ₦${after.toLocaleString()}. - Jovia System`);
      }
      const updated = db.prepare(`SELECT id, email, username, wallet_balance, affiliate_balance, referral_balance FROM users WHERE id=?`).get(user.id);
      return res.json({success:true,
        message: wasShort ? `✅ ${label} balance deducted: ₦${amount.toLocaleString()} - User only get ₦${before.toLocaleString()}, balance now ₦0. User don get notification.` : `✅ ${label} balance ${isAdd?"added":"deducted"}: ₦${amount.toLocaleString()}. User don get notification.`,
        user:updated, userId:user.id, beforeBalance:before, newBalance:after, balance:after, wallet_balance:updated?.wallet_balance, affiliate_balance:updated?.affiliate_balance, referral_balance:updated?.referral_balance});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  };
  const adjustGeneric = (req,res) => {
    const t = String(req.body?.type||req.body?.action||"add").toLowerCase();
    return adjustHandler(!(t.includes("deduct")||t.includes("subtract")||t.includes("remove")||t==="minus"))(req,res);
  };
  ["/api/admin/balance/add","/api/admin/user/add-balance","/api/admin/users/add-balance","/api/admin/wallet/add","/api/admin/add-balance"].forEach(p=> safeAdd("post",p, adminGuard, adjustHandler(true)));
  ["/api/admin/balance/deduct","/api/admin/user/deduct-balance","/api/admin/users/deduct-balance","/api/admin/wallet/deduct","/api/admin/deduct-balance"].forEach(p=> safeAdd("post",p, adminGuard, adjustHandler(false)));
  ["/api/admin/balance/adjust","/api/admin/user/balance","/api/admin/users/balance","/api/admin/balance","/api/admin/wallet/adjust"].forEach(p=> safeAdd("post",p, adminGuard, adjustGeneric));

  safeAdd("get","/api/admin/upgrades", adminGuard, (req,res)=>{
    try{
      const rows = db.prepare(`SELECT u.*, us.email, us.username, us.full_name FROM jovia_upgrades u LEFT JOIN users us ON us.id=u.user_id ORDER BY u.id DESC LIMIT 200`).all();
      return res.json({success:true, upgrades: rows, total: rows.length});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/admin/upgrades/list", adminGuard, (req,res)=>{
    try{
      const rows = db.prepare(`SELECT u.*, us.email, us.username, us.full_name FROM jovia_upgrades u LEFT JOIN users us ON us.id=u.user_id ORDER BY u.id DESC LIMIT 200`).all();
      return res.json({success:true, upgrades: rows, total: rows.length});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  console.log("✅ SERVER 3 READY - Balance History + Balance User + Deduct Always Success + Notify User + Backpay + Suspend + BLOCKER SAME PERSON SAME AMOUNT + BLOCK OTHER SERVERS BACKPAY");
  }catch(e){
    console.log("⚠️ Server 3 load error (no crash, backend go still run):", e.message);
  }
};
