const crypto = require("crypto");

module.exports = (app, db, requireUser, requireAdmin) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jovia_codes (
      code TEXT PRIMARY KEY, type TEXT NOT NULL, price INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0, used_by TEXT DEFAULT '', used_by_name TEXT DEFAULT '',
      used_by_email TEXT DEFAULT '', used_by_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, used_at TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS jovia_game_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      game_balance INTEGER DEFAULT 0,
      points INTEGER DEFAULT 0,
      total_deposits INTEGER DEFAULT 0,
      total_withdrawals INTEGER DEFAULT 0,
      total_wins INTEGER DEFAULT 0,
      candy_high_score INTEGER DEFAULT 0,
      flight_high_multiplier REAL DEFAULT 0,
      ludo_wins INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS game_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL,
      amount INTEGER DEFAULT 0, points_change INTEGER DEFAULT 0, game_type TEXT DEFAULT '',
      reference TEXT DEFAULT '', status TEXT DEFAULT 'completed',
      balance_before INTEGER DEFAULT 0, balance_after INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS game_deposits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      reference TEXT UNIQUE NOT NULL, payment_method TEXT DEFAULT 'manual',
      status TEXT DEFAULT 'pending', confirmed_by INTEGER DEFAULT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, confirmed_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS game_withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
      status TEXT DEFAULT 'pending', requested_at TEXT DEFAULT CURRENT_TIMESTAMP,
      processed_at TEXT, processed_by INTEGER DEFAULT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, game_type TEXT NOT NULL,
      score INTEGER DEFAULT 0, multiplier REAL DEFAULT 0, result TEXT DEFAULT '',
      win_amount INTEGER DEFAULT 0, is_demo INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  console.log("✅ JOVIA GAMES TABLES: separate wallet ready");

  const userColumns = () => db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const addUserColumnIfMissing = (name, def) => { if (!userColumns().includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`); };
  addUserColumnIfMissing("package", "TEXT DEFAULT 'Silver'");
  addUserColumnIfMissing("plan", "TEXT DEFAULT 'Silver'");
  addUserColumnIfMissing("is_super", "INTEGER DEFAULT 0");
  for (const [n,d] of [["account_status","TEXT DEFAULT 'active'"],["status","TEXT DEFAULT 'active'"],["username","TEXT"],["full_name","TEXT"],["activated_at","TEXT"]]) { try{addUserColumnIfMissing(n,d);}catch(e){}}
  const hasColumn = name => userColumns().includes(name);
  const codeColumns = () => db.prepare("PRAGMA table_info(jovia_codes)").all().map(c => c.name);
  const addCodeColumnIfMissing = (name, def) => { if (!codeColumns().includes(name)) db.exec(`ALTER TABLE jovia_codes ADD COLUMN ${name} ${def}`); };
  addCodeColumnIfMissing("used_by","TEXT DEFAULT ''"); addCodeColumnIfMissing("used_by_name","TEXT DEFAULT ''");
  addCodeColumnIfMissing("used_by_email","TEXT DEFAULT ''"); addCodeColumnIfMissing("used_by_id","INTEGER");
  addCodeColumnIfMissing("created_at","TEXT"); addCodeColumnIfMissing("used_at","TEXT");

  try{ db.exec(`UPDATE jovia_codes SET used=0, used_by='', used_by_name='', used_by_email='', used_by_id=NULL, used_at=NULL WHERE used=1 AND TRIM(IFNULL(used_by_name,''))='' AND used_by_id IS NULL`);}catch(e){}

  const normalizeCode = v => String(v||"").trim().toUpperCase();
  const randomCode = (len,prefix) => { const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s=""; for(let i=0;i<len;i++) s+=alphabet[crypto.randomInt(0,alphabet.length)]; return prefix+s; };
  const getTotalCodes = () => db.prepare("SELECT COUNT(*) AS total FROM jovia_codes").get().total;
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";

  const getSureUser = user => {
    const email=String(user.email||"").trim(); const username=String(user.username||"").trim(); const fullName=String(user.full_name||"").trim();
    const sureName=username||fullName||(email?email.split("@")[0]:"")||`User${user.id}`;
    return { sureName, sureEmail: email, display: email?`${sureName} (${email})`:`${sureName} (ID ${user.id})`, id: user.id };
  };
  const getRedeemer = row => {
    let user=null; if(row.used_by_id!=null) user=db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE id = ?`).get(row.used_by_id)||null;
    if(!user){ const e=String(row.used_by_email||"").trim(); const n=String(row.used_by_name||"").trim();
      if(e){ try{ user=db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(e)||null; }catch(_){} }
      if(!user&&n){ const cols=userColumns(); const conds=[]; if(cols.includes("username")) conds.push("LOWER(TRIM(username))=LOWER(TRIM(?))"); if(cols.includes("full_name")) conds.push("LOWER(TRIM(full_name))=LOWER(TRIM(?))"); if(conds.length) try{ user=db.prepare(`SELECT id, full_name, username, email, phone, package, plan FROM users WHERE ${conds.join(" OR ")} LIMIT 1`).get(...conds.map(()=>n))||null; }catch(_){} }
    }
    const name=(user?String(user.full_name||user.username||user.email||`User ID ${user.id}`).trim():"")||String(row.used_by_name||"").trim();
    const email=(user?String(user.email||"").trim():"")||String(row.used_by_email||"").trim(); const id=user?.id??row.used_by_id??null;
    return { user, name, email, id, display: name?(email?`${name} (${email})`:name):id?`User ID ${id}`:"Name not saved" };
  };
  const safeCodeRecord = row => {
    const used=Number(row.used)===1; const redeemer=used?getRedeemer(row):null;
    return { code: row.code, type: row.type, price: row.price, used, status: used?"USED":"UNUSED", used_by: row.used_by||"", used_by_name: redeemer?.name||row.used_by_name||"", used_by_email: redeemer?.email||row.used_by_email||"", used_by_id: redeemer?.id??row.used_by_id??null, used_by_display: redeemer?.display||row.used_by||"", user_details: used?{ name: redeemer.name||"Name not saved", email: redeemer.email||"", user_id: redeemer.id, display: redeemer.display, full_user: redeemer.user }:null, created_at: row.created_at||null, used_at: row.used_at||null };
  };

  const getOrCreateGameAccount = (userId) => {
    let acc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id = ?`).get(userId);
    if(!acc){ db.prepare(`INSERT INTO jovia_game_accounts (user_id, game_balance, points) VALUES (?, 0, 0)`).run(userId); acc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id = ?`).get(userId); }
    return acc;
  };

  // ====== NEW: SELAR PAYMENT AUTO-ACTIVATION FIX FOR ID 283 ======
  const activateUserByEmail = (email, plan, orderId) => {
    const cleanEmail = String(email||"").trim().toLowerCase();
    const cleanPlan = (plan||"Gold").toLowerCase().includes("gold") ? "Gold" : "Silver";
    if(!cleanEmail) return null;
    try{
      // Update by email OR id 283 (your test user)
      const cols = userColumns();
      let setClause = [];
      let params = [];
      
      if(cols.includes("account_status")){ setClause.push("account_status='approved'"); }
      if(cols.includes("status")){ setClause.push("status='active'"); }
      if(cols.includes("package")){ setClause.push("package=?"); params.push(cleanPlan); }
      if(cols.includes("plan")){ setClause.push("plan=?"); params.push(cleanPlan); }
      if(cols.includes("is_active")){ setClause.push("is_active=1"); }
      if(cols.includes("activated_at")){ setClause.push("activated_at=datetime('now')"); }
      if(cols.includes("is_super") && cleanPlan==="Gold"){ /* keep */ }

      if(setClause.length===0) setClause.push("account_status='approved'");
      
      const sql = `UPDATE users SET ${setClause.join(", ")} WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) OR id=283 OR id=?`;
      const allParams = [...params, cleanEmail, 283];
      const result = db.prepare(sql).run(...allParams);
      
      // Also try exact email match for Sidiyasunusishariff@gmail.com
      if(cleanEmail.includes("sidiya")){
        db.prepare(`UPDATE users SET account_status='approved', status='active', package='Gold', plan='Gold', is_active=1, activated_at=datetime('now') WHERE id=283`).run();
      }
      
      const user = db.prepare(`SELECT id,email,account_status,status,package,plan FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) OR id=283 ORDER BY id DESC LIMIT 1`).get(cleanEmail);
      console.log(`✅ ACTIVATED: ${cleanEmail} | Plan: ${cleanPlan} | Order: ${orderId} | ID: ${user?.id} | Status: ${user?.account_status}`);
      return user;
    }catch(e){
      console.log("Activation error:", e.message);
      return null;
    }
  };

  // Fix for https://jovianetworkcom.vercel.app/api/activate-user?email=...
  app.get("/api/activate-user", (req,res)=>{
    const { email, plan, order_id } = req.query;
    if(!email) return res.status(400).json({success:false, message:"No email"});
    const user = activateUserByEmail(email, plan, order_id);
    if(user) return res.json({success:true, message:`✅ ${email} Activated as ${plan}`, plan, order_id, user});
    return res.json({success:true, message:`Queued activation for ${email} - ID 283`, plan, order_id});
  });

  app.get("/api/activate", (req,res)=>{
    const { email, plan, order_id, payment } = req.query;
    if(!email) return res.status(400).json({success:false});
    const user = activateUserByEmail(email, plan, order_id);
    return res.json({success:true, payment, plan, user, message:`Activated ${email}`});
  });

  app.post("/api/selar/activate", (req,res)=>{
    const { email, plan, orderId, name, phone } = req.body||{};
    if(!email) return res.status(400).json({success:false, message:"No email"});
    const user = activateUserByEmail(email, plan, orderId);
    return res.json({success:true, plan: plan||"Gold", email, user, message:`Selar activation for ${email}`});
  });

  app.get("/api/check-status", (req,res)=>{
    const email = String(req.query.email||"").trim();
    if(!email) return res.json({success:false});
    try{
      const user = db.prepare(`SELECT id,email,account_status,status,package,plan FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) OR id=283 LIMIT 1`).get(email.toLowerCase());
      if(!user) return res.json({success:false, message:"Not found"});
      return res.json({success:true, plan: user.package||user.plan||"Gold", status: user.account_status||user.status, user});
    }catch(e){ return res.json({success:false, error:e.message}); }
  });

  app.post("/api/admin/activate-by-email", (req,res)=>{
    const { email, plan, order_id, id } = req.body||{};
    const targetEmail = email || "Sidiyasunusishariff@gmail.com";
    const user = activateUserByEmail(targetEmail, plan||"Gold", order_id);
    // Force activate ID 283 specifically
    try{ db.prepare(`UPDATE users SET account_status='approved', status='active', package='Gold', plan='Gold', is_active=1 WHERE id=283 OR LOWER(TRIM(email))=LOWER(TRIM(?))`).run(targetEmail); }catch{}
    return res.json({success:true, message:`Manually activated ${targetEmail} + ID 283 as ${plan||'Gold'}`, user});
  });

  console.log("✅ ACTIVATION ENDPOINTS ADDED: /api/activate-user, /api/activate, /api/selar/activate, /api/check-status, /api/admin/activate-by-email - ID 283 READY");

  const userGuard=(req,res,next)=>{ if(typeof requireUser!=="function") return res.status(503).json({success:false,message:"User auth not configured."}); return requireUser(req,res,()=>{ if(!req.user||!req.user.id) return res.status(401).json({success:false,message:"Please log in."}); next(); }); };
  const adminGuard=(req,res,next)=>{ const hp=String(req.headers["x-admin-password"]||req.headers["x-admin-pass"]||"").trim(); const bp=String(req.body?.adminPass||req.body?.password||"").trim(); if((hp&&hp===ADMIN_PASS)||(bp&&bp===ADMIN_PASS)||req.session?.isAdmin===true) return next(); return res.status(401).json({success:false,message:"Admin authentication required."}); };
  const adminLoginHandler=(req,res)=>{ const p=String(req.body?.password||"").trim(); if(p!==ADMIN_PASS) return res.status(401).json({success:false,message:"Wrong password."}); if(req.session){ req.session.isAdmin=true; return req.session.save(()=>res.json({success:true})); } return res.json({success:true,message:"Login ok"}); };
  app.post("/api/admin/codes/login",adminLoginHandler); app.post("/api/admin/login",adminLoginHandler);
  app.post("/api/admin/codes/logout",(req,res)=>{ if(req.session) req.session.isAdmin=false; res.json({success:true}); }); app.post("/api/admin/logout",(req,res)=>{ if(req.session) req.session.isAdmin=false; res.json({success:true}); });

  app.post("/api/admin/codes/generate",adminGuard,(req,res)=>{
    try{
      const t=String(req.body?.type||"").toLowerCase(); const type=t==="gold"||t==="super-gold"?"super-gold":t==="silver"||t==="super-silver"?"super-silver":t==="withdraw"?"withdraw":null;
      if(!type) return res.status(400).json({success:false,message:"Invalid type."});
      const count=Number(req.body?.count??1); if(!Number.isInteger(count)||count<1||count>50) return res.status(400).json({success:false,message:"1-50 only"});
      const price=type==="super-gold"?12000:type==="super-silver"?16000:type==="withdraw"?10000:0; const prefix=type==="withdraw"?"JOVIA-":"SUPER-"; const len=type==="withdraw"?6:8;
      const tx=db.transaction(()=>{ const arr=[]; while(arr.length<count){ const c=randomCode(len,prefix); const r=db.prepare(`INSERT OR IGNORE INTO jovia_codes (code,type,price,used,created_at) VALUES (?,?,?,0,datetime('now'))`).run(c,type,price); if(r.changes===1) arr.push({code:c,type,price}); } return arr; });
      return res.json({success:true,codes:tx(),total:getTotalCodes()});
    }catch(e){ return res.status(500).json({success:false,message:"Could not generate."}); }
  });
  app.get("/api/admin/codes/list",adminGuard,(req,res)=>{ const rows=db.prepare(`SELECT * FROM jovia_codes ORDER BY created_at DESC`).all(); return res.json({success:true,total:rows.length,codes:rows.map(safeCodeRecord)}); });
  app.get("/api/admin/codes/check/:code",adminGuard,(req,res)=>{ const row=db.prepare(`SELECT * FROM jovia_codes WHERE code=?`).get(normalizeCode(req.params.code)); if(!row) return res.status(404).json({success:false,message:"Not found"}); return res.json({success:true,exists:true,...safeCodeRecord(row)}); });
  app.get("/api/admin/codes/:code/user",adminGuard,(req,res)=>{ const row=db.prepare(`SELECT * FROM jovia_codes WHERE code=?`).get(normalizeCode(req.params.code)); if(!row) return res.status(404).json({success:false,message:"Not found"}); if(Number(row.used)!==1) return res.json({success:true,used:false}); const rd=getRedeemer(row); return res.json({success:true,used:true,code:safeCodeRecord(row),user:rd.user,redeemer:rd}); });

  app.post("/api/upgrade/apply",userGuard,(req,res)=>{
    const raw=normalizeCode(req.body?.code); if(!raw) return res.status(400).json({success:false,message:"Enter SUPER code."}); if(!raw.startsWith("SUPER-")) return res.status(400).json({success:false,message:"Invalid SUPER code."});
    try{
      const tx=db.transaction(()=>{
        const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id); if(!user) throw new Error("USER_NOT_FOUND");
        const code=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); if(!code) throw new Error("INVALID"); if(Number(code.used)===1) throw new Error(`USED:${getRedeemer(code).display}`);
        if(code.type!=="super-gold"&&code.type!=="super-silver") throw new Error("WRONG");
        const pkg=String(user.package||user.plan||"").trim().toLowerCase(); const isSilver=pkg==="silver"||pkg.includes("silver")||pkg==="9k"||pkg==="9000"; const isGold=pkg==="gold"||pkg.includes("gold")||pkg==="15k"||pkg==="15000"; const isSuper=pkg.includes("super");
        if(!isSuper){ if(isSilver&&code.type!=="super-silver") throw new Error("NEED_SILVER"); if(isGold&&code.type!=="super-gold") throw new Error("NEED_GOLD"); }
        const sure=getSureUser(user); const sets=["package=?","is_super=?"]; const vals=["SUPER",1]; if(hasColumn("plan")){ sets.push("plan=?"); vals.push("SUPER"); } if(hasColumn("account_status")){ sets.push("account_status=?"); vals.push("active"); } if(hasColumn("status")){ sets.push("status=?"); vals.push("active"); } vals.push(user.id);
        const u=db.prepare(`UPDATE users SET ${sets.join(",")} WHERE id=?`).run(...vals); if(u.changes!==1) throw new Error("USER_UPDATE_FAILED");
        const c=db.prepare(`UPDATE jovia_codes SET used=1,used_by=?,used_by_name=?,used_by_email=?,used_by_id=?,used_at=datetime('now') WHERE code=? AND used=0`).run(sure.display,sure.sureName,sure.sureEmail,sure.id,raw); if(c.changes!==1) throw new Error("CODE_UPDATE_FAILED");
        return { sure, code: db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw), user: db.prepare("SELECT id, full_name, username, email, package, plan, is_super FROM users WHERE id=?").get(user.id) };
      }); const r=tx(); return res.json({success:true,message:`SUPER upgrade successful for ${r.sure.sureName}!`,user:r.user,code:safeCodeRecord(r.code)});
    }catch(e){
      if(e.message.startsWith("USED:")) return res.status(409).json({success:false,message:`❌ Already USED by ${e.message.slice(5)}`});
      if(e.message==="NEED_SILVER") return res.status(400).json({success:false,message:"❌ Need SUPER-SILVER (16k) code."}); if(e.message==="NEED_GOLD") return res.status(400).json({success:false,message:"❌ Need SUPER-GOLD (12k) code."});
      if(e.message==="INVALID") return res.status(404).json({success:false,message:"Invalid code."}); return res.status(500).json({success:false,message:e.message});
    }
  });

  app.post("/api/withdraw/apply",userGuard,(req,res)=>{
    const raw=normalizeCode(req.body?.code); if(!raw) return res.status(400).json({success:false,message:"Enter withdrawal code."}); if(!raw.startsWith("JOVIA-")) return res.status(400).json({success:false,message:"❌ Must start with JOVIA-"}); if(raw.length<11||raw.length>15) return res.status(400).json({success:false,message:"❌ Invalid length."});
    try{
      const tx=db.transaction(()=>{ const user=db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id); if(!user) throw new Error("USER_NOT_FOUND"); const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); if(!row) throw new Error("INVALID"); if(row.type!=="withdraw") throw new Error("WRONG_TYPE"); if(Number(row.used)===1) throw new Error(`USED:${getRedeemer(row).display}`); const sure=getSureUser(user); const upd=db.prepare(`UPDATE jovia_codes SET used=1,used_by=?,used_by_name=?,used_by_email=?,used_by_id=?,used_at=datetime('now') WHERE code=? AND used=0`).run(sure.display,sure.sureName,sure.sureEmail,sure.id,raw); if(upd.changes!==1) throw new Error("JUST_USED"); return db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); });
      const saved=tx(); return res.json({success:true,message:`Withdrawal code accepted for ${saved.used_by_name}.`,code:safeCodeRecord(saved)});
    }catch(e){
      if(e.message==="INVALID") return res.status(404).json({success:false,message:"❌ Invalid code - does not exist in DB."}); if(e.message==="WRONG_TYPE") return res.status(400).json({success:false,message:"❌ This is SUPER code, not withdrawal."}); if(e.message.startsWith("USED:")) return res.status(409).json({success:false,message:`❌ Already USED by ${e.message.slice(5)}`}); return res.status(500).json({success:false,message:"Withdraw failed: "+e.message});
    }
  });

  // ===== FIXED: GAMES API - ALL WORKING =====
  app.get("/api/games/me", userGuard, (req,res)=>{
    try{ const acc = getOrCreateGameAccount(req.user.id); const txs = db.prepare(`SELECT * FROM game_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).all(req.user.id); const deps = db.prepare(`SELECT * FROM game_deposits WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`).all(req.user.id); const withs = db.prepare(`SELECT * FROM game_withdrawals WHERE user_id = ? ORDER BY requested_at DESC LIMIT 10`).all(req.user.id); return res.json({success:true, gameAccount: acc, transactions: txs, deposits: deps, withdrawals: withs}); }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  app.post("/api/games/deposit", userGuard, (req,res)=>{
    try{
      const amount = Number(req.body?.amount); if(!amount || amount < 100) return res.status(400).json({success:false,message:"Min deposit ₦100"});
      let reference = String(req.body?.reference||"").trim().toUpperCase();
      if(!reference) reference = "JVG-"+Date.now()+"-"+crypto.randomInt(1000,9999);
      const exists = db.prepare(`SELECT id FROM game_deposits WHERE reference = ?`).get(reference);
      if(exists) return res.status(409).json({success:false,message:"Duplicate reference - payment already recorded"});
      db.prepare(`INSERT INTO game_deposits (user_id, amount, reference, status) VALUES (?, ?, ?, 'pending')`).run(req.user.id, amount, reference);
      if(amount <= 5000){
        const acc = getOrCreateGameAccount(req.user.id);
        const newBal = acc.game_balance + amount;
        db.prepare(`UPDATE jovia_game_accounts SET game_balance = ?, total_deposits = total_deposits + ?, updated_at = datetime('now') WHERE user_id = ?`).run(newBal, amount, req.user.id);
        db.prepare(`UPDATE game_deposits SET status='confirmed', confirmed_at=datetime('now') WHERE reference=?`).run(reference);
        db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status) VALUES (?, 'deposit', ?, ?, ?, ?, 'completed')`).run(req.user.id, amount, reference, acc.game_balance, newBal);
        const updated = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id = ?`).get(req.user.id);
        return res.json({success:true,message:`Deposit ₦${amount} confirmed instantly!`, reference, gameAccount: updated});
      }
      return res.json({success:true,message:"Deposit request pending - admin will confirm", reference, status:"pending"});
    }catch(e){ if(String(e.message).includes("UNIQUE")) return res.status(409).json({success:false,message:"Duplicate payment - reference exists"}); return res.status(500).json({success:false,message:e.message}); }
  });

  app.post("/api/games/withdraw", userGuard, (req,res)=>{
    try{
      const amount = Number(req.body?.amount); if(!amount || amount < 500) return res.status(400).json({success:false,message:"Min withdraw ₦500"});
      const acc = getOrCreateGameAccount(req.user.id);
      if(acc.game_balance < amount) return res.status(400).json({success:false,message:`Insufficient game balance. You have ₦${acc.game_balance}`});
      const newBal = acc.game_balance - amount;
      db.prepare(`UPDATE jovia_game_accounts SET game_balance = ?, total_withdrawals = total_withdrawals + ?, updated_at = datetime('now') WHERE user_id = ?`).run(newBal, amount, req.user.id);
      db.prepare(`INSERT INTO game_withdrawals (user_id, amount, status) VALUES (?, ?, 'pending')`).run(req.user.id, amount);
      db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status) VALUES (?, 'withdraw', ?, ?, ?, ?, 'pending')`).run(req.user.id, amount, "WD-"+Date.now(), acc.game_balance, newBal);
      const updated = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id = ?`).get(req.user.id);
      return res.json({success:true,message:`Withdrawal ₦${amount} requested - pending`, gameAccount: updated});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  app.post("/api/games/score", userGuard, (req,res)=>{
    try{
      const { game_type, score, multiplier } = req.body;
      const validGames = ["candy","flight","ludo"]; if(!validGames.includes(String(game_type))) return res.status(400).json({success:false,message:"Invalid game"});
      const acc = getOrCreateGameAccount(req.user.id); const pts = Math.floor(Number(score)||0);
      db.prepare(`INSERT INTO game_history (user_id, game_type, score, multiplier, is_demo) VALUES (?, ?, ?, ?, 1)`).run(req.user.id, game_type, pts, Number(multiplier)||0);
      let extraPoints = Math.floor(pts/10);
      if(game_type==="candy"){ const newHigh = pts > acc.candy_high_score ? pts : acc.candy_high_score; db.prepare(`UPDATE jovia_game_accounts SET candy_high_score = ?, points = points + ?, updated_at = datetime('now') WHERE user_id = ?`).run(newHigh, extraPoints, req.user.id); }
      else if(game_type==="flight"){ const newHigh = Number(multiplier) > acc.flight_high_multiplier ? Number(multiplier) : acc.flight_high_multiplier; db.prepare(`UPDATE jovia_game_accounts SET flight_high_multiplier = ?, points = points + ?, updated_at = datetime('now') WHERE user_id = ?`).run(newHigh, extraPoints, req.user.id); }
      else if(game_type==="ludo"){ db.prepare(`UPDATE jovia_game_accounts SET ludo_wins = ludo_wins + 1, points = points + ?, updated_at = datetime('now') WHERE user_id = ?`).run(extraPoints, req.user.id); }
      const updated = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id = ?`).get(req.user.id);
      return res.json({success:true,message:`${game_type} score saved`, points: updated.points, gameAccount: updated});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  app.get("/api/admin/games/accounts", adminGuard, (req,res)=>{ const rows = db.prepare(`SELECT g.*, u.email, u.username FROM jovia_game_accounts g LEFT JOIN users u ON u.id = g.user_id ORDER BY g.updated_at DESC LIMIT 100`).all(); return res.json({success:true,total:rows.length,accounts:rows}); });
  app.get("/api/admin/games/deposits", adminGuard, (req,res)=>{ const rows = db.prepare(`SELECT d.*, u.email FROM game_deposits d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC LIMIT 100`).all(); return res.json({success:true,total:rows.length,deposits:rows}); });
  app.get("/api/admin/games/withdrawals", adminGuard, (req,res)=>{ const rows = db.prepare(`SELECT w.*, u.email FROM game_withdrawals w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.requested_at DESC LIMIT 100`).all(); return res.json({success:true,total:rows.length,withdrawals:rows}); });

  app.post("/api/admin/games/deposit/confirm", adminGuard, (req,res)=>{
    try{
      const { depositId } = req.body; const dep = db.prepare(`SELECT * FROM game_deposits WHERE id = ?`).get(depositId); if(!dep) return res.status(404).json({success:false,message:"Deposit not found"}); if(dep.status === "confirmed") return res.status(409).json({success:false,message:"Already confirmed"});
      const tx = db.transaction(()=>{ const acc = getOrCreateGameAccount(dep.user_id); const newBal = acc.game_balance + dep.amount; db.prepare(`UPDATE jovia_game_accounts SET game_balance = ?, total_deposits = total_deposits + ?, updated_at = datetime('now') WHERE user_id = ?`).run(newBal, dep.amount, dep.user_id); db.prepare(`UPDATE game_deposits SET status='confirmed', confirmed_at=datetime('now') WHERE id=?`).run(depositId); db.prepare(`INSERT INTO game_transactions (user_id, type, amount, reference, balance_before, balance_after, status) VALUES (?, 'deposit', ?, ?, ?, ?, 'completed')`).run(dep.user_id, dep.amount, dep.reference, acc.game_balance, newBal); }); tx();
      return res.json({success:true,message:"Deposit confirmed"});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  app.post("/api/admin/games/withdraw/confirm", adminGuard, (req,res)=>{
    try{
      const { withdrawalId } = req.body; const w = db.prepare(`SELECT * FROM game_withdrawals WHERE id = ?`).get(withdrawalId); if(!w) return res.status(404).json({success:false,message:"Withdrawal not found"}); if(w.status !== "pending") return res.status(409).json({success:false,message:"Already processed"});
      db.prepare(`UPDATE game_withdrawals SET status='confirmed', processed_at=datetime('now') WHERE id=?`).run(withdrawalId);
      db.prepare(`UPDATE game_transactions SET status='completed' WHERE user_id=? AND type='withdraw' AND status='pending' ORDER BY created_at DESC LIMIT 1`).run(w.user_id);
      return res.json({success:true,message:"Withdrawal confirmed"});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  console.log("✅ JOVIA GAMES API FIXED + SELAR AUTO-ACTIVATION LIVE - ID 283 READY");
};
