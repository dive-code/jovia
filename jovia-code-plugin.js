// jovia-codes-plugin.js - FINAL WITH STRICT BLOCKING FOR BOTH CODES
module.exports = (app, db, requireUser, requireAdmin) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jovia_codes (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      price INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0,
      used_by TEXT DEFAULT '',
      used_by_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT
    );
  `);

  const gen = (len, prefix) => {
    const ch="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s="";
    for(let i=0;i<len;i++) s+=ch[Math.floor(Math.random()*ch.length)];
    return prefix+s;
  }

  // ADMIN GENERATE
  app.post("/api/admin/codes/generate", requireAdmin, (req,res)=>{
    try{
      const t=String(req.body?.type||"withdraw").toLowerCase();
      let price=0, codeType="withdraw", code;
      if(t.includes("gold")){ price=12000; codeType="super-gold"; code=gen(8,"SUPER-"); }
      else if(t.includes("silver")){ price=16000; codeType="super-silver"; code=gen(8,"SUPER-"); }
      else { codeType="withdraw"; code=gen(6,"JOVIA-"); }

      const count=Math.min(50,Math.max(1,Number(req.body?.count||1)));
      const out=[]; const stmt=db.prepare("INSERT INTO jovia_codes (code,type,price) VALUES (?,?,?)");
      for(let i=0;i<count;i++){
        let c = codeType==="withdraw" ? gen(6,"JOVIA-") : gen(8,"SUPER-");
        try{ stmt.run(c,codeType,price); out.push({code:c,type:codeType,price}); }
        catch{ i--; }
      }
      res.json({success:true,codes:out});
    }catch(e){ res.status(500).json({success:false,message:e.message}); }
  });

  // === STRICT BLOCKING FOR WITHDRAWAL ===
  app.post("/api/withdraw/apply-code", requireUser, (req,res)=>{
    try{
      const raw=String(req.body?.code||"").toUpperCase().trim();
      if(!raw.startsWith("JOVIA-")) return res.status(400).json({success:false,message:"BLOCKED: Invalid format. Must be JOVIA-XXXXXX"});
      const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      if(!row) return res.status(400).json({success:false,message:"BLOCKED: Code not found. Random code not allowed - Buy from admin"});
      if(row.used) return res.status(400).json({success:false,message:`BLOCKED: Already USED by ${row.used_by}`});
      if(row.type!=="withdraw") return res.status(400).json({success:false,message:"BLOCKED: This is SUPER upgrade code, not withdrawal code"});
      
      // Mark used immediately - ONE TIME ONLY
      db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_id=?, used_at=CURRENT_TIMESTAMP WHERE code=?")
        .run(req.user.email||req.user.username, req.user.id, raw);
      
      return res.json({success:true,message:"Withdrawal code verified - Proceed"});
    }catch(e){ return res.status(400).json({success:false,message:"BLOCKED: "+e.message}); }
  });

  // === STRICT BLOCKING FOR SUPER UPGRADE ===
  app.post("/api/upgrade/apply", requireUser, (req,res)=>{
    try{
      const raw=String(req.body?.code||"").toUpperCase().trim();
      if(!raw.startsWith("SUPER-")) return res.status(400).json({success:false,message:"BLOCKED: Must be SUPER-XXXXXXXX"});
      const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      if(!row) return res.status(400).json({success:false,message:"BLOCKED: Code not found - Buy from admin"});
      if(row.used) return res.status(400).json({success:false,message:`BLOCKED: ALREADY USED by ${row.used_by}`});
      if(!row.type.startsWith("super")) return res.status(400).json({success:false,message:"BLOCKED: This is withdrawal code, not SUPER code"});

      const status=String(req.user.account_status||req.user.status||"").toLowerCase();
      const isActive=["active","approved","silver","gold"].includes(status) || status.includes("gold") || status.includes("silver");
      if(!isActive) return res.status(400).json({success:false,message:"BLOCKED: Activate as Silver/Gold first"});

      if(String(req.user.package||"").toLowerCase().includes("super")) return res.status(400).json({success:false,message:"BLOCKED: Already SUPER"});

      const isSilver=String(req.user.package||"").toLowerCase().includes("silver");
      const need=isSilver?16000:12000;
      if(Number(row.price)!==need) return res.status(400).json({success:false,message:`BLOCKED: Wrong code type. You need N${need} code as ${isSilver?"Silver":"Gold"}, this code is N${row.price}`});

      db.transaction(()=>{
        const fresh=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
        if(fresh.used) throw new Error(`Already used by ${fresh.used_by}`);
        db.prepare("UPDATE users SET package='Super' WHERE id=?").run(req.user.id);
        db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_id=?, used_at=CURRENT_TIMESTAMP WHERE code=?").run(req.user.email||req.user.username, req.user.id, raw);
      })();

      return res.json({success:true,message:"Upgraded to SUPER"});
    }catch(e){ return res.status(400).json({success:false,message:e.message}); }
  });

  // ADMIN CHECK - by who
  app.get("/api/admin/codes/check/:code", requireAdmin, (req,res)=>{
    const raw=String(req.params.code||"").toUpperCase().trim();
    const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
    if(!row) return res.json({success:false,exists:false,message:"Not found"});
    res.json({success:true,exists:true,...row,used:!!row.used});
  });

  app.get("/api/admin/codes/list", requireAdmin, (req,res)=>{
    const rows=db.prepare("SELECT * FROM jovia_codes ORDER BY created_at DESC LIMIT 500").all();
    res.json({success:true,codes:rows});
  });

  app.post("/api/admin/codes/mark", requireAdmin, (req,res)=>{
    const code=String(req.body?.code||"").toUpperCase().trim();
    const used=req.body?.used?1:0; const who=String(req.body?.used_by||"admin");
    if(used) db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_at=CURRENT_TIMESTAMP WHERE code=?").run(who,code);
    else db.prepare("UPDATE jovia_codes SET used=0, used_by='', used_at='' WHERE code=?").run(code);
    res.json({success:true});
  });

  console.log("✅ JOVIA Codes Plugin Loaded - STRICT BLOCKING for JOVIA- and SUPER- + checker by who");
};
