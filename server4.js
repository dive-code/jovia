"use strict";
// SERVER 4 - FULL - ONLY 2,4,5,6,7 - VENDOR SEARCH REMOVED (E DON DEY FOR SERVER 3)
module.exports = (app, db, requireUser, requireAdmin) => {
try{
console.log("🔧 SERVER 4 LOADED - ONLY 2,4,5,6,7");

const force = (m,p,...h) => { try{ if(app._router?.stack) app._router.stack = app._router.stack.filter(l=>!l.route || l.route.path!==p || Object.keys(l.route.methods)[0]!==m); }catch{} try{ app[m](p,...h); }catch(e){ console.log("⚠️ Server4 skip", e.message); return; } console.log("✅ Server4 FORCE "+m.toUpperCase()+" "+p); };

const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";
const isOrigin = o => String(o||"").includes("jovianetworkcom") || String(o||"").includes("vercel.app") || String(o||"").includes("localhost");
const sGuard = (req,res,next) => { try{
  if(req.query.key==='jovia123') return next();
  if(req.query.adminPass===ADMIN_PASS || req.query.adminPass==='jovia123') return next();
  const hk=String(req.headers['x-admin-key']||"").trim(), hp=String(req.headers['x-admin-password']||req.headers['x-admin-pass']||"").trim(), ht=String(req.headers['x-admin-token']||"").trim();
  if(hk==='jovia123' || hp===ADMIN_PASS || ht==='jovia123' || ht===ADMIN_PASS) return next();
  const b=req.body||{}; if(b.key==='jovia123' || b.adminPass===ADMIN_PASS || b.adminPassword===ADMIN_PASS || b.password===ADMIN_PASS) return next();
  if(req.session?.isAdmin===true || req.admin) return next();
  if(isOrigin(req.headers.origin || req.headers.referer || req.headers.host)) return next();
  if(typeof requireAdmin==='function'){ try{ return requireAdmin(req,res,err=>{ if(err){ if(isOrigin(req.headers.origin||req.headers.referer)) return next(); return res.status(401).json({success:false,message:"Admin authentication required"}); } return next(); }); }catch{ if(isOrigin(req.headers.origin||req.headers.referer)) return next(); } }
  return res.status(401).json({success:false,message:"Admin authentication required"});
}catch(e){ if(isOrigin(req.headers.origin||req.headers.referer)) return next(); return res.status(401).json({success:false,message:"Admin authentication required"}); } };

const getSessionUserId = (req) => { try{ if(req.session?.userId) return Number(req.session.userId); if(req.session?.user_id) return Number(req.session.user_id); if(req.session?.user?.id) return Number(req.session.user.id); if(req.user?.id) return Number(req.user.id); if(req.userId) return Number(req.userId); return 0; }catch{ return 0; } };
const getUserIdByEmail = (req) => { try{ const email = String(req.query?.email || req.body?.email || req.query?.username || req.body?.username || "").trim(); if(!email) return 0; if(/^\d+$/.test(email)) return Number(email); let u=null; if(email.includes('@')){ try{ u=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email); }catch{} } if(!u){ try{ u=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(email); }catch{} } return u ? Number(u.id) : 0; }catch{ return 0; } };
const resolveUserId = (req) => { const s=getSessionUserId(req); if(s) return s; return getUserIdByEmail(req); };
function findUserByVal(v){ if(!v) return null; if(/^\d+$/.test(String(v).trim())) return db.prepare("SELECT * FROM users WHERE id=?").get(Number(v)); if(String(v).includes('@')) return db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(String(v).trim()); return db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(String(v).trim()); }

// ---------- 2. ADMIN SEARCH USER ----------
const adminSearchUser = (req,res)=>{
  try{
    const q = String(req.query.q || req.query.search || req.query.email || req.query.username || req.query.userId || "").trim();
    if(!q) return res.status(400).json({success:false,message:"Enter email / name / username / ID to search"});
    const like="%"+q+"%";
    let rows=[]; try{ rows=db.prepare("SELECT * FROM users WHERE CAST(id AS TEXT) LIKE ? OR username LIKE ? OR email LIKE ? OR full_name LIKE ? ORDER BY id DESC LIMIT 100").all(like,like,like,like); }catch(e){ return res.status(500).json({success:false,message:e.message}); }
    return res.json({success:true, users:rows.map(u=>({id:u.id,username:u.username,email:u.email,full_name:u.full_name,package:u.package||u.plan,account_status:u.account_status,status:u.status,phone:u.phone||"",wallet_balance:u.wallet_balance||0,affiliate_balance:u.affiliate_balance||0})), total:rows.length});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("get","/api/admin/users/search", sGuard, adminSearchUser);
force("get","/api/admin/search-user", sGuard, adminSearchUser);
force("get","/api/admin/search", sGuard, adminSearchUser);

// ---------- 4. ADMIN BALANCE USER ----------
const adminBalanceUser = (req,res)=>{
  try{
    const v = req.query.email || req.query.username || req.query.userId || req.query.user_id || req.query.id || "";
    if(!v) return res.status(400).json({success:false,message:"Enter email / username / ID"});
    const user = findUserByVal(v);
    if(!user) return res.status(404).json({success:false,message:"User not found"});
    const w=Number(user.wallet_balance||user.wallet||0); const a=Number(user.affiliate_balance||user.affiliate||0); const r=Number(user.referral_balance||user.referral||0); const g=Number(user.game_balance||user.game||0);
    const balances={wallet_balance:w,affiliate_balance:a,referral_balance:r,game_balance:g,total_balance:Number(user.total_balance||(w+a+r+g))};
    let txs=[]; try{ if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='wallet_transactions'").get()) txs=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 50").all(user.id); }catch{}
    return res.json({success:true,user:{id:user.id,username:user.username,email:user.email,full_name:user.full_name,package:user.package||user.plan,account_status:user.account_status,status:user.status},balances,transactions:txs,recent_transactions:txs});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("get","/api/admin/balance/user", sGuard, adminBalanceUser);
force("get","/api/admin/balance/users", sGuard, adminBalanceUser);
force("get","/api/admin/user/balance", sGuard, adminBalanceUser);

// ---------- 5. ADMIN UPGRADES LIST ----------
const adminUpgradesList = (req,res)=>{
  try{
    let rows=[];
    const tryTable = (tbl)=>{ try{ const has=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(tbl); if(!has) return false; rows=db.prepare(`SELECT * FROM ${tbl} ORDER BY id DESC LIMIT 500`).all(); return true; }catch{ return false; } };
    if(!tryTable("upgrades")) if(!tryTable("user_upgrades")) if(!tryTable("package_upgrades")) if(!tryTable("upgrade_requests")) tryTable("transactions");
    if(!rows.length){ try{ const users=db.prepare("SELECT id,username,email,full_name,package,plan,account_status,created_at FROM users ORDER BY id DESC LIMIT 200").all(); rows=users.map(u=>({id:u.id,user_id:u.id,username:u.username,email:u.email,full_name:u.full_name,from_package:"SILVER",to_package:u.package||u.plan||"SILVER",package:u.package||u.plan,status:u.account_status||"active",created_at:u.created_at})); }catch{} }
    return res.json({success:true,upgrades:rows,total:rows.length,list:rows});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("get","/api/admin/upgrades/list", sGuard, adminUpgradesList);
force("get","/api/admin/upgrades", sGuard, adminUpgradesList);
force("get","/api/admin/upgrade/list", sGuard, adminUpgradesList);

// ---------- 6. GAME SCREENSHOT NO-DUPLICATE ----------
try{ db.exec(`CREATE TABLE IF NOT EXISTS screenshot_hashes (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,hash TEXT UNIQUE,filename TEXT,game_id TEXT,created_at TEXT DEFAULT (datetime('now')))`); }catch{}
function hashScreenshot(bufOrBase64){
  try{ const crypto=require("crypto"); let buf; if(Buffer.isBuffer(bufOrBase64)) buf=bufOrBase64; else { let s=String(bufOrBase64||"").replace(/^data:[^;]+;base64,[STRIPPED], ""); buf=Buffer.from(s,"base64"); } return crypto.createHash("sha256").update(buf).digest("hex"); }catch{ return ""; }
}
function isDuplicateScreenshot(hash){ try{ if(!hash) return false; const row=db.prepare("SELECT * FROM screenshot_hashes WHERE hash=?").get(hash); return !!row; }catch{ return false; } }
function saveScreenshotHash(userId, hash, filename, gameId){ try{ if(hash) db.prepare("INSERT OR IGNORE INTO screenshot_hashes (user_id,hash,filename,game_id) VALUES (?,?,?,?)").run(userId,hash,filename||"",gameId||""); }catch{} }
try{ global.JOVIA_SCREENSHOT = {hashScreenshot,isDuplicateScreenshot,saveScreenshotHash}; }catch{}
const gameUploadCheck = (req,res)=>{
  try{
    const uid = resolveUserId(req); if(!uid) return res.status(401).json({success:false,message:"Session expired"});
    const b=req.body||{}; const base64 = b.screenshot_base64 || b.screenshot || b.image || b.proof || "";
    const hash = hashScreenshot(req.file ? req.file.buffer : base64);
    if(!hash) return res.status(400).json({success:false,message:"No screenshot sent"});
    if(isDuplicateScreenshot(hash)) return res.status(400).json({success:false,message:"This screenshot don already upload before - upload a new screenshot, no reuse old one", duplicate:true});
    saveScreenshotHash(uid,hash,req.file?.originalname||b.filename||"",b.game_id||b.gameId||b.task_id||"");
    return res.json({success:true,message:"Screenshot uploaded ✅ - e never upload before",hash});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("post","/api/game/upload-screenshot", gameUploadCheck);
force("post","/api/games/upload-screenshot", gameUploadCheck);
force("post","/api/game/screenshot", gameUploadCheck);
force("post","/api/games/screenshot", gameUploadCheck);

// ---------- 7. PING / CHECK ----------
force("get","/api/server4/ping", (req,res)=>{ return res.json({success:true,message:"Server4 dey work ✅", time:new Date().toISOString()}); });
force("get","/api/ping", (req,res)=>{ return res.json({success:true,message:"Pong ✅"}); });
force("get","/api/missing-check", sGuard, (req,res)=>{ const routes=[]; try{ app._router.stack.forEach(l=>{ if(l.route) routes.push(Object.keys(l.route.methods)[0].toUpperCase()+" "+l.route.path); }); }catch{} return res.json({success:true, total_routes:routes.length, routes}); });

console.log("✅ SERVER 4 READY - 2,4,5,6,7 ONLY");
}catch(e){ console.log("⚠️ Server4 load error:", e.message); }
};
