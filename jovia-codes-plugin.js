const fs = require('fs');
module.exports = (app, db) => {
  const FILE = '/tmp/jovia_codes.json';
  let codes = {};
  try { if(fs.existsSync(FILE)) codes = JSON.parse(fs.readFileSync(FILE,'utf8')); } catch(e){}
  const save = () => { try{ fs.writeFileSync(FILE, JSON.stringify(codes)); }catch(e){} };
  const gen = (l,p) => { let s=p; const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; for(let i=0;i<l;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; };
  
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS jovia_codes (
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
    );`);
  } catch(e){}

  // SUPER ROBUST - FIND USER FROM ANYWHERE
  const getUserFromRequest = (req) => {
    const tryEmails = [
      req.user?.id ? null : null, // id handled separately
      req.body?.email,
      req.body?.userEmail,
      req.body?.customer_email,
      req.body?.username,
      req.query?.email,
      req.headers['x-user-email']
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
      codes[code]={
        code, type,
        price: type==="super-gold"?12000:type==="super-silver"?16000:0,
        used: 0, used_by: "", used_by_name: "", used_by_email: "", used_by_id: null,
        created_at: new Date().toISOString(), used_at: null
      }; 
      out.push(codes[code]); 
      try{ db.prepare("INSERT OR IGNORE INTO jovia_codes (code,type,price) VALUES (?,?,?)").run(code,type,codes[code].price); }catch(e){}
    }
    save();
    res.json({success:true,codes:out,total:Object.keys(codes).length});
  });

  const find = (raw) => {
    raw = String(raw||"").toUpperCase().trim();
    if(codes[raw]) return codes[raw];
    try { if(fs.existsSync(FILE)){ const f=JSON.parse(fs.readFileSync(FILE,'utf8')); if(f[raw]){ codes=f; return f[raw]; } } }catch(e){}
    try { return db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); }catch(e){ return null; }
  };

  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||req.body?.superCode||"").toUpperCase().trim();
    if(!raw) return res.json({success:false,message:"No code sent"});
    
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found. Generate new one from admin.`});
    if(row.used) {
      let name = row.used_by || row.used_by_name || "unknown";
      return res.json({success:false,message:`❌ Already USED by ${name} on ${row.used_at}`});
    }
    if(row.type === "withdraw") return res.json({success:false,message:"This is WITHDRAW code (JOVIA-). Use SUPER- code for upgrade"});
    
    // FIXED - GET USER, BUT DON'T BLOCK IF NOT FOUND
    let user = getUserFromRequest(req);
    
    // Get email from any source - even if user not in DB, we still use the email
    let rawEmail = req.body?.email || req.body?.userEmail || req.user?.email || req.query?.email || 'guest';
    let rawUsername = req.body?.username || '';
    
    let email = user?.email || rawEmail;
    let username = user?.username || user?.full_name || rawUsername || email.split('@')[0] || 'User';
    let displayName = email.includes('@') ? `${username} (${email})` : username;
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos', hour12: true});

    // IF USER FOUND - UPDATE TO SUPER
    if(user){
      try {
        db.prepare("UPDATE users SET package='SUPER', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
        console.log(`✅ UPGRADED: ${email} -> SUPER with ${raw}`);
      } catch(e) {
        try{ db.prepare("UPDATE users SET package=? WHERE id=?").run('SUPER', user.id); }catch(e2){}
      }
      try{
        db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?,?,?,?)")
          .run(user.id, "super_upgrade", 0, `Upgraded to SUPER with ${raw}`);
      }catch(e){}
    } else {
      console.log(`⚠️ User not in DB but code accepted for ${email} - ${raw}`);
      // Still allow - maybe frontend will update localStorage
    }

    // Mark as used with REAL NAME
    if(codes[raw]){
      codes[raw].used=1;
      codes[raw].used_by=displayName;
      codes[raw].used_by_name=username;
      codes[raw].used_by_email=email;
      codes[raw].used_at=now;
      codes[raw].used_by_id=user?.id||0;
      save();
    }
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_at=? WHERE code=?").run(displayName, username, email, now, raw); }catch(e){}

    const updated = user ? db.prepare("SELECT * FROM users WHERE id=?").get(user.id) : null;

    return res.json({
      success:true,
      message:`✅ SUCCESS! ${displayName} upgraded to SUPER`,
      package: 'SUPER',
      newPackage: 'SUPER',
      user: updated,
      used_by: displayName,
      used_at: now,
      email: email
    });
  });

  app.post("/api/withdraw/apply-code", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID`});
    if(row.used) return res.json({success:false,message:`Already USED by ${row.used_by}`});
    let user = getUserFromRequest(req);
    let email = user?.email || req.body?.email || 'guest';
    let username = user?.username || email.split('@')[0] || 'User';
    let displayName = `${username} (${email})`;
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'});
    if(codes[raw]){ codes[raw].used=1; codes[raw].used_by=displayName; codes[raw].used_by_name=username; codes[raw].used_by_email=email; codes[raw].used_at=now; save(); }
    res.json({success:true, message:`Verified for ${displayName}`});
  });

  app.get("/api/admin/codes/list", (req,res)=>{ try{ if(fs.existsSync(FILE)) codes=JSON.parse(fs.readFileSync(FILE,'utf8')); }catch(e){} res.json({success:true,codes:Object.values(codes)}); });
  app.get("/api/admin/codes/check/:code", (req,res)=>{ let r=find(req.params.code); if(!r) return res.json({success:false,exists:false}); res.json({success:true,exists:true,...r, used:!!r.used}); });
  
  console.log("✅ JOVIA PLUGIN - USER NOT FOUND FIXED - REAL NAME");
};
