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
    for(let k in codes){
      try{
        db.prepare("INSERT OR IGNORE INTO jovia_codes (code,type,price,used,used_by,used_by_name,used_by_email,used_by_id,created_at,used_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(codes[k].code, codes[k].type, codes[k].price||0, codes[k].used?1:0, codes[k].used_by||'', codes[k].used_by_name||'', codes[k].used_by_email||'', codes[k].used_by_id||null, codes[k].created_at||new Date().toISOString(), codes[k].used_at||null);
      }catch(e){}
    }
  } catch(e){}

  const getUserFromRequest = (req) => {
    const tryEmails = [req.body?.email, req.body?.userEmail, req.user?.email, req.query?.email].filter(Boolean);
    try{
      if(req.user?.id){ const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id); if(u) return u; }
      for(let em of tryEmails){
        let u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(em);
        if(u) return u;
        u = db.prepare("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1").get(em);
        if(u) return u;
      }
    }catch(e){}
    return null;
  };

  app.post("/api/admin/codes/generate", (req,res) => {
    const t = String(req.body?.type||"").toLowerCase();
    let type = t.includes("gold") ? "super-gold" : t.includes("silver") ? "super-silver" : "withdraw";
    let out = [];
    for(let i=0;i<5;i++){ 
      let code = type==="withdraw" ? gen(6,"JOVIA-") : gen(8,"SUPER-"); 
      try{ if(db.prepare("SELECT code FROM jovia_codes WHERE code=?").get(code)){ i--; continue; } }catch(e){}
      let nc = {code, type, price: type==="super-gold"?12000:type==="super-silver"?16000:0, used:0, used_by:"", used_by_name:"", used_by_email:"", used_by_id:null, created_at:new Date().toISOString(), used_at:null};
      codes[code]=nc; out.push(nc);
      try{ db.prepare("INSERT INTO jovia_codes (code,type,price,used,created_at) VALUES (?,?,?,?,?)").run(code,type,nc.price,0,nc.created_at); }catch(e){}
    }
    save();
    let total=0; try{ total=db.prepare("SELECT COUNT(*) as c FROM jovia_codes").get().c; }catch(e){}
    res.json({success:true,codes:out,total});
  });

  const find = (raw) => {
    raw = String(raw||"").toUpperCase().trim();
    try { const row = db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); if(row) return row; }catch(e){}
    if(codes[raw]) return codes[raw];
    try { if(fs.existsSync(FILE)){ const f=JSON.parse(fs.readFileSync(FILE,'utf8')); if(f[raw]){ codes=f; return f[raw]; } } }catch(e){}
    return null;
  };

  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||req.body?.superCode||"").toUpperCase().trim();
    console.log(`[UPGRADE ATTEMPT] Code: ${raw} Email: ${req.body?.email}`);
    if(!raw) return res.json({success:false,message:"No code sent"});

    let row = find(raw);
    if(!row){ console.log(`Code not found: ${raw}`); return res.json({success:false,message:`INVALID: ${raw} not found`}); }
    console.log(`Found row: ${row.code} used=${row.used}`);
    if(row.used){
      let name = row.used_by || row.used_by_name || "unknown";
      console.log(`Already used by ${name}`);
      return res.json({success:false,message:`❌ Already USED by ${name} on ${row.used_at}`});
    }
    if(row.type === "withdraw") return res.json({success:false,message:"This is JOVIA- withdraw code, use SUPER- code"});

    let user = getUserFromRequest(req);
    console.log(`User found: ${user ? user.email + ' package=' + user.package + ' plan=' + user.plan : 'NULL'}`);
    if(!user){
      return res.json({success:false,message:`User not found for email ${req.body?.email}. Login again. DB has ${req.body?.email}?`});
    }

    let email = user.email;
    let username = user.username || user.full_name || email.split('@')[0];
    let displayName = `${username} (${email})`;
    let now = new Date().toLocaleString('en-NG', {timeZone:'Africa/Lagos', hour12:true});

    // CHEAT-PROOF
    let curPkg = String(user.package||user.plan||"").toLowerCase();
    if(curPkg.includes("silver") && row.type==="super-gold") return res.json({success:false,message:"You are SILVER, need SUPER-SILVER N16k"});
    if(curPkg.includes("gold") && row.type==="super-silver") return res.json({success:false,message:"You are GOLD, need SUPER-GOLD N12k"});

    // === MAIN FIX - UPDATE ALL POSSIBLE COLUMNS SO IT NEVER FAILS ===
    let updated = false;
    const colsToTry = ["package", "plan", "package_name", "user_package", "membership"];
    for(let col of colsToTry){
      try{
        db.prepare(`UPDATE users SET ${col}='SUPER' WHERE id=?`).run(user.id);
        console.log(`✅ Updated ${col} to SUPER for ${email}`);
        updated = true;
      }catch(e){ /* column doesn't exist, ignore */ }
    }
    // Also try update status to active if pending
    try{ db.prepare("UPDATE users SET account_status='active', status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id); }catch(e){}
    try{ db.prepare("UPDATE users SET updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id); }catch(e){}

    if(!updated){
      console.log("❌ FAILED to update any package column");
      return res.json({success:false,message:"DB has no package column - tell me your users table columns"});
    }

    // === MARK CODE AS USED IN DB - PERMANENT ===
    try{
      db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_by_id=?, used_at=? WHERE code=?")
        .run(displayName, username, email, user.id, now, raw);
      console.log(`✅ Code ${raw} marked USED by ${displayName} in DB`);
    }catch(e){ console.log("Mark used error:", e.message); }

    // Also update file
    if(codes[raw]){ codes[raw].used=1; codes[raw].used_by=displayName; codes[raw].used_at=now; save(); }

    const freshUser = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
    console.log(`[AFTER UPGRADE] ${email} now package=${freshUser.package} plan=${freshUser.plan}`);

    return res.json({
      success:true,
      message:`✅ SUCCESS! ${displayName} upgraded to SUPER - Reloading...`,
      package:'SUPER',
      newPackage:'SUPER',
      user:freshUser,
      used_by:displayName,
      used_at:now
    });
  });

  app.post("/api/withdraw/apply-code", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:"INVALID"});
    if(row.used) return res.json({success:false,message:`Already USED by ${row.used_by}`});
    let user = getUserFromRequest(req);
    let email = user?.email || req.body?.email || 'guest';
    let username = user?.username || email.split('@')[0];
    let displayName = `${username} (${email})`;
    let now = new Date().toLocaleString('en-NG', {timeZone:'Africa/Lagos', hour12:true});
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_at=? WHERE code=?").run(displayName, username, email, now, raw); }catch(e){}
    res.json({success:true});
  });

  app.get("/api/admin/codes/list", (req,res)=>{ 
    try{ let all=db.prepare("SELECT * FROM jovia_codes ORDER BY created_at DESC").all(); res.json({success:true,codes:all,total:all.length}); }
    catch(e){ res.json({success:true,codes:Object.values(codes),total:Object.keys(codes).length}); }
  });
  app.get("/api/admin/codes/check/:code", (req,res)=>{ let r=find(req.params.code); if(!r) return res.json({success:false,exists:false}); res.json({success:true,exists:true,...r, used:!!r.used}); });

  // DEBUG: force super for your email - use once then remove
  app.post("/api/admin/force-super", (req,res)=>{
    let email = req.body?.email;
    if(!email) return res.json({success:false});
    try{
      let u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(email);
      if(!u) return res.json({success:false,message:"user not found"});
      for(let col of ["package","plan","package_name"]){ try{ db.prepare(`UPDATE users SET ${col}='SUPER' WHERE id=?`).run(u.id); }catch(e){} }
      let fresh = db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
      return res.json({success:true,user:fresh});
    }catch(e){ return res.json({success:false,message:e.message}); }
  });

  console.log("✅ JOVIA PLUGIN - FINAL FIX - CODE MARKED USED + PACKAGE UPDATED");
};
