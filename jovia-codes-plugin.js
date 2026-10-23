const fs = require('fs');
module.exports = (app, db) => {
  const FILE = '/tmp/jovia_codes.json';
  let codes = {};
  try { if(fs.existsSync(FILE)) codes = JSON.parse(fs.readFileSync(FILE,'utf8')); } catch(e){}
  const save = () => { try{ fs.writeFileSync(FILE, JSON.stringify(codes)); }catch(e){} };
  const gen = (l,p) => { let s=p; const c="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; for(let i=0;i<l;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; };
  
  app.post("/api/admin/codes/generate", (req,res) => {
    const t = String(req.body?.type||"").toLowerCase();
    let type = t.includes("gold") ? "super-gold" : t.includes("silver") ? "super-silver" : "withdraw";
    let out = [];
    for(let i=0;i<5;i++){ let code = type==="withdraw" ? gen(6,"JOVIA-") : gen(8,"SUPER-"); codes[code]={code,type,used:0,created_at:new Date().toISOString()}; out.push(codes[code]); }
    save();
    res.json({success:true,codes:out,total:Object.keys(codes).length});
  });

  const find = (raw) => {
    raw = raw.toUpperCase().trim();
    if(codes[raw]) return codes[raw];
    try { if(fs.existsSync(FILE)){ const f=JSON.parse(fs.readFileSync(FILE,'utf8')); if(f[raw]){ codes=f; return f[raw]; } } }catch(e){}
    try { return db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw); }catch(e){ return null; }
  };

  app.post("/api/upgrade/apply", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found. Total: ${Object.keys(codes).length}. Generate new one.`});
    if(row.used) return res.json({success:false,message:`USED by ${row.used_by}`});
    codes[raw].used=1; codes[raw].used_by=req.body?.email||'user'; save();
    res.json({success:true,message:"Code works! Upgraded!"});
  });

  app.post("/api/withdraw/apply-code", (req,res) => {
    let raw = String(req.body?.code||"").toUpperCase().trim();
    let row = find(raw);
    if(!row) return res.json({success:false,message:`INVALID: ${raw} not found`});
    if(row.used) return res.json({success:false,message:`USED by ${row.used_by}`});
    codes[raw].used=1; codes[raw].used_by='user'; save();
    res.json({success:true});
  });

  app.get("/api/admin/codes/list", (req,res)=>{ try{ if(fs.existsSync(FILE)) codes=JSON.parse(fs.readFileSync(FILE,'utf8')); }catch(e){} res.json({success:true,codes:Object.values(codes)}); });
  app.get("/api/admin/codes/check/:code", (req,res)=>{ let r=find(req.params.code); if(!r) return res.json({success:false}); res.json({success:true,exists:true,...r}); });
  console.log("✅ JOVIA PLUGIN FIXED - NO SERVER NEEDED");
};
