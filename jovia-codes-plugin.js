const fs = require('fs');
module.exports = (app, db) => {
  const FILE = '/tmp/jovia_codes.json';
  let codes = {};
  try { if(fs.existsSync(FILE)) codes = JSON.parse(fs.readFileSync(FILE,'utf8')); } catch(e){}
  const save = () => { try{ fs.writeFileSync(FILE, JSON.stringify(codes)); }catch(e){} };
  const gen = (l,p) => { let s=p; const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; for(let i=0;i<l;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; };
  
  const getUserFromRequest = (req) => {
    try{
      if(req.user?.id){
        const u = db.prepare("SELECT * FROM users WHERE id=?").get(req.user.id);
        if(u) return u;
      }
      if(req.user?.email){
        const u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.user.email);
        if(u) return u;
      }
      if(req.body?.email){
        const u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.body.email);
        if(u) return u;
      }
      if(req.body?.userEmail){
        const u = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(req.body.userEmail);
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
      codes[code]={
        code: code,
        type: type,
        price: type==="super-gold"?12000:type==="super-silver"?16000:0,
        used: 0,
        used_by: "",
        used_by_name: "",
        used_by_email: "",
        created_at: new Date().toISOString(),
        used_at: null
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
    try { 
      const row = db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      if(row) return row;
    }catch(e){ return null; }
    return null;
  };

  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||req.body?.superCode||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found. Total: ${Object.keys(codes).length}`});
    if(row.used) {
      let displayName = row.used_by_name || row.used_by_email || row.used_by || "unknown";
      return res.json({success:false,message:`❌ Already USED by ${displayName} on ${row.used_at || 'unknown date'}`});
    }
    
    let user = getUserFromRequest(req);
    let email = user?.email || req.body?.email || req.body?.userEmail || 'unknown';
    let username = user?.username || user?.full_name || user?.name || email;
    let displayName = username + (email!==username ? ` (${email})` : '');
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'});

    if(codes[raw]){
      codes[raw].used=1;
      codes[raw].used_by=displayName;
      codes[raw].used_by_name=username;
      codes[raw].used_by_email=email;
      codes[raw].used_at=now;
      codes[raw].used_by_id=user?.id||0;
      save();
    }
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_id=?, used_at=? WHERE code=?").run(displayName, user?.id||0, now, raw); }catch(e){}

    res.json({success:true,message:`Code works! Upgraded! Used by ${displayName}`});
  });

  app.post("/api/withdraw/apply-code", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found`});
    if(row.used){
      let displayName = row.used_by_name || row.used_by_email || row.used_by || "unknown";
      return res.json({success:false,message:`❌ Already USED by ${displayName} on ${row.used_at}`});
    }

    let user = getUserFromRequest(req);
    let email = user?.email || req.body?.email || 'unknown';
    let username = user?.username || user?.full_name || user?.name || email;
    let displayName = username + (email!==username ? ` (${email})` : '');
    let now = new Date().toLocaleString('en-NG', {timeZone: 'Africa/Lagos'});

    if(codes[raw]){
      codes[raw].used=1;
      codes[raw].used_by=displayName;
      codes[raw].used_by_name=username;
      codes[raw].used_by_email=email;
      codes[raw].used_at=now;
      codes[raw].used_by_id=user?.id||0;
      save();
    }
    try{ db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_id=?, used_at=? WHERE code=?").run(displayName, user?.id||0, now, raw); }catch(e){}

    res.json({success:true,message:`Withdrawal verified for ${displayName}`});
  });

  app.get("/api/admin/codes/list", (req,res)=>{ 
    try{ if(fs.existsSync(FILE)) codes=JSON.parse(fs.readFileSync(FILE,'utf8')); }catch(e){} 
    res.json({success:true,codes:Object.values(codes)}); 
  });
  
  app.get("/api/admin/codes/check/:code", (req,res)=>{ 
    let r=find(req.params.code); 
    if(!r) return res.json({success:false,exists:false}); 
    res.json({success:true,exists:true,code:r.code,type:r.type,price:r.price,used:!!r.used,used_by:r.used_by,used_by_name:r.used_by_name,used_by_email:r.used_by_email,used_at:r.used_at,created_at:r.created_at}); 
  });
  
  console.log("✅ JOVIA PLUGIN - SHOW REAL NAME FIXED");
};
