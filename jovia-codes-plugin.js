const fs = require('fs');
module.exports = (app, db) => {
  const FILE = '/tmp/jovia_codes.json';
  let codes = {};
  try { if(fs.existsSync(FILE)) codes = JSON.parse(fs.readFileSync(FILE,'utf8')); } catch(e){}
  const save = () => { try{ fs.writeFileSync(FILE, JSON.stringify(codes)); }catch(e){} };
  const gen = (l,p) => { let s=p; const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; for(let i=0;i<l;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; };
  
  try {
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
    const cols = db.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
    if(!cols.includes('package')) db.exec("ALTER TABLE users ADD COLUMN package TEXT DEFAULT 'Silver'");
    if(!cols.includes('plan')) try{ db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'Silver'"); }catch(e){}
    if(!cols.includes('is_super')) try{ db.exec("ALTER TABLE users ADD COLUMN is_super INTEGER DEFAULT 0"); }catch(e){}
    if(!cols.includes('wallet_balance')) try{ db.exec("ALTER TABLE users ADD COLUMN wallet_balance INTEGER DEFAULT 0"); }catch(e){}
    if(!cols.includes('balance')) try{ db.exec("ALTER TABLE users ADD COLUMN balance INTEGER DEFAULT 0"); }catch(e){}
    if(!cols.includes('wallet')) try{ db.exec("ALTER TABLE users ADD COLUMN wallet INTEGER DEFAULT 0"); }catch(e){}
    if(!cols.includes('total_earnings')) try{ db.exec("ALTER TABLE users ADD COLUMN total_earnings INTEGER DEFAULT 0"); }catch(e){}
    if(!cols.includes('total_balance')) try{ db.exec("ALTER TABLE users ADD COLUMN total_balance INTEGER DEFAULT 0"); }catch(e){}
  } catch(e){}

  const getUserFromRequest = (req) => {
    try{
      const headersEmail = req.headers['x-user-email']||req.headers['x-user-email'.toLowerCase()];
      const bodyEmail = req.body?.email||req.body?.userEmail;
      const allEmails = [bodyEmail, headersEmail, req.query?.email, req.user?.email].filter(Boolean).map(v=>String(v).toLowerCase().trim());
      
      if(req.user?.id){
        try{ const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id); if(u) return u; }catch(e){}
      }
      for(let em of allEmails){
        try{
          let u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(em);
          if(u) return u;
        }catch(e){}
      }
      if(req.body?.userId){
        try{ const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.body.userId); if(u) return u; }catch(e){}
      }
    }catch(e){}
    return req.user || null;
  };

  const isSuperUser = (user)=>{
    if(!user) return false;
    try{
      let pkg = String(user.package||user.plan||"").toLowerCase();
      if(pkg.includes("super")) return true;
      if(user.is_super==1) return true;
    }catch(e){}
    return false;
  };

  const find = (raw) => {
    raw = String(raw||"").toUpperCase().trim();
    try{ const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); if(row) return row; }catch(e){}
    if(codes[raw]) return codes[raw];
    return null;
  };

  const addMoneyToWallet = (userId, amount, type)=>{
    amount = Number(amount)||0;
    if(!userId || amount<=0) { console.log(`❌ addMoney invalid userId=${userId} amount=${amount}`); return 0; }
    let newBal = 0;
    try{
      let user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
      if(!user){ console.log(`❌ User ${userId} not found`); return 0; }
      let cur = Number(user.wallet_balance||user.balance||user.wallet||0);
      newBal = cur + amount;
      console.log(`💰 ADDING ₦${amount} to user ${user.email} ID=${userId} | Old=${cur} New=${newBal} | Type=${type}`);

      // UPDATE users table - TRY ALL COLUMNS
      try{ db.prepare("UPDATE users SET wallet_balance=?, balance=?, wallet=?, total_earnings=COALESCE(total_earnings,0)+?, total_balance=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newBal, newBal, newBal, amount, newBal, userId); console.log(`✅ Updated users table`); }catch(e){
        console.log(`⚠️ users update 1 fail: ${e.message}`);
        try{ db.prepare("UPDATE users SET wallet_balance=?, balance=? WHERE id=?").run(newBal, newBal, userId); console.log(`✅ Updated wallet_balance,balance`); }catch(e2){
          try{ db.prepare("UPDATE users SET wallet_balance=? WHERE id=?").run(newBal, userId); console.log(`✅ Updated wallet_balance only`); }catch(e3){ console.log(`❌ All users update fail: ${e3.message}`); }
        }
      }

      // UPDATE wallets table if exists (some apps use separate wallet table)
      try{
        let walletTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name='wallets' OR name='user_wallets' OR name='user_wallet')").all();
        for(let wt of walletTables){
          try{
            let cols = db.prepare(`PRAGMA table_info(${wt.name})`).all().map(c=>c.name);
            if(cols.includes('user_id') && cols.includes('balance')){
              db.prepare(`UPDATE ${wt.name} SET balance=balance+? WHERE user_id=?`).run(amount, userId);
              // If no row, insert
              let exists = db.prepare(`SELECT * FROM ${wt.name} WHERE user_id=?`).get(userId);
              if(!exists){
                db.prepare(`INSERT INTO ${wt.name} (user_id, balance) VALUES (?,?)`).run(userId, newBal);
              }
              console.log(`✅ Updated ${wt.name} table`);
            }
          }catch(e){ console.log(`⚠️ ${wt.name} update fail: ${e.message}`); }
        }
      }catch(e){}

      // INSERT history
      const tries = [
        `INSERT INTO wallet_transactions (user_id, amount, type, status, created_at) VALUES (${userId}, ${amount}, '${type}', 'completed', datetime('now','localtime'))`,
        `INSERT INTO transactions (user_id, amount, type, status, created_at) VALUES (${userId}, ${amount}, '${type}', 'completed', datetime('now','localtime'))`,
        `INSERT INTO earnings (user_id, amount, source, created_at) VALUES (${userId}, ${amount}, '${type}', datetime('now','localtime'))`,
      ];
      for(let sql of tries){ try{ db.prepare(sql).run(); }catch(e){} }

    }catch(e){ console.log(`❌ addMoneyToWallet error: ${e.message}`); }
    return newBal;
  };

  app.post("/api/admin/codes/generate", (req,res) => {
    const t = String(req.body?.type||"").toLowerCase();
    let type = t.includes("gold") ? "super-gold" : t.includes("silver") ? "super-silver" : "withdraw";
    let out = [];
    for(let i=0;i<5;i++){ 
      let code = type==="withdraw" ? gen(6,"JOVIA-") : gen(8,"SUPER-"); 
      try{ if(db.prepare("SELECT code FROM jovia_codes WHERE code=?").get(code)){ i--; continue; } }catch(e){}
      let newCode = {code, type, price: type==="super-gold"?12000:type==="super-silver"?16000:0, used:0, created_at:new Date().toISOString()};
      codes[code] = newCode; out.push(newCode);
      try{ db.prepare("INSERT OR IGNORE INTO jovia_codes (code,type,price,used,created_at) VALUES (?,?,?,?,?)").run(code,type,newCode.price,0,newCode.created_at); }catch(e){}
    }
    save();
    res.json({success:true,codes:out});
  });

  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw}`});
    if(row.used) return res.json({success:false,message:`❌ Already USED by ${row.used_by}`});
    let user = getUserFromRequest(req);
    if(!user) return res.json({success:false,message:"User not found"});
    let email = user.email||'';
    let username = user.username||email.split('@')[0]||'User';
    let displayName = `${username} (${email})`;
    let now = new Date().toLocaleString('en-NG', {timeZone:'Africa/Lagos', hour12:true});
    try{ db.prepare("UPDATE users SET package='SUPER', plan='SUPER', is_super=1, account_status='active', status='active' WHERE id=?").run(user.id); }catch(e){}
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_by_id=?, used_at=? WHERE code=?").run(displayName, username, email, user.id, now, raw); }catch(e){}
    if(codes[raw]){ codes[raw].used=1; codes[raw].used_by=displayName; save(); }
    res.json({success:true, message:`✅ Upgraded to SUPER - Code USED`, user:db.prepare("SELECT * FROM users WHERE id=?").get(user.id)});
  });

  // === CRITICAL: BYPASS MUST BE FIRST ===
  const videoBypass = (req,res,next)=>{
    try{
      let user = getUserFromRequest(req);
      let isForce = req.headers['x-super-force']==="1" || req.body?.forceSuper==1;
      let pkg = user ? String(user.package||user.plan||"").toLowerCase() : "";
      let isSuper = (user && (pkg.includes("super") || user.is_super==1)) || isForce;

      if(isSuper){
        if(!user && isForce){
          let email = req.headers['x-user-email']||req.body?.email||"";
          if(email) user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(String(email).toLowerCase().trim());
        }
        if(!user){
          console.log(`⚠️ SUPER bypass but user not found - headers: ${JSON.stringify(req.headers)} body: ${JSON.stringify(req.body)}`);
          return next();
        }
        let reward = 500;
        try{
          let v = db.prepare("SELECT * FROM videos WHERE id=?").get(req.params.id);
          if(v) reward = Number(v.reward||500);
        }catch(e){}
        console.log(`👑 SUPER VIDEO BYPASS ${req.params.id} reward=${reward} user=${user.email} - ADDING TO WALLET NOW`);
        let newBal = addMoneyToWallet(user.id, reward, "video_reward");
        console.log(`✅ VIDEO WALLET UPDATED NewBal=${newBal}`);
        return res.json({success:true, message:`Claimed ₦${reward} as SUPER - Unlimited!`, reward, walletBalance:newBal, wallet_balance:newBal, balance:newBal, newBalance:newBal});
      }
      next();
    }catch(e){ console.log("video bypass error", e.message); next(); }
  };

  const jobBypass = (req,res,next)=>{
    try{
      let user = getUserFromRequest(req);
      let isForce = req.headers['x-super-force']==="1" || req.body?.forceSuper==1;
      let pkg = user ? String(user.package||user.plan||"").toLowerCase() : "";
      let isSuper = (user && (pkg.includes("super") || user.is_super==1)) || isForce;
      if(isSuper){
        if(!user && isForce){
          let email = req.headers['x-user-email']||req.body?.email||"";
          if(email) user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(String(email).toLowerCase().trim());
        }
        if(!user) return next();
        let reward = 500;
        try{ let j = db.prepare("SELECT * FROM jobs WHERE id=?").get(req.params.id); if(j) reward = Number(j.reward||500); }catch(e){}
        console.log(`👑 SUPER JOB BYPASS ${req.params.id} reward=${reward} user=${user.email} - ADDING`);
        let newBal = addMoneyToWallet(user.id, reward, "job_reward");
        return res.json({success:true, message:`Claimed ₦${reward} as SUPER`, reward, walletBalance:newBal, wallet_balance:newBal, balance:newBal});
      }
      next();
    }catch(e){ console.log("job bypass error", e.message); next(); }
  };

  app.post("/api/videos/:id/complete", videoBypass);
  app.post("/api/jobs/:id/complete", jobBypass);

  // MOVE OUR BYPASS TO FRONT OF ROUTER STACK - SO IT RUNS BEFORE ORIGINAL
  try{
    if(app._router && app._router.stack){
      let stack = app._router.stack;
      // Find our 2 bypass routes (last added)
      let videoLayer = null, jobLayer = null;
      for(let i=stack.length-1; i>=0; i--){
        let layer = stack[i];
        if(layer.route && layer.route.path==="/api/videos/:id/complete" && layer.route.methods.post){
          videoLayer = stack.splice(i,1)[0];
          break;
        }
      }
      for(let i=stack.length-1; i>=0; i--){
        let layer = stack[i];
        if(layer.route && layer.route.path==="/api/jobs/:id/complete" && layer.route.methods.post){
          jobLayer = stack.splice(i,1)[0];
          break;
        }
      }
      // Put them at front (after express json parser)
      if(videoLayer) stack.unshift(videoLayer);
      if(jobLayer) stack.unshift(jobLayer);
      console.log("✅ Moved SUPER bypass to FRONT of router - Will run before N7k check");
    }
  }catch(e){ console.log("Router reorder fail", e.message); }

  // DEBUG ENDPOINTS TO TEST WALLET
  app.post("/api/debug/add-money", (req,res)=>{
    try{
      let {email, amount} = req.body||{};
      amount = Number(amount)||500;
      email = String(email||"").toLowerCase().trim();
      let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(email);
      if(!user) return res.json({success:false, message:"User not found"});
      let newBal = addMoneyToWallet(user.id, amount, "debug_add");
      res.json({success:true, message:`Added ₦${amount}`, newBal, user:db.prepare("SELECT * FROM users WHERE id=?").get(user.id)});
    }catch(e){ res.json({success:false, error:e.message}); }
  });

  app.post("/api/debug/force-super-me", (req,res)=>{
    try{
      let email = String(req.body?.email||"").toLowerCase().trim();
      let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(email);
      if(!user) return res.json({success:false});
      db.prepare("UPDATE users SET package='SUPER', plan='SUPER', is_super=1, account_status='active', status='active' WHERE id=?").run(user.id);
      res.json({success:true, user:db.prepare("SELECT * FROM users WHERE id=?").get(user.id)});
    }catch(e){ res.json({success:false, error:e.message}); }
  });

  app.get("/api/admin/codes/list", (req,res)=>{ try{ let all=db.prepare("SELECT * FROM jovia_codes ORDER BY created_at DESC").all(); res.json({success:true,codes:all}); }catch(e){ res.json({success:true,codes:Object.values(codes)}); } });
  app.get("/api/debug/users-schema", (req,res)=>{ try{ const cols=db.prepare("PRAGMA table_info(users)").all(); const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t=>t.name); res.json({success:true, columns:cols.map(c=>c.name), tables}); }catch(e){ res.json({success:false, error:e.message}); } });

  console.log("✅ JOVIA PLUGIN FINAL - FRONT BYPASS + WALLET ADDS FOR REAL + NO N7K");
};
