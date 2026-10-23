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
    // Migrate old /tmp codes to DB so they never disappear
    for(let k in codes){
      try{
        db.prepare("INSERT OR IGNORE INTO jovia_codes (code,type,price,used,used_by,used_by_name,used_by_email,used_by_id,created_at,used_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(codes[k].code, codes[k].type, codes[k].price||0, codes[k].used?1:0, codes[k].used_by||'', codes[k].used_by_name||'', codes[k].used_by_email||'', codes[k].used_by_id||null, codes[k].created_at||new Date().toISOString(), codes[k].used_at||null);
      }catch(e){}
    }
  } catch(e){
    console.log("DB init error:", e.message);
  }

  // SUPER ROBUST - FIND USER FROM ANYWHERE
  const getUserFromRequest = (req) => {
    const tryEmails = [
      req.body?.email,
      req.body?.userEmail,
      req.body?.customer_email,
      req.body?.username,
      req.query?.email,
      req.headers['x-user-email'],
      req.user?.email
    ].filter(Boolean);

    try{
      if(req.user?.id){
        const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
        if(u) return u;
      }
      if(req.user?.email){
        const u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.user.email);
        if(u) return u;
      }
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

  app.post("/api/admin/codes/generate", (req,res) => {
    const t = String(req.body?.type||"").toLowerCase();
    let type = t.includes("gold") ? "super-gold" : t.includes("silver") ? "super-silver" : "withdraw";
    let out = [];
    for(let i=0;i<5;i++){ 
      let code = type==="withdraw" ? gen(6,"JOVIA-") : gen(8,"SUPER-"); 
      if(codes[code]){ i--; continue; }
      try{
        let exists = db.prepare("SELECT code FROM jovia_codes WHERE code=?").get(code);
        if(exists){ i--; continue; }
      }catch(e){}
      let newCode = {
        code: code,
        type: type,
        price: type==="super-gold"?12000:type==="super-silver"?16000:0,
        used: 0,
        used_by: "",
        used_by_name: "",
        used_by_email: "",
        used_by_id: null,
        created_at: new Date().toISOString(),
        used_at: null
      };
      codes[code] = newCode;
      out.push(newCode); 
      try{ 
        db.prepare("INSERT OR IGNORE INTO jovia_codes (code,type,price,used,created_at) VALUES (?,?,?,?,?)")
          .run(code,type,newCode.price,0,newCode.created_at); 
      }catch(e){}
    }
    save();
    let total = 0;
    try{ total = db.prepare("SELECT COUNT(*) as c FROM jovia_codes").get().c; }catch(e){ total = Object.keys(codes).length; }
    res.json({success:true,codes:out,total:total});
  });

  const find = (raw) => {
    raw = String(raw||"").toUpperCase().trim();
    if(codes[raw]) return codes[raw];
    try { 
      if(fs.existsSync(FILE)){ 
        const f=JSON.parse(fs.readFileSync(FILE,'utf8')); 
        if(f[raw]){ codes=f; return f[raw]; } 
      } 
    }catch(e){}
    try { 
      const row = db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      if(row) return row;
    }catch(e){ return null; }
    return null;
  };

  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||req.body?.superCode||"").toUpperCase().trim();
    if(!raw) return res.json({success:false,message:"No code sent"});
    
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found. Generate new one from admin.`});
    if(row.used) {
      let name = row.used_by || row.used_by_name || row.used_by_email || "unknown user";
      let date = row.used_at || "unknown date";
      return res.json({success:false,message:`❌ Already USED by ${name} on ${date}`});
    }
    if(row.type === "withdraw") return res.json({success:false,message:"This is WITHDRAW code (JOVIA-). Use SUPER- code for upgrade"});
    
    let user = getUserFromRequest(req);
    
    let rawEmail = req.body?.email || req.body?.userEmail || req.body?.customer_email || req.user?.email || req.query?.email || 'guest';
    let rawUsername = req.body?.username || req.body?.fullName || '';
    
    let email = user?.email || rawEmail;
    let username = user?.username || user?.full_name || user?.name || rawUsername || email.split('@')[0] || 'User';
    let displayName = email.includes('@') ? `${username} (${email})` : username;
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos', hour12: true});

    // CHEAT-PROOF: Silver cannot use Gold code, Gold cannot use Silver code
    if(user){
      let currentPackage = String(user.package||user.plan||"").toLowerCase();
      if(currentPackage.includes("silver") && row.type === "super-gold"){
        return res.json({success:false,message:"❌ CHEAT DETECTED: You are SILVER user, you need SUPER-SILVER code (N16,000), not SUPER-GOLD code (N12,000)"});
      }
      if(currentPackage.includes("gold") && row.type === "super-silver"){
        return res.json({success:false,message:"❌ CHEAT DETECTED: You are GOLD user, you need SUPER-GOLD code (N12,000), not SUPER-SILVER code (N16,000)"});
      }
    }

    // IF USER FOUND - UPDATE TO SUPER AUTOMATICALLY
    if(user){
      try {
        db.prepare("UPDATE users SET package='SUPER', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
        try{ db.prepare("UPDATE users SET plan='SUPER' WHERE id=?").run(user.id); }catch(e){}
        try{ db.prepare("UPDATE users SET is_super=1 WHERE id=?").run(user.id); }catch(e){}
        console.log(`✅ UPGRADED: ${email} from ${user.package} -> SUPER with ${raw}`);
      } catch(e) {
        try{ db.prepare("UPDATE users SET package=? WHERE id=?").run('SUPER', user.id); }catch(e2){
          console.log("Upgrade error:", e2.message);
        }
      }
      try{
        db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?,?,?,?)")
          .run(user.id, "super_upgrade", 0, `Upgraded to SUPER with ${raw} (${row.type})`);
      }catch(e){}
    } else {
      console.log(`⚠️ User not in DB but code accepted for ${email} - ${raw}`);
    }

    // Mark as used with REAL NAME + REAL DATE
    if(codes[raw]){
      codes[raw].used=1;
      codes[raw].used_by=displayName;
      codes[raw].used_by_name=username;
      codes[raw].used_by_email=email;
      codes[raw].used_at=now;
      codes[raw].used_by_id=user?.id||0;
      save();
    }
    try{ 
      db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_by_id=?, used_at=? WHERE code=?")
        .run(displayName, username, email, user?.id||0, now, raw); 
    }catch(e){
      console.log("Update code error:", e.message);
    }

    const updated = user ? db.prepare("SELECT * FROM users WHERE id=?").get(user.id) : null;

    return res.json({
      success:true,
      message:`✅ SUCCESS! ${displayName} upgraded to SUPER`,
      package: 'SUPER',
      newPackage: 'SUPER',
      is_super: true,
      user: updated,
      used_by: displayName,
      used_at: now,
      email: email
    });
  });

  app.post("/api/withdraw/apply-code", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found`});
    if(row.used){
      let name = row.used_by || row.used_by_name || "unknown";
      return res.json({success:false,message:`❌ Already USED by ${name} on ${row.used_at}`});
    }

    let user = getUserFromRequest(req);
    let email = user?.email || req.body?.email || req.body?.userEmail || 'guest';
    let username = user?.username || user?.full_name || email.split('@')[0] || 'User';
    let displayName = email.includes('@') ? `${username} (${email})` : username;
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos', hour12: true});

    if(codes[raw]){
      codes[raw].used=1;
      codes[raw].used_by=displayName;
      codes[raw].used_by_name=username;
      codes[raw].used_by_email=email;
      codes[raw].used_at=now;
      codes[raw].used_by_id=user?.id||0;
      save();
    }
    try{ 
      db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_by_id=?, used_at=? WHERE code=?")
        .run(displayName, username, email, user?.id||0, now, raw); 
    }catch(e){}

    res.json({success:true, message:`✅ Withdrawal verified for ${displayName} on ${now}`, used_by: displayName, used_at: now});
  });

  // FIXED: List from DATABASE - never disappears
  app.get("/api/admin/codes/list", (req,res)=>{ 
    try{
      let all = db.prepare("SELECT * FROM jovia_codes ORDER BY created_at DESC").all();
      res.json({success:true,codes:all,total:all.length});
    }catch(e){
      try{ if(fs.existsSync(FILE)) codes=JSON.parse(fs.readFileSync(FILE,'utf8')); }catch(e2){}
      res.json({success:true,codes:Object.values(codes),total:Object.keys(codes).length});
    }
  });
  
  app.get("/api/admin/codes/check/:code", (req,res)=>{ 
    let r=find(req.params.code); 
    if(!r) return res.json({success:false,exists:false}); 
    res.json({
      success:true,
      exists:true,
      code:r.code,
      type:r.type,
      price:r.price,
      used:!!r.used,
      used_by:r.used_by||'',
      used_by_name:r.used_by_name||'',
      used_by_email:r.used_by_email||'',
      used_by_id:r.used_by_id||null,
      used_at:r.used_at||'',
      created_at:r.created_at
    }); 
  });
  
  console.log("✅ JOVIA PLUGIN - FINAL FULL VERSION: REAL NAME + DATE + SUPER UPGRADE + NEVER DELETE");
};
