// jovia-codes-plugin.js - FINAL STRICT + AUTO UPGRADE VERSION
module.exports = (app, db) => {
  try{
    db.exec(`CREATE TABLE IF NOT EXISTS jovia_codes (
      code TEXT PRIMARY KEY, type TEXT NOT NULL, price INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0, used_by TEXT DEFAULT '', used_by_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, used_at TEXT
    );`);

    const gen = (len, pref)=>{
      const ch="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let s="";
      for(let i=0;i<len;i++) s+=ch[Math.floor(Math.random()*ch.length)];
      return pref+s;
    };

    const PACKAGES_AMOUNT = { Silver: 12000, Gold: 16000 };

    // === GENERATE ===
    app.post("/api/admin/codes/generate", (req,res)=>{
      const t=String(req.body?.type||"withdraw").toLowerCase();
      let price=0, ctype="withdraw";
      if(t.includes("gold")){ price=12000; ctype="super-gold"; }
      else if(t.includes("silver")){ price=16000; ctype="super-silver"; }
      else ctype="withdraw";
      const count=Math.min(50,Math.max(1,Number(req.body?.count||1)));
      const out=[]; const stmt=db.prepare("INSERT INTO jovia_codes (code,type,price) VALUES (?,?,?)");
      for(let i=0;i<count;i++){
        let c = ctype==="withdraw" ? gen(6,"JOVIA-") : gen(8,"SUPER-");
        try{ stmt.run(c,ctype,price); out.push({code:c,type:ctype,price}); }catch{ i--; }
      }
      res.json({success:true,codes:out});
    });

    // === UPGRADE / SUPER APPLY - STRICT ===
    const upgradeHandler = (req,res)=>{
      try{
        const raw=String(req.body?.code||req.body?.superCode||"").toUpperCase().trim();
        if(!raw) return res.status(400).json({success:false,message:"No code provided"});

        // 1. MUST start with SUPER-
        if(!raw.startsWith("SUPER-")){
          return res.status(400).json({success:false,message:"INVALID CODE: Must be SUPER-XXXXXXXX. Only codes from Admin dashboard allowed."});
        }

        // 2. MUST exist in jovia_codes table ONLY
        const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
        if(!row){
          return res.status(400).json({success:false,message:"INVALID CODE: Code not found. Only codes generated from Jovia Codes Plugin allowed. Random codes BLOCKED."});
        }

        // 3. MUST not be used before
        if(row.used){
          return res.status(400).json({success:false,message:`CODE ALREADY USED by ${row.used_by} on ${row.used_at}. One code = One user only.`});
        }

        // 4. MUST be super type, not withdrawal
        if(row.type==="withdraw" || !row.type.startsWith("super")){
          return res.status(400).json({success:false,message:"INVALID: This is WITHDRAWAL code (JOVIA-...). You cannot use withdrawal code for upgrade. Use SUPER- code."});
        }

        // 5. Find user
        let userId = req.user?.id || req.body?.userId;
        let userEmail = req.user?.email || req.body?.email;
        let user = null;
        if(userId) user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
        if(!user && userEmail) user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(userEmail);
        if(!user && req.user?.username) user = db.prepare("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1").get(req.user.username);
        
        if(!user){
          return res.status(404).json({success:false,message:"User not found - login again"});
        }

        // 6. Determine package from code type
        let newPackage = "Silver";
        if(row.type==="super-gold") newPackage = "Gold";
        else if(row.type==="super-silver") newPackage = "Silver";
        else {
          // fallback based on price
          newPackage = row.price===12000 ? "Gold" : "Silver";
        }

        const newAmount = PACKAGES_AMOUNT[newPackage] || 12000;

        // 7. UPDATE USER PACKAGE - THIS WILL CHANGE DASHBOARD
        db.prepare("UPDATE users SET package=?, package_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(newPackage, newAmount, user.id);
        
        // 8. Mark code as USED 1=1
        db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_id=?, used_at=CURRENT_TIMESTAMP WHERE code=?").run(user.email||user.username, user.id, raw);

        // 9. Log transaction
        try{
          db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, description) VALUES (?,?,?,?)").run(user.id, "upgrade", 0, `Upgraded to ${newPackage} with code ${raw}`);
        }catch(e){}

        const updatedUser = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
        
        console.log(`✅ UPGRADED: ${user.email} -> ${newPackage} with ${raw}`);

        return res.json({
          success:true,
          message:`SUCCESS: Upgraded to ${newPackage}`,
          package: newPackage,
          newPackage: newPackage,
          user: updatedUser,
          code: raw
        });

      }catch(e){
        console.error("Upgrade error:", e);
        return res.status(500).json({success:false,message:e.message});
      }
    };

    app.post("/api/upgrade/apply", upgradeHandler);
    app.post("/api/upgrade/verify", upgradeHandler);
    app.post("/api/super/apply", upgradeHandler);

    // === WITHDRAWAL - STRICT ===
    app.post("/api/withdraw/apply-code", (req,res)=>{
      const raw=String(req.body?.code||"").toUpperCase().trim();
      if(!raw.startsWith("JOVIA-")){
        return res.status(400).json({success:false,message:"INVALID: Must be JOVIA-XXXXXX. Withdrawal code only."});
      }
      const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      if(!row) return res.status(400).json({success:false,message:"INVALID CODE: Not found. Random codes BLOCKED. Generate from admin."});
      if(row.used) return res.status(400).json({success:false,message:`ALREADY USED by ${row.used_by}`});
      if(row.type!=="withdraw") return res.status(400).json({success:false,message:"INVALID: This is SUPER code. Use JOVIA- code for withdrawal."});
      
      db.prepare("UPDATE jovia_codes SET used=1, used_by=?, used_by_id=?, used_at=CURRENT_TIMESTAMP WHERE code=?").run(req.user?.email||'user', req.user?.id||0, raw);
      res.json({success:true,message:"Withdrawal code verified"});
    });

    app.get("/api/admin/codes/list", (req,res)=>{
      try{
        const rows=db.prepare("SELECT * FROM jovia_codes ORDER BY created_at DESC LIMIT 500").all();
        res.json({success:true,codes:rows});
      }catch(e){ res.json({success:true,codes:[]}); }
    });

    app.get("/api/admin/codes/check/:code", (req,res)=>{
      const raw=String(req.params.code||"").toUpperCase().trim();
      const row=db.prepare("SELECT * FROM jovia_codes WHERE code=?").get(raw);
      if(!row) return res.json({success:false,exists:false,message:"Not found - INVALID"});
      res.json({success:true,exists:true, ...row, used:!!row.used});
    });

    console.log("✅ JOVIA FINAL Plugin Loaded - STRICT + AUTO UPGRADE");
  }catch(e){
    console.log("JOVIA Plugin Error:", e.message);
  }
};
