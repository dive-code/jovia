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
      CREATE INDEX IF NOT EXISTS idx_jovia_used ON jovia_codes(used);
      CREATE INDEX IF NOT EXISTS idx_jovia_type ON jovia_codes(type);
    `);
    for(let k in codes){
      try{
        db.prepare("INSERT OR IGNORE INTO jovia_codes (code,type,price,used,used_by,used_by_name,used_by_email,used_by_id,created_at,used_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(codes[k].code, codes[k].type, codes[k].price||0, codes[k].used?1:0, codes[k].used_by||'', codes[k].used_by_name||'', codes[k].used_by_email||'', codes[k].used_by_id||null, codes[k].created_at||new Date().toISOString(), codes[k].used_at||null);
      }catch(e){}
    }

    try{
      const cols = db.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
      if(!cols.includes('package')){
        db.exec("ALTER TABLE users ADD COLUMN package TEXT DEFAULT 'Silver'");
        console.log("✅ Created missing column: package");
      }
      if(!cols.includes('plan')){
        try{ db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'Silver'"); }catch(e){}
      }
      if(!cols.includes('is_super')){
        try{ db.exec("ALTER TABLE users ADD COLUMN is_super INTEGER DEFAULT 0"); }catch(e){}
      }
      if(!cols.includes('updated_at')){
        try{ db.exec("ALTER TABLE users ADD COLUMN updated_at TEXT DEFAULT CURRENT_TIMESTAMP"); }catch(e){}
      }
      if(!cols.includes('wallet_balance')){
        try{ db.exec("ALTER TABLE users ADD COLUMN wallet_balance INTEGER DEFAULT 0"); }catch(e){}
      }
    }catch(e){ console.log("Fix columns error:", e.message); }

  } catch(e){ console.log("DB init error:", e.message); }

  const getUserFromRequest = (req) => {
    const tryEmails = [req.body?.email, req.body?.userEmail, req.body?.customer_email, req.body?.username, req.query?.email, req.headers['x-user-email'], req.user?.email].filter(Boolean);
    try{
      if(req.user?.id){ const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id); if(u) return u; }
      if(req.user?.email){ const u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.user.email); if(u) return u; }
      for(let em of tryEmails){
        try{
          let u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(em);
          if(u) return u;
          u = db.prepare("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1").get(em);
          if(u) return u;
        }catch(e){}
      }
    }catch(e){}
    return null;
  };

  const isSuperUser = (user)=>{
    if(!user) return false;
    try{
      let pkg = String(user.package||user.plan||user.package_name||user.membership_level||user.tier||"").toLowerCase();
      if(pkg.includes("super")) return true;
      if(user.is_super==1) return true;
    }catch(e){}
    return false;
  };

  const find = (raw) => {
    raw = String(raw||"").toUpperCase().trim();
    try{ const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); if(row) return row; }catch(e){}
    if(codes[raw]) return codes[raw];
    try{ if(fs.existsSync(FILE)){ const f=JSON.parse(fs.readFileSync(FILE,'utf8')); if(f[raw]){ codes=f; return f[raw]; } } }catch(e){}
    return null;
  };

  app.post("/api/admin/codes/generate", (req,res) => {
    const t = String(req.body?.type||"").toLowerCase();
    let type = t.includes("gold") ? "super-gold" : t.includes("silver") ? "super-silver" : "withdraw";
    let out = [];
    for(let i=0;i<5;i++){ 
      let code = type==="withdraw" ? gen(6,"JOVIA-") : gen(8,"SUPER-"); 
      try{ let exists = db.prepare("SELECT code FROM jovia_codes WHERE code=?").get(code); if(exists){ i--; continue; } }catch(e){}
      let newCode = {code, type, price: type==="super-gold"?12000:type==="super-silver"?16000:0, used:0, used_by:"", used_by_name:"", used_by_email:"", used_by_id:null, created_at:new Date().toISOString(), used_at:null};
      codes[code] = newCode; out.push(newCode);
      try{ db.prepare("INSERT OR IGNORE INTO jovia_codes (code,type,price,used,created_at) VALUES (?,?,?,?,?)").run(code,type,newCode.price,0,newCode.created_at); }catch(e){}
    }
    save();
    let total=0; try{ total=db.prepare("SELECT COUNT(*) as c FROM jovia_codes").get().c; }catch(e){ total=Object.keys(codes).length; }
    res.json({success:true,codes:out,total});
  });

  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||req.body?.superCode||"").toUpperCase().trim();
    console.log(`[UPGRADE] Code=${raw} Email=${req.body?.email}`);
    if(!raw) return res.json({success:false,message:"No code sent"});
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found`});
    if(row.used){ let name=row.used_by||row.used_by_name||"unknown"; return res.json({success:false,message:`❌ Already USED by ${name} on ${row.used_at}`}); }
    if(row.type==="withdraw") return res.json({success:false,message:"This is JOVIA- withdraw code. Use SUPER- code"});

    let user = getUserFromRequest(req);
    let rawEmail = req.body?.email||req.body?.userEmail||req.user?.email||'guest';
    let rawUsername = req.body?.username||req.body?.fullName||'';
    let email = user?.email||rawEmail;
    let username = user?.username||user?.full_name||rawUsername||email.split('@')[0]||'User';
    let displayName = email.includes('@')?`${username} (${email})`:username;
    let now = new Date().toLocaleString('en-NG', {timeZone:'Africa/Lagos', hour12:true});

    if(!user){
      try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_at=? WHERE code=?").run(displayName, username, email, now, raw); }catch(e){}
      if(codes[raw]){ codes[raw].used=1; codes[raw].used_by=displayName; save(); }
      return res.json({success:true,message:`✅ Code accepted for ${displayName} - Login again to see SUPER`, package:'SUPER'});
    }

    let curPkg = String(user.package||user.plan||"").toLowerCase();
    if(curPkg.includes("silver") && row.type==="super-gold") return res.json({success:false,message:"❌ You are SILVER, need SUPER-SILVER N16k code"});
    if(curPkg.includes("gold") && row.type==="super-silver") return res.json({success:false,message:"❌ You are GOLD, need SUPER-GOLD N12k code"});

    let updated=false;
    const tryUpdate = (sql, params=[])=>{
      try{ db.prepare(sql).run(...params); updated=true; return true; }catch(e){ return false; }
    };

    tryUpdate("UPDATE users SET package='SUPER', updated_at=CURRENT_TIMESTAMP WHERE id=?", [user.id]);
    tryUpdate("UPDATE users SET plan='SUPER' WHERE id=?", [user.id]);
    tryUpdate("UPDATE users SET is_super=1 WHERE id=?", [user.id]);
    tryUpdate("UPDATE users SET account_status='active', status='active' WHERE id=?", [user.id]);
    tryUpdate("UPDATE users SET package_name='SUPER' WHERE id=?", [user.id]);

    if(!updated){
      return res.json({success:false, message:`❌ Can't update - check columns /api/debug/users-schema`});
    }

    // === FIXED: MARK AS USED PERMANENTLY IN DB + FILE - NEVER ACTIVE AGAIN ===
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_by_id=?, used_at=? WHERE code=?").run(displayName, username, email, user.id, now, raw); }catch(e){}
    if(codes[raw]){ codes[raw].used=1; codes[raw].used_by=displayName; codes[raw].used_by_name=username; codes[raw].used_by_email=email; codes[raw].used_at=now; codes[raw].used_by_id=user.id; save(); }

    const freshUser = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
    console.log(`[UPGRADED] ${email} -> SUPER with ${raw} - Code now USED`);

    return res.json({success:true, message:`✅ SUCCESS! ${displayName} upgraded to SUPER - Code now USED`, package:'SUPER', user:freshUser, used_by:displayName, used_at:now});
  });

  // === CRITICAL FIX: BYPASS DAILY N7K LIMIT FOR SUPER ===
  app.post("/api/videos/:id/complete", (req,res,next)=>{
    try{
      let user = getUserFromRequest(req);
      if(user && isSuperUser(user)){
        let videoId = req.params.id;
        console.log(`👑 SUPER bypass video ${videoId} for ${user.email}`);
        let video = null;
        try{ video = db.prepare("SELECT * FROM videos WHERE id=?").get(videoId); }catch(e){}
        try{ if(!video) video = db.prepare("SELECT * FROM jovia_videos WHERE id=?").get(videoId); }catch(e){}
        let reward = video ? Number(video.reward||0) : 500;
        try{ reward = Number(req.body?.reward||reward); }catch(e){}
        let currentBal = Number(user.wallet_balance||user.balance||user.wallet||0);
        let newBal = currentBal + reward;
        try{ db.prepare("UPDATE users SET wallet_balance=?, balance=? WHERE id=?").run(newBal, newBal, user.id); }catch(e){ try{ db.prepare("UPDATE users SET wallet_balance=? WHERE id=?").run(newBal, user.id); }catch(e2){} }
        try{ db.prepare("INSERT INTO transactions (user_id, type, amount, status, created_at) VALUES (?,?,?,?, datetime('now','localtime'))").run(user.id, "video_reward", reward, "completed"); }catch(e){}
        return res.json({success:true, message:`Claimed ₦${reward} as SUPER - Unlimited!`, reward, walletBalance:newBal, wallet_balance:newBal});
      }
      next();
    }catch(e){ next(); }
  });

  app.post("/api/jobs/:id/complete", (req,res,next)=>{
    try{
      let user = getUserFromRequest(req);
      if(user && isSuperUser(user)){
        let jobId = req.params.id;
        console.log(`👑 SUPER bypass job ${jobId} for ${user.email}`);
        let job = null;
        try{ job = db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId); }catch(e){}
        let reward = job ? Number(job.reward||0) : 500;
        let currentBal = Number(user.wallet_balance||user.balance||0);
        let newBal = currentBal + reward;
        try{ db.prepare("UPDATE users SET wallet_balance=?, balance=? WHERE id=?").run(newBal, newBal, user.id); }catch(e){ try{ db.prepare("UPDATE users SET wallet_balance=? WHERE id=?").run(newBal, user.id); }catch(e2){} }
        try{ db.prepare("INSERT INTO transactions (user_id, type, amount, status, created_at) VALUES (?,?,?,?, datetime('now','localtime'))").run(user.id, "job_reward", reward, "completed"); }catch(e){}
        return res.json({success:true, message:`Claimed ₦${reward} as SUPER - Unlimited!`, reward, walletBalance:newBal, wallet_balance:newBal});
      }
      next();
    }catch(e){ next(); }
  });

  app.post("/api/debug/force-super-me", (req,res)=>{
    try{
      let email = req.body?.email||req.user?.email||'';
      email = String(email).toLowerCase().trim();
      let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(email);
      if(!user) return res.json({success:false, message:"User not found"});
      db.prepare("UPDATE users SET package='SUPER', plan='SUPER', is_super=1, account_status='active', status='active' WHERE id=?").run(user.id);
      let fresh = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
      res.json({success:true, message:"Forced to SUPER - N7k limit cleared", user:fresh});
    }catch(e){ res.json({success:false, error:e.message}); }
  });

  app.post("/api/withdraw/apply-code", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found`});
    if(row.used) return res.json({success:false,message:`❌ Already USED by ${row.used_by||row.used_by_name} on ${row.used_at}`});
    let user = getUserFromRequest(req);
    let email = user?.email||req.body?.email||'guest';
    let username = user?.username||email.split('@')[0]||'User';
    let displayName = email.includes('@')?`${username} (${email})`:username;
    let now = new Date().toLocaleString('en-NG', {timeZone:'Africa/Lagos', hour12:true});
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_by_id=?, used_at=? WHERE code=?").run(displayName, username, email, user?.id||0, now, raw); }catch(e){}
    if(codes[raw]){ codes[raw].used=1; codes[raw].used_by=displayName; codes[raw].used_at=now; save(); }
    res.json({success:true, message:`✅ Verified for ${displayName}`, used_by:displayName, used_at:now});
  });

  app.get("/api/admin/codes/list", (req,res)=>{ 
    try{ let all=db.prepare("SELECT * FROM jovia_codes ORDER BY created_at DESC").all(); res.json({success:true,codes:all,total:all.length}); }
    catch(e){ res.json({success:true,codes:Object.values(codes),total:Object.keys(codes).length}); }
  });
  app.get("/api/admin/codes/check/:code", (req,res)=>{ 
    let r=find(req.params.code); if(!r) return res.json({success:false,exists:false});
    res.json({success:true,exists:true,code:r.code,type:r.type,price:r.price,used:!!r.used,used_by:r.used_by,used_by_name:r.used_by_name,used_by_email:r.used_by_email,used_at:r.used_at,created_at:r.created_at});
  });
  app.get("/api/debug/users-schema", (req,res)=>{
    try{
      const cols=db.prepare("PRAGMA table_info(users)").all();
      const sample=db.prepare("SELECT * FROM users LIMIT 1").get();
      res.json({success:true, columnNames:cols.map(c=>c.name), columns:cols, sampleKeys:sample?Object.keys(sample):[]});
    }catch(e){ res.json({success:false, error:e.message}); }
  });

  console.log("✅ JOVIA PLUGIN FIXED - CODE BECOMES USED INSTANTLY + SUPER UNLIMITED BYPASS + NO N7K LIMIT");
};
