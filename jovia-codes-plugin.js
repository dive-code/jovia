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

  const getUserFromRequest = (req) => {
    try{
      if(req.user?.id) return db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
      if(req.user?.email) {
        let u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.user.email);
        if(u) return u;
      }
      if(req.body?.email) {
        let u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.body.email);
        if(u) return u;
      }
      if(req.body?.userEmail) {
        let u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.body.userEmail);
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

  // === THIS IS THE MAIN FIX - AUTO UPDATE TO SUPER ===
  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||req.body?.superCode||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found`});
    if(row.used) {
      let name = row.used_by || row.used_by_name || "unknown";
      return res.json({success:false,message:`❌ Already USED by ${name} on ${row.used_at}`});
    }
    if(row.type === "withdraw") return res.json({success:false,message:"This is WITHDRAW code, use SUPER code for upgrade"});
    
    let user = getUserFromRequest(req);
    if(!user) return res.json({success:false,message:"User not found - please login again"});

    let email = user.email;
    let username = user.username || user.full_name || email.split('@')[0];
    let displayName = `${username} (${email})`;
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'});

    // AUTO CHANGE TO SUPER PLAN - THIS WAS MISSING BEFORE
    try {
      // Update package to SUPER
      db.prepare("UPDATE users SET package='SUPER', package_amount=0, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(user.id);
      console.log(`✅ UPGRADED TO SUPER: ${email} from ${user.package} -> SUPER with ${raw}`);
    } catch(e) {
      // If package column different, try alternative
      try{
        db.prepare("UPDATE users SET package=? WHERE id=?").run('SUPER', user.id);
      } catch(e2){
        return res.json({success:false,message:"DB Update failed: "+e2.message});
      }
    }

    // Log transaction
    try{
      db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?,?,?,?)")
        .run(user.id, "super_upgrade", 0, `Upgraded to SUPER with ${raw} (${row.type})`);
    }catch(e){}

    // Mark code as used with REAL NAME + DATE
    if(codes[raw]){
      codes[raw].used=1;
      codes[raw].used_by=displayName;
      codes[raw].used_by_name=username;
      codes[raw].used_by_email=email;
      codes[raw].used_at=now;
      codes[raw].used_by_id=user.id;
      save();
    }
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_name=?, used_by_email=?, used_at=? WHERE code=?").run(displayName, username, email, now, raw); }catch(e){}

    const updated = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);

    return res.json({
      success:true,
      message:`✅ SUCCESS! ${username} upgraded to SUPER PLAN`,
      package: 'SUPER',
      newPackage: 'SUPER',
      user: updated,
      used_by: displayName,
      used_at: now
    });
  });

  app.post("/api/withdraw/apply-code", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID`});
    if(row.used) return res.json({success:false,message:`Already USED by ${row.used_by}`});
    let user = getUserFromRequest(req);
    let displayName = user ? `${user.username} (${user.email})` : 'user';
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'});
    if(codes[raw]){ codes[raw].used=1; codes[raw].used_by=displayName; codes[raw].used_at=now; save(); }
    res.json({success:true});
  });

  app.get("/api/admin/codes/list", (req,res)=>{ try{ if(fs.existsSync(FILE)) codes=JSON.parse(fs.readFileSync(FILE,'utf8')); }catch(e){} res.json({success:true,codes:Object.values(codes)}); });
  app.get("/api/admin/codes/check/:code", (req,res)=>{ let r=find(req.params.code); if(!r) return res.json({success:false,exists:false}); res.json({success:true,exists:true,...r, used:!!r.used}); });
  
  console.log("✅ JOVIA PLUGIN - AUTO SUPER UPDATE + REAL NAME FIXED");
};
