"use strict";

module.exports = (app, db, requireUser, requireAdmin) => {
  console.log("🔧 JOVIA SERVER 3 - BALANCE HISTORY + BALANCE ADD/DEDUCT + AFFILIATE");

  const routeExists = (path, method) => {
    try{
      if(!app._router || !app._router.stack) return false;
      return app._router.stack.some(l => {
        if(!l.route) return false;
        return l.route.path === path && Object.keys(l.route.methods)[0] === method;
      });
    }catch{ return false; }
  };
  const safeAdd = (method, path, ...handlers) => {
    if(routeExists(path, method)){
      console.log(`⏭️ Server3 Skipping ${method.toUpperCase()} ${path} - already get am`);
      return;
    }
    app[method](path, ...handlers);
    console.log(`✅ Server3 Added ${method.toUpperCase()} ${path}`);
  };

  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";
  const userColumns = () => db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  const hasColumn = n => userColumns().includes(n);
  try{ if(!hasColumn("affiliate_balance")) db.exec(`ALTER TABLE users ADD COLUMN affiliate_balance INTEGER DEFAULT 0`); }catch{}
  try{ if(!hasColumn("referral_balance")) db.exec(`ALTER TABLE users ADD COLUMN referral_balance INTEGER DEFAULT 0`); }catch{}

  const adminGuard = (req,res,next) => {
    const hp = String(req.headers["x-admin-password"]||req.headers["x-admin-pass"]||"").trim();
    const bp = String(req.body?.adminPass||req.body?.adminPassword||req.body?.password||"").trim();
    const qp = String(req.query?.adminPass||"").trim();
    if(req.session && req.session.isAdmin===true) return next();
    if(hp && hp===ADMIN_PASS){ if(req.session) req.session.isAdmin=true; return next(); }
    if(bp && bp===ADMIN_PASS){ if(req.session) req.session.isAdmin=true; return next(); }
    if(qp && qp===ADMIN_PASS) return next();
    return res.status(401).json({success:false,message:"Admin authentication required"});
  };

  // ===== 1. BEGINNING OF SERVER 3 - BALANCE HISTORY =====
  const balanceHistoryHandler = (req,res) => {
    try{
      const userId = Number(req.query?.userId||req.query?.id||req.query?.user_id||0);
      const email = String(req.query?.email||"").trim().toLowerCase();
      const type = String(req.query?.type||"").trim().toLowerCase();
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit||100)));
      let user = null;
      if(userId) user = db.prepare(`SELECT id FROM users WHERE id=?`).get(userId);
      if(!user && email) user = db.prepare(`SELECT id FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email);
      if(user){
        let rows;
        if(type){
          rows = db.prepare(`SELECT id, user_id, type, amount, description, created_at FROM wallet_transactions WHERE user_id=? AND LOWER(type)=? ORDER BY id DESC LIMIT ?`).all(user.id, type, limit);
        } else {
          rows = db.prepare(`SELECT id, user_id, type, amount, description, created_at FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT ?`).all(user.id, limit);
        }
        const u2 = db.prepare(`SELECT id, email, username, full_name, wallet_balance, affiliate_balance FROM users WHERE id=?`).get(user.id);
        return res.json({success:true, history: rows, transactions: rows, total: rows.length, user: u2});
      }
      let rows;
      if(type){
        rows = db.prepare(`SELECT w.id, w.user_id, w.type, w.amount, w.description, w.created_at, u.email, u.username, u.full_name FROM wallet_transactions w LEFT JOIN users u ON u.id=w.user_id WHERE LOWER(w.type)=? ORDER BY w.id DESC LIMIT ?`).all(type, limit);
      } else {
        rows = db.prepare(`SELECT w.id, w.user_id, w.type, w.amount, w.description, w.created_at, u.email, u.username, u.full_name FROM wallet_transactions w LEFT JOIN users u ON u.id=w.user_id ORDER BY w.id DESC LIMIT ?`).all(limit);
      }
      return res.json({success:true, history: rows, transactions: rows, total: rows.length});
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };

  const balanceHistoryPaths = [
    "/api/admin/balance/history",
    "/api/admin/wallet/history",
    "/api/admin/user/balance/history",
    "/api/admin/users/balance/history",
    "/api/admin/balance-history",
    "/api/admin/wallet/transactions"
  ];
  balanceHistoryPaths.forEach(p=> safeAdd("get", p, adminGuard, balanceHistoryHandler));

  // ===== 1B. NEW - BALANCE USER (FIX: GET /api/admin/balance/user?email=...) =====
  const balanceUserHandler = (req,res) => {
    try{
      const email = String(req.query?.email||"").trim().toLowerCase();
      const username = String(req.query?.username||"").trim();
      const userId = Number(req.query?.userId||req.query?.id||req.query?.user_id||0);
      let user = null;
      if(userId) user = db.prepare(`SELECT * FROM users WHERE id=?`).get(userId);
      if(!user && email) user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(email);
      if(!user && username) user = db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username))=LOWER(TRIM(?)) OR LOWER(TRIM(full_name))=LOWER(TRIM(?)) LIMIT 1`).get(username, username);
      if(!user) return res.status(404).json({success:false, message:"User not found"});
      let gameAcc = null;
      try{ gameAcc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(user.id); }catch{}
      const gameBal = Number(gameAcc?.game_balance||0);
      const walletBal = Number(user.wallet_balance||0);
      const affBal = Number(user.affiliate_balance||0);
      return res.json({
        success:true,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          full_name: user.full_name,
          package: user.package || user.plan,
          plan: user.plan || user.package,
          wallet_balance: walletBal,
          available_balance: walletBal,
          affiliate_balance: affBal,
          referral_balance: Number(user.referral_balance||0),
          game_balance: gameBal,
          account_status: user.account_status,
          status: user.status
        },
        wallet_balance: walletBal,
        available_balance: walletBal,
        affiliate_balance: affBal,
        game_balance: gameBal
      });
    }catch(e){ return res.status(500).json({success:false, message:e.message}); }
  };
  [
    "/api/admin/balance/user",
    "/api/admin/balance/user-by-email",
    "/api/admin/user/balance-detail",
    "/api/admin/balance/detail"
  ].forEach(p=> safeAdd("get", p, adminGuard, balanceUserHandler));

  // ===== 2. BALANCE ADD / DEDUCT (same as frontend) =====
  const findUserForBalance = (body) => {
    const uid = Number(body?.userId||body?.id||body?.user_id||0);
    const em = String(body?.email||"").trim().toLowerCase();
    const un = String(body?.username||body?.user||"").trim();
    let u=null;
    if(uid) u=db.prepare(`SELECT * FROM users WHERE id=?`).get(uid);
    if(!u && em) u=db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1`).get(em);
    if(!u && un) u=db.prepare(`SELECT * FROM users WHERE LOWER(TRIM(username))=LOWER(TRIM(?)) OR LOWER(TRIM(full_name))=LOWER(TRIM(?)) LIMIT 1`).get(un, un);
    return u;
  };
  const resolveCol = (body) => {
    const t = String(body?.balanceType||body?.balance||body?.walletType||body?.target||"wallet").toLowerCase();
    if(t.includes("affiliate")||t.includes("referral")) return "affiliate_balance";
    if(t.includes("game")) return "game_balance";
    return "wallet_balance";
  };
  const adjustHandler = (isAdd) => (req,res) => {
    try{
      const body = req.body||{};
      const amount = Number(body?.amount||body?.value||0);
      if(!amount || amount<=0) return res.status(400).json({success:false,message:"Enter valid amount"});
      const user = findUserForBalance(body);
      if(!user) return res.status(404).json({success:false,message:"User not found"});
      const reason = String(body?.reason||body?.note||body?.description||(isAdd?"Admin add balance":"Admin deduct balance")).slice(0,300);
      const col = resolveCol(body);
      if(col==="game_balance"){
        let acc = db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(user.id);
        if(!acc){ db.prepare(`INSERT INTO jovia_game_accounts (user_id, game_balance, points) VALUES (?,0,0)`).run(user.id); acc=db.prepare(`SELECT * FROM jovia_game_accounts WHERE user_id=?`).get(user.id); }
        const before = Number(acc.game_balance||0);
        const after = isAdd ? before+amount : Math.max(0, before-amount);
        db.prepare(`UPDATE jovia_game_accounts SET game_balance=?, updated_at=datetime('now') WHERE user_id=?`).run(after, user.id);
        return res.json({success:true,message:`✅ Game balance ${isAdd?"added":"deducted"}: ₦${amount.toLocaleString()}`, userId:user.id, beforeBalance:before, newBalance:after, balance:after});
      }
      const before = Number(user[col]||user.wallet_balance||0);
      const after = isAdd ? before+amount : Math.max(0, before-amount);
      db.prepare(`UPDATE users SET ${col} = ? WHERE id=?`).run(after, user.id);
      try{ db.prepare(`INSERT INTO wallet_transactions (user_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, datetime('now'))`).run(user.id, isAdd?"admin_add":"admin_deduct", isAdd?amount:-amount, `${reason} [${col}]`); }catch{}
      const updated = db.prepare(`SELECT id, email, username, wallet_balance, affiliate_balance FROM users WHERE id=?`).get(user.id);
      return res.json({success:true,message:`✅ ${col==="affiliate_balance"?"Affiliate":"Available"} balance ${isAdd?"added":"deducted"}: ₦${amount.toLocaleString()}`, user:updated, userId:user.id, beforeBalance:before, newBalance:after, balance:after, wallet_balance:updated?.wallet_balance, affiliate_balance:updated?.affiliate_balance});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  };
  const adjustGeneric = (req,res) => {
    const t = String(req.body?.type||req.body?.action||"add").toLowerCase();
    return adjustHandler(!(t.includes("deduct")||t.includes("subtract")||t.includes("remove")||t==="minus"))(req,res);
  };
  ["/api/admin/balance/add","/api/admin/user/add-balance","/api/admin/users/add-balance","/api/admin/wallet/add","/api/admin/add-balance"].forEach(p=> safeAdd("post",p, adminGuard, adjustHandler(true)));
  ["/api/admin/balance/deduct","/api/admin/user/deduct-balance","/api/admin/users/deduct-balance","/api/admin/wallet/deduct","/api/admin/deduct-balance"].forEach(p=> safeAdd("post",p, adminGuard, adjustHandler(false)));
  ["/api/admin/balance/adjust","/api/admin/user/balance","/api/admin/users/balance","/api/admin/balance","/api/admin/wallet/adjust"].forEach(p=> safeAdd("post",p, adminGuard, adjustGeneric));

  // ===== 3. UPGRADE LIST FOR ADMIN =====
  safeAdd("get","/api/admin/upgrades", adminGuard, (req,res)=>{
    try{
      const rows = db.prepare(`SELECT u.*, us.email, us.username, us.full_name FROM jovia_upgrades u LEFT JOIN users us ON us.id=u.user_id ORDER BY u.id DESC LIMIT 200`).all();
      return res.json({success:true, upgrades: rows, total: rows.length});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });
  safeAdd("get","/api/admin/upgrades/list", adminGuard, (req,res)=>{
    try{
      const rows = db.prepare(`SELECT u.*, us.email, us.username, us.full_name FROM jovia_upgrades u LEFT JOIN users us ON us.id=u.user_id ORDER BY u.id DESC LIMIT 200`).all();
      return res.json({success:true, upgrades: rows, total: rows.length});
    }catch(e){ return res.status(500).json({success:false,message:e.message}); }
  });

  console.log("✅ SERVER 3 READY - Balance History + Balance User at top");
};
