"use strict";
module.exports = (app, db, requireUser, requireAdmin) => {
try{
console.log("🔧 LOANS v4 - FULL FIXED - FORGOT PASSWORD + VENDOR FIX + NO DOUBLE DEDUCT");
if(!app || typeof app.get !== "function" || typeof app.post !== "function"){ console.log("⚠️ Loans skip"); return; }

// ---------- Helpers ----------
const exists = (p,m) => { try{ if(!app._router?.stack) return false; return app._router.stack.some(l=>l.route && l.route.path===p && Object.keys(l.route.methods)[0]===m); }catch{ return false; } };
let allow=false; const withAllow = fn => { allow=true; try{ fn() }finally{ allow=false } };
const safe = (m,p,...h) => { try{ if(exists(p,m)){ console.log("⏭️ Skip "+m.toUpperCase()+" "+p); return } withAllow(()=>app[m](p,...h)); console.log("✅ Loans Added "+m.toUpperCase()+" "+p); }catch(e){ console.log("⚠️ Loans safeAdd skip", e.message) } };
const force = (m,p,...h) => { try{ if(app._router?.stack) app._router.stack = app._router.stack.filter(l=>!l.route || l.route.path!==p || Object.keys(l.route.methods)[0]!==m); }catch{} try{ withAllow(()=>app[m](p,...h)); }catch(e){ console.log("⚠️ Loans forceAdd skip", e.message); return; } console.log("✅ Loans FORCE "+m.toUpperCase()+" "+p); };

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

const userGuard = (req,res,next) => {
  try{
    if(typeof requireUser==='function') return requireUser(req,res,next);
    const id = Number(req.session?.userId || req.session?.user_id || req.session?.user?.id || 0);
    if(id){ req.userId = id; return next(); }
    if(req.headers["x-impersonate-token"] || req.query?.impersonate) return next();
    return res.status(401).json({success:false,message:"Session expired - login again"});
  }catch(e){ return res.status(401).json({success:false,message:"Session expired"}); }
};

const getSessionUserId = (req) => {
  try{
    if(req.session?.userId) return Number(req.session.userId);
    if(req.session?.user_id) return Number(req.session.user_id);
    if(req.session?.user?.id) return Number(req.session.user.id);
    if(req.user?.id) return Number(req.user.id);
    if(req.userId) return Number(req.userId);
    const tok = String(req.headers["x-impersonate-token"]||req.query?.impersonate||"").trim();
    if(tok){ try{ const row = db.prepare("SELECT * FROM admin_impersonations WHERE token=?").get(tok); if(row) return Number(row.target_user_id); }catch{} }
    return 0;
  }catch{ return 0; }
};

// ✅ FIX 1: Email fallback - Vendor go work even if session ID no match
const getUserIdByEmail = (req) => {
  try{
    const email = String(req.query?.email || req.body?.email || req.query?.username || req.body?.username || "").trim();
    if(!email) return 0;
    if(/^\d+$/.test(email)) return Number(email);
    let u = null;
    if(email.includes('@')){ try{ u = db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email); }catch{} }
    if(!u){ try{ u = db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(email); }catch{} }
    return u ? Number(u.id) : 0;
  }catch{ return 0; }
};
const resolveUserId = (req) => {
  const sid = getSessionUserId(req);
  if(sid) return sid;
  return getUserIdByEmail(req);
};

// ---------- Tables ----------
try{ db.exec(`CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_code TEXT UNIQUE,
  user_id INTEGER NOT NULL,
  username TEXT,
  email TEXT,
  full_name TEXT,
  amount INTEGER NOT NULL,
  fee INTEGER NOT NULL,
  purpose TEXT,
  term_months INTEGER DEFAULT 2,
  receipt_name TEXT,
  receipt_data TEXT,
  receipt_type TEXT,
  status TEXT DEFAULT 'PENDING',
  fee_status TEXT DEFAULT 'PENDING',
  approved_at TEXT,
  disbursed_at TEXT,
  estimated_from TEXT,
  estimated_to TEXT,
  processing_time TEXT DEFAULT '6 - 12 Weeks',
  processing_message TEXT,
  reviewed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
)`); console.log("✅ Loans table ready"); }catch(e){ console.log("⚠️ Loans table", e.message); }

try{ const cols = db.prepare("PRAGMA table_info(loans)").all().map(c=>c.name);
  if(!cols.includes("receipt_data")) db.exec("ALTER TABLE loans ADD COLUMN receipt_data TEXT");
  if(!cols.includes("estimated_from")) db.exec("ALTER TABLE loans ADD COLUMN estimated_from TEXT");
  if(!cols.includes("estimated_to")) db.exec("ALTER TABLE loans ADD COLUMN estimated_to TEXT");
  if(!cols.includes("disbursed_at")) db.exec("ALTER TABLE loans ADD COLUMN disbursed_at TEXT");
  if(!cols.includes("approved_at")) db.exec("ALTER TABLE loans ADD COLUMN approved_at TEXT");
  if(!cols.includes("fee_status")) db.exec("ALTER TABLE loans ADD COLUMN fee_status TEXT DEFAULT 'PENDING'");
}catch{}

try{ db.exec(`CREATE TABLE IF NOT EXISTS admin_impersonations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE,
  target_user_id INTEGER,
  target_email TEXT,
  admin_ip TEXT,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT
)`); }catch{}

try{ db.exec(`CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  code TEXT UNIQUE,
  vendor_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'PENDING',
  balance INTEGER DEFAULT 0,
  total_activated INTEGER DEFAULT 0,
  total_deducted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`); }catch{}
try{ const vc = db.prepare("PRAGMA table_info(vendors)").all().map(c=>c.name);
  if(!vc.includes("balance")) db.exec("ALTER TABLE vendors ADD COLUMN balance INTEGER DEFAULT 0");
  if(!vc.includes("total_deducted")) db.exec("ALTER TABLE vendors ADD COLUMN total_deducted INTEGER DEFAULT 0");
}catch{}
try{ db.exec("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT,message TEXT,type TEXT DEFAULT 'system',is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT (datetime('now')))"); }catch{}

// ✅ NEW: Password resets table for Forgot Password
try{ db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  email TEXT,
  token TEXT UNIQUE,
  code TEXT,
  expires_at TEXT,
  used INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
)`); }catch{}

// ---------- Helpers ----------
const isSuperPkg = (u) => String(u?.package||u?.plan||"").toUpperCase().includes("SUPER");
const normPkg = (u) => { const p=String(u?.package||u?.plan||"").toUpperCase(); if(p.includes("SUPER")) return "SUPER"; if(p.includes("GOLD")) return "GOLD"; return "SILVER"; };
const normStatus = (s) => String(s||"").trim().toUpperCase();
const PKG_COST = { SILVER:9000, GOLD:15000, SUPER:21000 };
const money = n => "₦"+Number(n||0).toLocaleString("en-NG");
const cleanLoan = (l) => {
  if(!l) return null;
  const { receipt_data, ...rest } = l;
  return { ...rest, has_receipt: !!l.receipt_data || !!l.receipt_name };
};
function tableExists(name){ try{ return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name); }catch{ return false; } }
function colsOf(table){ try{ return db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name); }catch{ return []; } }
function findUserByVal(v){
  if(!v) return null;
  if(/^\d+$/.test(String(v).trim())) return db.prepare("SELECT * FROM users WHERE id=?").get(Number(v));
  if(String(v).includes('@')) return db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(String(v).trim());
  return db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(String(v).trim());
}
function safeBalances(u){
  if(!u) return {wallet_balance:0,affiliate_balance:0,referral_balance:0,game_balance:0,total_balance:0};
  const w=Number(u.wallet_balance||u.wallet||0), a=Number(u.affiliate_balance||u.affiliate||0), r=Number(u.referral_balance||u.referral||0), g=Number(u.game_balance||u.game||0);
  return {wallet_balance:w,affiliate_balance:a,referral_balance:r,game_balance:g,total_balance:Number(u.total_balance||(w+a+r+g))};
}
const notify = (uid,title,msg)=>{ try{ db.prepare("INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)").run(uid,title,msg); }catch{} };
// Password hashing - support bcrypt if available, else sha256 fallback
let bcrypt=null; try{ bcrypt=require("bcryptjs"); }catch{ try{ bcrypt=require("bcrypt"); }catch{} }
function hashPass(pw){
  try{ if(bcrypt) return bcrypt.hashSync(String(pw),10); }catch{}
  try{ return "sha256:"+require("crypto").createHash("sha256").update(String(pw)).digest("hex"); }catch{ return String(pw); }
}
function setUserPassword(userId, newPass){
  const h = hashPass(newPass);
  const cols = colsOf("users");
  try{ if(cols.includes("password")) db.prepare("UPDATE users SET password=? WHERE id=?").run(h,userId); }catch{}
  try{ if(cols.includes("password_hash")) db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(h,userId); }catch{}
  try{ if(cols.includes("password_reset_at")) db.prepare("UPDATE users SET password_reset_at=datetime('now') WHERE id=?").run(userId); }catch{}
}

let upload = null;
try{
  const multer = require("multer");
  upload = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 5*1024*1024 } });
}catch{ console.log("⚠️ multer not found - will use base64 receipt field"); }

// ---------- 0. FIX MISSING ADMIN ENDPOINTS ----------
safe("get","/api/admin/impersonations", sGuard, (req,res)=>{
  try{
    if(!tableExists("admin_impersonations")) return res.json({success:true, impersonations:[]});
    const rows = db.prepare("SELECT * FROM admin_impersonations ORDER BY id DESC LIMIT 100").all();
    const list = rows.map(x=>({ id:x.id, target_user_id:x.target_user_id||x.user_id, target_email:x.target_email||x.email||"", reason:x.reason||"", admin_ip:x.admin_ip||x.ip||"", created_at:x.created_at||"", expires_at:x.expires_at||"" }));
    return res.json({success:true, impersonations:list});
  }catch(e){ return res.json({success:true, impersonations:[]}); }
});

const impVerify = (req,res)=>{
  try{
    const tok = String(req.query?.token || req.body?.token || req.headers["x-impersonate-token"] || "").trim();
    if(!tok) return res.status(400).json({success:false,message:"Token required"});
    const row = db.prepare("SELECT * FROM admin_impersonations WHERE token=?").get(tok);
    if(!row) return res.status(404).json({success:false,message:"Invalid impersonate token"});
    if(row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return res.status(401).json({success:false,message:"Impersonate token don expire"});
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(row.target_user_id);
    if(!user) return res.status(404).json({success:false,message:"User not found"});
    let tx=[]; try{ tx=db.prepare("SELECT id,type,amount,description,created_at FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 100").all(user.id); }catch{}
    return res.json({success:true, user:{id:user.id,username:user.username,email:user.email,full_name:user.full_name,package:user.package||user.plan,account_status:user.account_status,status:user.status,balances:safeBalances(user)}, balances:safeBalances(user), recent_transactions:tx, transactions:tx, history:tx, impersonated:true, expires_at:row.expires_at, reason:row.reason});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
safe("get","/api/impersonate/verify", impVerify);
safe("post","/api/impersonate/verify", impVerify);

safe("post","/api/admin/impersonate", sGuard, (req,res)=>{
  try{
    const user = findUserByVal(req.body?.userId || req.body?.id || req.body?.email || req.body?.username || req.query?.userId || req.query?.email);
    if(!user) return res.status(404).json({success:false,message:"User not found"});
    let tok=""; try{ tok=require("crypto").randomBytes(24).toString("hex"); }catch{ tok=Math.random().toString(36).slice(2)+Date.now().toString(36); }
    const exp = new Date(Date.now()+15*60*1000).toISOString();
    db.prepare("INSERT INTO admin_impersonations (token,target_user_id,target_email,admin_ip,reason,expires_at) VALUES (?,?,?,?,?,?)").run(tok,user.id,user.email,String(req.ip||""),String(req.body?.reason||"fraud check").slice(0,200),exp);
    return res.json({success:true, impersonate_token:tok, token:tok, expires_at:exp, user:{id:user.id,email:user.email,username:user.username}, impersonate_url:`/dashboard.html?impersonate=${tok}`});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});

safe("get","/api/admin/balance/history", sGuard, (req,res)=>{
  try{
    if(!tableExists("balance_history") && !tableExists("balance_adjustments")) return res.json({success:true, history:[]});
    const tbl = tableExists("balance_history") ? "balance_history" : "balance_adjustments";
    const rows = db.prepare(`SELECT * FROM ${tbl} ORDER BY id DESC LIMIT 100`).all();
    const history = rows.map(h=>({ id:h.id, user_id:h.user_id, email:h.email||h.user_email||"", wallet_type:h.wallet_type||h.walletType||h.type||"wallet_balance", action:h.action||(Number(h.amount)>=0?"add":"deduct"), amount:Math.abs(Number(h.amount||0)), reason:h.reason||h.note||"", before_balance:h.before_balance??h.before??0, after_balance:h.after_balance??h.after??0, created_at:h.created_at||h.createdAt||"" }));
    return res.json({success:true, history});
  }catch(e){ return res.json({success:true, history:[]}); }
});

safe("get","/api/admin/upline", sGuard, (req,res)=>{
  try{
    const v = req.query.email || req.query.username || req.query.userId || req.query.user_id || "";
    const user = findUserByVal(v);
    if(!user) return res.status(404).json({success:false, message:"User not found"});
    const upline=[]; let cur=user; let level=1;
    while(cur && level<=10){
      const upId = cur.referred_by || cur.upline_id || cur.referrer_id || cur.upline || cur.parent_id;
      if(!upId) break;
      const up = db.prepare("SELECT * FROM users WHERE id=?").get(Number(upId));
      if(!up) break;
      upline.push({level, id:up.id, username:up.username, email:up.email, full_name:up.full_name||"", package:up.package||up.plan||"", balances:safeBalances(up)});
      cur=up; level++;
    }
    let direct=[];
    try{
      const cols = colsOf("users");
      const col = cols.includes("referred_by") ? "referred_by" : cols.includes("upline_id") ? "upline_id" : cols.includes("referrer_id") ? "referrer_id" : null;
      if(col) direct = db.prepare(`SELECT * FROM users WHERE ${col}=? ORDER BY id DESC LIMIT 100`).all(user.id);
    }catch{}
    let txs=[];
    try{ if(tableExists("transactions")) txs=db.prepare("SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 5").all(user.id); }catch{}
    try{ if(!txs.length && tableExists("wallet_transactions")) txs=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 5").all(user.id); }catch{}
    return res.json({success:true, user, balances:safeBalances(user), upline, upline_count:upline.length, upline_summary: upline.length?`Chain: ${upline.map(u=>u.username).join(" -> ")}`:"No upline", direct_affiliates: direct.map(d=>({id:d.id, username:d.username, email:d.email, balances:safeBalances(d)})), direct_affiliates_count:direct.length, total_downlines_approx:direct.length, fraud_signals:[], fraud_risk:"LOW", password:{has_password:!!user.password, password_type:"hashed", password_hash_preview:"****", password_reset_at:user.password_reset_at||"-", is_default_password_suspected:false}, recent_transactions:txs});
  }catch(e){ return res.status(500).json({success:false, message:e.message}); }
});

safe("get","/api/admin/users/full-profile", sGuard, (req,res)=>{
  try{
    const v = req.query.email || req.query.username || req.query.userId || "";
    const user = findUserByVal(v);
    if(!user) return res.status(404).json({success:false, message:"User not found"});
    return res.json({success:true, user, balances:safeBalances(user), upline:[], upline_count:0, direct_affiliates:[], direct_affiliates_count:0, fraud_signals:[], fraud_risk:"LOW", password:{has_password:true, password_type:"hashed", password_hash_preview:"****"}, recent_transactions:[]});
  }catch(e){ return res.status(500).json({success:false, message:e.message}); }
});

safe("get","/api/me", (req,res)=>{
  try{
    const uid = resolveUserId(req);
    if(!uid) return res.status(401).json({success:false,message:"Session expired"});
    const u = db.prepare("SELECT * FROM users WHERE id=?").get(uid);
    if(!u) return res.status(404).json({success:false,message:"User not found"});
    const {password, password_hash, ...rest} = u;
    return res.json({success:true, user:{...rest, balances:safeBalances(u)}, balances:safeBalances(u)});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});
safe("get","/api/wallet", (req,res)=>{
  try{
    const uid = getSessionUserId(req);
    if(!uid) return res.status(401).json({success:false,message:"Session expired"});
    const u = db.prepare("SELECT * FROM users WHERE id=?").get(uid);
    if(!u) return res.status(404).json({success:false,message:"User not found"});
    const b = safeBalances(u);
    return res.json({success:true, ...b, walletBalance:b.wallet_balance, affiliateBalance:b.affiliate_balance, totalEarned:b.total_balance, balances:b, wallet:{transactions:[]}});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});

// ---------- 0e. FORGOT / RESET PASSWORD - SHOW CODE ON SAME PAGE, NO EMAIL ----------
const forgotHandler = (req,res)=>{
  try{
    const email = String(req.body?.email || req.body?.username || req.query?.email || "").trim();
    if(!email) return res.status(400).json({success:false,message:"Enter your email"});
    const user = findUserByVal(email);
    if(!user) return res.status(404).json({success:false,message:"Email not found - check email or register first", code:"", reset_code:""});
    let code = String(Math.floor(100000 + Math.random()*900000));
    let token = ""; try{ token=require("crypto").randomBytes(24).toString("hex"); }catch{ token=Date.now().toString(36)+Math.random().toString(36).slice(2); }
    const exp = new Date(Date.now()+30*60*1000).toISOString();
    try{ db.prepare("UPDATE password_resets SET used=1 WHERE user_id=? AND used=0").run(user.id); }catch{}
    db.prepare("INSERT INTO password_resets (user_id,email,token,code,expires_at,used) VALUES (?,?,?,?,?,0)").run(user.id, user.email, token, code, exp);
    try{ notify(user.id,"Password Reset Code 🔑",`Your JOVIA reset code na: ${code}. E go expire in 30 minutes.`); }catch{}
    console.log(`🔑 Reset code for ${user.email} = ${code} token=${token}`);
    return res.json({success:true,message:`Your reset code na: ${code} - Type am for same page, no need email. Code expires in 30 minutes.`, code, reset_code:code, token, reset_token:token, email:user.email, show_code:true});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("post","/api/auth/forgot-password", forgotHandler);
force("post","/api/forgot-password", forgotHandler);
force("post","/api/auth/forgot", forgotHandler);
force("post","/api/auth/request-reset", forgotHandler);

const resetHandler = (req,res)=>{
  try{
    const b = req.body||{};
    const token = String(b.token || b.reset_token || b.resetToken || "").trim();
    const code = String(b.code || b.reset_code || b.resetCode || b.otp || "").trim();
    const newPass = String(b.newPassword || b.new_password || b.password || "").trim();
    const email = String(b.email || b.username || "").trim();
    if(!newPass || newPass.length < 6) return res.status(400).json({success:false,message:"New password must be at least 6 characters"});
    if(!token && !code) return res.status(400).json({success:false,message:"Enter reset code"});
    let row=null;
    if(token) row = db.prepare("SELECT * FROM password_resets WHERE token=? AND used=0 ORDER BY id DESC LIMIT 1").get(token);
    if(!row && code){
      if(email){ const u=findUserByVal(email); if(u) row=db.prepare("SELECT * FROM password_resets WHERE user_id=? AND code=? AND used=0 ORDER BY id DESC LIMIT 1").get(u.id, code); }
      if(!row) row=db.prepare("SELECT * FROM password_resets WHERE code=? AND used=0 ORDER BY id DESC LIMIT 1").get(code);
    }
    if(!row) return res.status(400).json({success:false,message:"Invalid or expired code. Request new code."});
    if(row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({success:false,message:"Code don expire. Request new code."});
    setUserPassword(row.user_id, newPass);
    db.prepare("UPDATE password_resets SET used=1 WHERE id=?").run(row.id);
    try{ notify(row.user_id,"Password Changed ✅","Your password don change successfully. If no be you, contact Admin now."); }catch{}
    try{ if(req.session) req.session.destroy(()=>{}); }catch{}
    return res.json({success:true,message:"Password changed ✅ Login with your new password."});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("post","/api/auth/reset-password", resetHandler);
force("post","/api/reset-password", resetHandler);
force("post","/api/auth/reset", resetHandler);

// Admin easy reset - Admin fit reset any user password without code
force("post","/api/admin/reset-password", sGuard, (req,res)=>{
  try{
    const b=req.body||{};
    const user = findUserByVal(b.email || b.username || b.userId || b.user_id || b.id || b.user || "");
    const newPass = String(b.newPassword || b.new_password || b.password || "").trim();
    if(!user) return res.status(404).json({success:false,message:"User not found"});
    if(!newPass || newPass.length < 6) return res.status(400).json({success:false,message:"New password must be at least 6 characters"});
    setUserPassword(user.id, newPass);
    try{ notify(user.id,"Password Reset by Admin 🔑",`Admin don reset your password. New password don set. Login with new password and change am.`); }catch{}
    return res.json({success:true,message:`Password for ${user.username} don reset ✅`});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});
force("post","/api/admin/users/reset-password", sGuard, (req,res)=>{
  try{
    const b=req.body||{};
    const user = findUserByVal(b.email || b.username || b.userId || b.user_id || b.id || "");
    const newPass = String(b.newPassword || b.new_password || b.password || "").trim();
    if(!user) return res.status(404).json({success:false,message:"User not found"});
    if(!newPass || newPass.length < 6) return res.status(400).json({success:false,message:"New password must be at least 6 characters"});
    setUserPassword(user.id, newPass);
    return res.json({success:true,message:`Password for ${user.username} don reset ✅`});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});

// ---------- 1. USER APPLY ----------
const applyHandler = (req,res) => {
  try{
    const userId = getSessionUserId(req);
    if(!userId) return res.status(401).json({success:false,message:"Session expired - login again"});
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
    if(!user) return res.status(404).json({success:false,message:"User not found"});
    if(!isSuperPkg(user)) return res.status(403).json({success:false,message:"Loans are available to SUPER members only"});
    const st = String(user.account_status||user.status||"").toLowerCase();
    if(["suspended","banned","blocked"].includes(st)) return res.status(403).json({success:false,message:"Account suspended"});
    const body = req.body || {};
    const amount = Number(body.amount);
    const fee = Number(body.fee);
    const purpose = String(body.purpose||"").trim();
    const term = Number(body.term_months || body.term || 2);
    if(!Number.isInteger(amount) || amount < 1000 || amount > 10000000) return res.status(400).json({success:false,message:"Enter a loan amount between ₦1,000 and ₦10,000,000"});
    const expectedFee = Math.round(amount * 0.12);
    if(fee !== expectedFee) return res.status(400).json({success:false,message:`Invalid fee. Expected ${money(expectedFee)} (12%)`});
    if(purpose.length < 10 || purpose.length > 1000) return res.status(400).json({success:false,message:"Please explain what the loan will be used for"});
    if(!Number.isInteger(term) || term < 1 || term > 12) return res.status(400).json({success:false,message:"Term must be 1-12 months"});
    let receiptName = "", receiptData = "", receiptType = "";
    if(req.file){
      receiptName = req.file.originalname;
      receiptType = req.file.mimetype;
      receiptData = req.file.buffer.toString("base64");
    } else if(body.receipt_base64){
      receiptName = String(body.receipt_name||"receipt");
      receiptType = String(body.receipt_type||"");
      receiptData = String(body.receipt_base64).slice(0, 7*1024*1024);
    } else if(body.receipt){
      receiptName = String(body.receipt||"receipt");
    }
    if(!receiptName && !receiptData) return res.status(400).json({success:false,message:"Please choose your payment receipt"});
    try{
      const pending = db.prepare("SELECT * FROM loans WHERE user_id=? AND status='PENDING' LIMIT 1").get(userId);
      if(pending) return res.json({success:true, alreadyExists:true, already_exists:true, message:"You already have a pending loan "+pending.loan_code+" - upload receipt for that loan, no need to apply again", loan:cleanLoan(pending)});
    }catch{}
    const loanCode = "LOAN-" + Date.now();
    const info = db.prepare(`INSERT INTO loans (loan_code,user_id,username,email,full_name,amount,fee,purpose,term_months,receipt_name,receipt_data,receipt_type,status,fee_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(loanCode, userId, user.username, user.email, user.full_name, amount, fee, purpose, term, receiptName, receiptData, receiptType, "PENDING", "PENDING");
    const loan = db.prepare("SELECT * FROM loans WHERE id=?").get(info.lastInsertRowid);
    console.log(`✅ Loan applied ${loanCode} ${user.username} ${money(amount)} fee ${money(fee)}`);
    return res.json({success:true,message:"Application received. Pending Admin approval.", loan: cleanLoan(loan)});
  }catch(e){
    if(String(e.message||"").includes("UNIQUE") || String(e.message||"").toLowerCase().includes("already exists")){
      try{ const ex=db.prepare("SELECT * FROM loans WHERE user_id=? ORDER BY id DESC LIMIT 1").get(getSessionUserId(req)); if(ex) return res.json({success:true,alreadyExists:true,message:"Loan already exists - use this one", loan:cleanLoan(ex)}); }catch{}
    }
    console.error("Loan apply", e); return res.status(500).json({success:false,message:e.message});
  }
};
if(upload){
  safe("post","/api/loans/apply", userGuard, upload.single("receipt"), applyHandler);
} else {
  safe("post","/api/loans/apply", userGuard, applyHandler);
}

// ---------- 1b. UPLOAD RECEIPT ONLY ----------
const receiptUploadHandler = (req,res)=>{
  try{
    const uid = getSessionUserId(req);
    if(!uid && !req.session?.isAdmin) return res.status(401).json({success:false,message:"Session expired"});
    const id = Number(req.params?.id || req.body?.loanId || req.body?.id || req.query?.id || 0);
    if(!id) return res.status(400).json({success:false,message:"Loan ID required"});
    const loan = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
    if(!loan) return res.status(404).json({success:false,message:"Loan not found - apply first"});
    if(uid && loan.user_id!==uid && !req.session?.isAdmin) return res.status(403).json({success:false,message:"Not your loan"});
    let rName=loan.receipt_name, rData=loan.receipt_data, rType=loan.receipt_type;
    if(req.file){ rName=req.file.originalname; rType=req.file.mimetype; rData=req.file.buffer.toString("base64"); }
    else if(req.body?.receipt_base64){ rName=String(req.body.receipt_name||"receipt"); rType=String(req.body.receipt_type||""); rData=String(req.body.receipt_base64).slice(0,7*1024*1024); }
    else if(req.body?.receipt){ rName=String(req.body.receipt); }
    if(!rName && !rData) return res.status(400).json({success:false,message:"No receipt file sent - choose screenshot"});
    db.prepare("UPDATE loans SET receipt_name=?, receipt_data=?, receipt_type=? WHERE id=?").run(rName||"",rData||"",rType||"",id);
    return res.json({success:true,message:"Receipt uploaded - waiting for Admin to verify fee", loan:cleanLoan(db.prepare("SELECT * FROM loans WHERE id=?").get(id))});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
if(upload){
  safe("post","/api/loans/:id/receipt", userGuard, upload.single("receipt"), receiptUploadHandler);
  safe("post","/api/loans/admin/:id/receipt", sGuard, upload.single("receipt"), receiptUploadHandler);
} else {
  safe("post","/api/loans/:id/receipt", userGuard, receiptUploadHandler);
  safe("post","/api/loans/admin/:id/receipt", sGuard, receiptUploadHandler);
}
safe("post","/api/loans/upload-receipt", userGuard, receiptUploadHandler);
safe("post","/api/loans/receipt", userGuard, receiptUploadHandler);

// ---------- 2. USER MY LOANS ----------
const myHandler = (req,res) => {
  try{
    const userId = getSessionUserId(req);
    if(!userId) return res.status(401).json({success:false,message:"Session expired"});
    const loans = db.prepare("SELECT id,loan_code,user_id,username,amount,fee,purpose,term_months,receipt_name,status,fee_status,approved_at,disbursed_at,estimated_from,estimated_to,processing_time,processing_message,created_at FROM loans WHERE user_id=? ORDER BY id DESC").all(userId);
    return res.json({success:true, loans});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
safe("get","/api/loans/my", userGuard, myHandler);
safe("get","/api/loans/history", userGuard, myHandler);
safe("get","/api/loans/mine", userGuard, myHandler);

// ---------- 3. ADMIN LIST ----------
const adminList = (req,res) => {
  try{
    const status = String(req.query.status||"").toUpperCase();
    let loans;
    if(status && ["PENDING","APPROVED","DISBURSED","REJECTED"].includes(status)){
      loans = db.prepare("SELECT id,loan_code,user_id,username,email,full_name,amount,fee,purpose,term_months,receipt_name,status,fee_status,approved_at,disbursed_at,estimated_from,estimated_to,processing_time,created_at FROM loans WHERE status=? ORDER BY id DESC").all(status);
    } else {
      loans = db.prepare("SELECT id,loan_code,user_id,username,email,full_name,amount,fee,purpose,term_months,receipt_name,status,fee_status,approved_at,disbursed_at,estimated_from,estimated_to,processing_time,created_at FROM loans ORDER BY id DESC").all();
    }
    const total = loans.length;
    const pending = loans.filter(l=>l.status==="PENDING").length;
    const processing = loans.filter(l=>l.status==="APPROVED").length;
    const disbursed = loans.filter(l=>l.status==="DISBURSED").length;
    const totalFees = loans.reduce((s,l)=>s+Number(l.fee||0),0);
    const totalLoans = loans.reduce((s,l)=>s+Number(l.amount||0),0);
    const totalDisbursed = loans.filter(l=>l.status==="DISBURSED").reduce((s,l)=>s+Number(l.amount||0),0);
    return res.json({success:true, loans, applications:loans, total, pending, processing, disbursed, totalFees, totalLoans, totalDisbursed});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
safe("get","/api/loans/admin", sGuard, adminList);
safe("get","/api/admin/loans", sGuard, adminList);
safe("get","/api/admin/loans/list", sGuard, adminList);
safe("get","/api/loans/admin/list", sGuard, adminList);
safe("get","/api/loans/all", sGuard, adminList);
safe("get","/api/loans/list", sGuard, adminList);

safe("get","/api/loans/admin/:id", sGuard, (req,res)=>{
  try{ const loan=db.prepare("SELECT * FROM loans WHERE id=?").get(Number(req.params.id)); if(!loan) return res.status(404).json({success:false,message:"Loan not found"}); return res.json({success:true, loan:cleanLoan(loan)}); }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});

// ---------- 4. ADMIN VIEW RECEIPT ----------
const viewReceipt = (req,res) => {
  try{
    const id = Number(req.params.id);
    const loan = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
    if(!loan) return res.status(404).json({success:false,message:"Loan not found"});
    if(!loan.receipt_data && !loan.receipt_name) return res.status(404).json({success:false,message:"No receipt file"});
    return res.json({success:true, loan_code:loan.loan_code, receipt_name:loan.receipt_name, receipt_type:loan.receipt_type, receipt_data:loan.receipt_data, loan:cleanLoan(loan), has_receipt:!!(loan.receipt_data||loan.receipt_name)});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
safe("get","/api/loans/admin/:id/receipt", sGuard, viewReceipt);
safe("get","/api/admin/loans/:id/receipt", sGuard, viewReceipt);
safe("get","/api/loans/:id/receipt", sGuard, viewReceipt);

// ---------- 5. ADMIN APPROVE / REJECT / DISBURSE ----------
const adminAction = (req,res) => {
  try{
    const body = req.body||{};
    const id = Number(body.id || body.loanId || body.loan_id || req.params?.id || req.query?.id);
    const action = String(body.action||body.status||req.query?.action||"").toUpperCase();
    if(!id || !["APPROVED","REJECTED","DISBURSED","PENDING"].includes(action)) return res.status(400).json({success:false,message:"Invalid id or action"});
    const loan = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
    if(!loan) return res.status(404).json({success:false,message:"Loan not found"});
    if(action === "APPROVED"){
      if(loan.status !== "PENDING") return res.status(400).json({success:false,message:`Loan already ${loan.status}`});
      const approvedAt = new Date();
      const from = new Date(approvedAt); from.setDate(from.getDate() + 42);
      const to = new Date(approvedAt); to.setDate(to.getDate() + 84);
      db.prepare(`UPDATE loans SET status='APPROVED', fee_status='FEE APPROVED', approved_at=?, estimated_from=?, estimated_to=?, processing_time='6 - 12 Weeks', processing_message=?, reviewed_at=datetime('now') WHERE id=?`)
        .run(approvedAt.toISOString(), from.toISOString(), to.toISOString(), "Your fee has been approved. Your loan is now processing. It will take 6 - 12 weeks to be disbursed.", id);
      const updated = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
      return res.json({success:true, message:"Fee Approved. Loan now processing 6-12 weeks.", loan: cleanLoan(updated)});
    }
    if(action === "DISBURSED"){
      if(loan.status !== "APPROVED") return res.status(400).json({success:false,message:`Only PROCESSING (APPROVED) loans can be disbursed. Current: ${loan.status}. Approve fee first.`});
      let already=null; try{ already=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(loan.user_id, loan.loan_code); }catch{}
      if(already) return res.status(400).json({success:false,message:"This loan was already disbursed - no double credit."});
      const amount = Number(loan.amount||0);
      db.prepare(`UPDATE loans SET status='DISBURSED', fee_status='DISBURSED', disbursed_at=datetime('now'), processing_message=?, reviewed_at=datetime('now') WHERE id=?`)
        .run("Your loan has been disbursed to your Affiliate Balance. ₦" + amount.toLocaleString("en-NG") + " credited. Repayment starts from disbursement date.", id);
      try{ db.prepare("UPDATE users SET affiliate_balance=COALESCE(affiliate_balance,0)+? WHERE id=?").run(amount, loan.user_id); }catch(e){ console.log("disburse credit fail", e.message); }
      try{ db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(loan.user_id,"loan_disbursed",amount,"affiliate",loan.loan_code,`Loan ${loan.loan_code} disbursed to Affiliate Balance - ₦${amount.toLocaleString("en-NG")}`); }catch{}
      try{ notify(loan.user_id,"Loan Disbursed 💰",`Your loan of ₦${amount.toLocaleString("en-NG")} has been disbursed to your Affiliate Balance.`); }catch{}
      console.log(`✅ Loan DISBURSED ${loan.loan_code} - ₦${amount} -> Affiliate`);
      const updated = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
      return res.json({success:true, message:`Loan DISBURSED. ₦${amount.toLocaleString("en-NG")} credited to Affiliate Balance.`, loan: cleanLoan(updated)});
    }
    if(action === "PENDING"){
      db.prepare(`UPDATE loans SET status='PENDING', fee_status='PENDING', reviewed_at=datetime('now') WHERE id=?`).run(id);
      return res.json({success:true, message:"Loan back to PENDING", loan: cleanLoan(db.prepare("SELECT * FROM loans WHERE id=?").get(id))});
    }
    if(loan.status !== "PENDING") return res.status(400).json({success:false,message:`Loan already ${loan.status}`});
    db.prepare(`UPDATE loans SET status='REJECTED', fee_status='REJECTED', reviewed_at=datetime('now') WHERE id=?`).run(id);
    const updated = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
    return res.json({success:true, message:"Loan Rejected", loan: cleanLoan(updated)});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("post","/api/loans/admin", sGuard, adminAction);
force("post","/api/admin/loans/action", sGuard, adminAction);
force("post","/api/loans/admin/action", sGuard, adminAction);
force("post","/api/loans/action", sGuard, adminAction);
force("post","/api/admin/loans/approve", sGuard, (req,res)=>{ req.body.action="APPROVED"; return adminAction(req,res); });
force("post","/api/admin/loans/reject", sGuard, (req,res)=>{ req.body.action="REJECTED"; return adminAction(req,res); });
force("post","/api/admin/loans/disburse", sGuard, (req,res)=>{ req.body.action="DISBURSED"; return adminAction(req,res); });
force("post","/api/loans/admin/:id/action", sGuard, adminAction);
force("post","/api/admin/loans/:id/action", sGuard, adminAction);

// ---------- 6. VENDOR - FIXED WITH EMAIL FALLBACK ----------
const getVendorByUser = (uid)=>{ try{ return db.prepare("SELECT * FROM vendors WHERE user_id=?").get(uid); }catch{ return null; } };
const resolveVendor = (req)=>{
  const uid = resolveUserId(req);
  if(!uid) return null;
  return getVendorByUser(uid);
};
const vendorMe = (req,res)=>{
  try{
    const v = resolveVendor(req);
    if(!v) return res.json({success:false, isVendor:false, is_vendor:false, message:"Not a vendor yet"});
    const st = normStatus(v.status);
    return res.json({success:true, isVendor:st==="APPROVED", is_vendor:st==="APPROVED", vendor:v, vendor_status:st, vendor_balance:Number(v.balance||0)});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
const vendorPending = (req,res)=>{
  try{
    const v = resolveVendor(req);
    if(!v || normStatus(v.status)!=="APPROVED") return res.status(403).json({success:false,message:"Vendor not approved yet - Admin must approve you first"});
    let rows=[]; try{ rows=db.prepare("SELECT * FROM users WHERE account_status NOT IN ('active','approved') OR account_status IS NULL ORDER BY id DESC LIMIT 1000").all(); }catch{}
    return res.json({success:true, users:rows.map(x=>({id:x.id,username:x.username,email:x.email,full_name:x.full_name,package:x.package||x.plan,account_status:x.account_status,status:x.status,activation_cost:PKG_COST[normPkg(x)]||9000})), total:rows.length, vendor_balance:Number(v.balance||0)});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
const vendorActivate = (req,res)=>{
  try{
    const v = resolveVendor(req);
    const uid = resolveUserId(req);
    if(!v) return res.status(403).json({success:false,message:"Not a vendor"});
    if(normStatus(v.status)!=="APPROVED") return res.status(403).json({success:false,message:"Vendor not approved yet"});
    const targetId = Number(req.body?.userId || req.body?.id || req.params?.id || 0); if(!targetId) return res.status(400).json({success:false,message:"User ID required"});
    const target = db.prepare("SELECT * FROM users WHERE id=?").get(targetId); if(!target) return res.status(404).json({success:false,message:"User not found"});
    const st = String(target.account_status||target.status||"").toLowerCase(); if(["active","approved"].includes(st)) return res.status(400).json({success:false,message:"User already active"});
    const pkg = normPkg(target); const cost = PKG_COST[pkg]||9000; const bal = Number(v.balance||0);
    if(bal < cost) return res.status(400).json({success:false,message:`Insufficient Vendor Fund! You need ₦${cost.toLocaleString()} to activate ${pkg} user. Your balance: ₦${bal.toLocaleString()}. Ask Admin to fund you.`, need:cost, balance:bal, package:pkg});
    db.prepare("UPDATE vendors SET balance=COALESCE(balance,0)-?, total_activated=COALESCE(total_activated,0)+1, total_deducted=COALESCE(total_deducted,0)+? WHERE id=?").run(cost,cost,v.id);
    try{ db.prepare("UPDATE users SET account_status='active' WHERE id=?").run(targetId); }catch{}
    try{ db.prepare("UPDATE users SET status='active' WHERE id=?").run(targetId); }catch{}
    try{
      const wel = pkg==="GOLD"?15000:pkg==="SUPER"?21000:9000;
      const hasWel = db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(targetId, `WELCOME_${targetId}`);
      if(!hasWel){ db.prepare("UPDATE users SET wallet_balance=COALESCE(wallet_balance,0)+? WHERE id=?").run(wel,targetId); db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(targetId,"welcome_bonus",wel,"wallet",`WELCOME_${targetId}`,`Welcome bonus - ${pkg} activated by Vendor`); }
    }catch{}
    try{ db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(uid,"vendor_activation_deduct",-cost,"vendor",`VENDOR_ACT_${targetId}`,`Vendor activation - ₦${cost.toLocaleString()} deducted for activating ${target.username} (${pkg})`); }catch{}
    try{ notify(uid,"Vendor Activation - Deducted",`₦${cost.toLocaleString()} deducted for activating ${target.username} (${pkg}). Remaining: ₦${(bal-cost).toLocaleString()}`); }catch{}
    try{ notify(targetId,"Account Activated ✅",`Your ${pkg} account don activate. Welcome bonus don enter.`); }catch{}
    return res.json({success:true,message:`${target.username} (${pkg}) activated ✅ ₦${cost.toLocaleString()} deducted. Remaining: ₦${(bal-cost).toLocaleString()}`, deducted:cost, cost, remaining_balance:bal-cost, vendor_balance:bal-cost});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("get","/api/vendor/me", vendorMe);
force("get","/api/vendor/dashboard", vendorMe);
force("get","/api/vendor/pending-users", vendorPending);
force("get","/api/vendor/users/pending", vendorPending);
force("post","/api/vendor/activate", vendorActivate);
force("post","/api/vendor/activate/:id", vendorActivate);
force("post","/api/vendor/users/activate", vendorActivate);

// ---------- 6b. ADMIN VENDORS ----------
safe("get","/api/admin/vendors", sGuard, (req,res)=>{ try{ const rows=db.prepare("SELECT v.*, u.username as username, u.email as email, u.full_name as full_name, u.package as package, u.account_status as account_status FROM vendors v LEFT JOIN users u ON u.id=v.user_id ORDER BY v.id DESC LIMIT 200").all(); return res.json({success:true,vendors:rows,total:rows.length}); }catch(e){ return res.status(500).json({success:false,message:e.message}); } });
force("post","/api/admin/vendors/create", sGuard, (req,res)=>{
  try{
    const val = req.body?.email || req.body?.username || req.body?.userId || req.body?.user_id || req.body?.user || req.body?.vendor || "";
    const phone = String(req.body?.phone || "").trim();
    if(!val) return res.status(400).json({success:false, message:"Enter email / username / userId"});
    const user = findUserByVal(val);
    if(!user) return res.status(404).json({success:false, message:"User not found. Check email / username / ID"});
    const ex = db.prepare("SELECT * FROM vendors WHERE user_id=?").get(user.id);
    if(ex) return res.status(400).json({success:false, message:`This user don already be Vendor - Status: ${ex.status}. Go approve am below.`});
    const code = "VND-"+Math.random().toString(36).slice(2,7).toUpperCase();
    const info = db.prepare("INSERT INTO vendors (user_id, code, vendor_name, phone, status, balance, total_activated, total_deducted) VALUES (?,?,?,?, 'PENDING', 0, 0, 0)").run(user.id, code, String(user.full_name || user.username || ""), phone || String(user.phone || ""));
    const vendor = db.prepare("SELECT * FROM vendors WHERE id=?").get(info.lastInsertRowid);
    return res.json({success:true, message:`${user.username} don enter as PENDING Vendor. Approve am now.`, vendor});
  }catch(e){ return res.status(500).json({success:false, message:e.message}); }
});
force("post","/api/admin/vendor/create", sGuard, (req,res)=>{
  try{
    const val = req.body?.email || req.body?.username || req.body?.userId || req.body?.user_id || req.body?.user || "";
    const phone = String(req.body?.phone || "").trim();
    if(!val) return res.status(400).json({success:false, message:"Enter email / username / userId"});
    const user = findUserByVal(val);
    if(!user) return res.status(404).json({success:false, message:"User not found"});
    const ex = db.prepare("SELECT * FROM vendors WHERE user_id=?").get(user.id);
    if(ex) return res.status(400).json({success:false, message:`This user don already be Vendor - Status: ${ex.status}`});
    const code = "VND-"+Math.random().toString(36).slice(2,7).toUpperCase();
    const info = db.prepare("INSERT INTO vendors (user_id, code, vendor_name, phone, status, balance, total_activated, total_deducted) VALUES (?,?,?,?, 'PENDING', 0, 0, 0)").run(user.id, code, String(user.full_name || user.username || ""), phone || String(user.phone || ""));
    return res.json({success:true, message:`${user.username} don enter as PENDING Vendor. Approve am now.`, vendor:db.prepare("SELECT * FROM vendors WHERE id=?").get(info.lastInsertRowid)});
  }catch(e){ return res.status(500).json({success:false, message:e.message}); }
});
force("post","/api/admin/vendors/action", sGuard, (req,res)=>{ try{ const id=Number(req.body?.id||req.body?.vendorId||0); const act=String(req.body?.action||req.body?.status||"").toUpperCase(); if(!id) return res.status(400).json({success:false,message:"Vendor ID required"}); const v=db.prepare("SELECT * FROM vendors WHERE id=?").get(id); if(!v) return res.status(404).json({success:false,message:"Vendor not found"}); const st=act.includes("APPROV")?"APPROVED":act.includes("REJECT")?"REJECTED":act.includes("SUSPEND")?"SUSPENDED":"PENDING"; db.prepare("UPDATE vendors SET status=? WHERE id=?").run(st,id); return res.json({success:true,message:`Vendor ${st}`,vendor:db.prepare("SELECT * FROM vendors WHERE id=?").get(id)}); }catch(e){ return res.status(500).json({success:false,message:e.message}); } });
const adminCreditVendor = (req,res)=>{
  try{
    const id=Number(req.body?.id||req.body?.vendorId||req.params?.id||0);
    const amt=Number(req.body?.amount||0);
    if(!id||!amt||amt<=0) return res.status(400).json({success:false,message:"Vendor ID + amount required"});
    const v=db.prepare("SELECT * FROM vendors WHERE id=?").get(id);
    if(!v) return res.status(404).json({success:false,message:"Vendor not found"});
    const user=db.prepare("SELECT * FROM users WHERE id=?").get(v.user_id);
    if(!user) return res.status(404).json({success:false,message:"Vendor user not found"});
// ✅ FIX: Only vendors.balance - NO double credit to affiliate_balance
    db.prepare("UPDATE vendors SET balance=COALESCE(balance,0)+? WHERE id=?").run(amt,id);
    try{ db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(v.user_id,"vendor_funded",amt,"vendor",`VENDOR_FUND_${id}`,`Admin funded Vendor Balance +₦${amt.toLocaleString()}`); }catch{}
    try{ notify(v.user_id,"Vendor Funded 💰",`Admin don fund your Vendor Balance with ₦${amt.toLocaleString()}. SILVER ₦9,000 / GOLD ₦15,000 / SUPER ₦21,000 go deduct per activation.`); }catch{}
    return res.json({success:true,message:`Vendor ${user.username} funded ₦${amt.toLocaleString()}. New: ₦${(Number(v.balance||0)+amt).toLocaleString()}`,vendor:db.prepare("SELECT * FROM vendors WHERE id=?").get(id)});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("post","/api/admin/vendors/fund", sGuard, adminCreditVendor);
force("post","/api/admin/vendors/credit", sGuard, adminCreditVendor);
force("post","/api/admin/vendors/:id/fund", sGuard, adminCreditVendor);
force("post","/api/admin/vendors/:id/credit", sGuard, adminCreditVendor);
safe("post","/api/vendor/register", (req,res)=>{ try{ const uid=getSessionUserId(req); if(!uid) return res.status(401).json({success:false,message:"Login first"}); const ex=getVendorByUser(uid); if(ex) return res.json({success:true,alreadyExists:true,message:"You already applied - Status: "+ex.status,vendor:ex}); const code="VND-"+Math.random().toString(36).slice(2,7).toUpperCase(); const u=db.prepare("SELECT * FROM users WHERE id=?").get(uid); db.prepare("INSERT INTO vendors (user_id,code,vendor_name,phone,status) VALUES (?,?,?,?, 'PENDING')").run(uid,code,String(req.body?.vendor_name||u?.full_name||u?.username||""),String(req.body?.phone||u?.phone||"")); return res.json({success:true,message:"Vendor application sent - wait for Admin to approve you",vendor:db.prepare("SELECT * FROM vendors WHERE user_id=?").get(uid)}); }catch(e){ return res.status(500).json({success:false,message:e.message}); } });

// ---------- 7. FIX 71000 -> 7100 ----------
force("post","/api/admin/fix-71000", sGuard, (req,res)=>{
  try{
    let report = [];
    const tryRun = (label, sql) => {
      try{ const r = db.prepare(sql).run(); report.push(`${label}: ${r.changes} fixed`); }
      catch(e){ report.push(`${label}: skipped`); }
    };
    tryRun("tasks.reward", "UPDATE tasks SET reward=7100 WHERE reward=71000");
    tryRun("tasks.amount", "UPDATE tasks SET amount=7100 WHERE amount=71000");
    tryRun("tasks.earning", "UPDATE tasks SET earning=7100 WHERE earning=71000");
    tryRun("tasks.price", "UPDATE tasks SET price=7100 WHERE price=71000");
    tryRun("jobs.reward", "UPDATE jobs SET reward=7100 WHERE reward=71000");
    tryRun("jobs.amount", "UPDATE jobs SET amount=7100 WHERE amount=71000");
    tryRun("jobs.price", "UPDATE jobs SET price=7100 WHERE price=71000");
    tryRun("videos.reward", "UPDATE videos SET reward=7100 WHERE reward=71000");
    tryRun("videos.amount", "UPDATE videos SET amount=7100 WHERE amount=71000");
    tryRun("task_videos.reward", "UPDATE task_videos SET reward=7100 WHERE reward=71000");
    tryRun("task_videos.amount", "UPDATE task_videos SET amount=7100 WHERE amount=71000");
    tryRun("products.price", "UPDATE products SET price=7100 WHERE price=71000");
    tryRun("products.amount", "UPDATE products SET amount=7100 WHERE amount=71000");
    let corrected = 0;
    try{
      const txs = db.prepare("SELECT * FROM wallet_transactions WHERE amount=71000").all();
      for(const t of txs){
        const already = db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(t.user_id, 'FIX_71000_'+t.id);
        if(already) continue;
        db.prepare("UPDATE users SET wallet_balance = MAX(0, COALESCE(wallet_balance,0)-63900) WHERE id=?").run(t.user_id);
        db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(t.user_id, 'task_correction', -63900, 'wallet', 'FIX_71000_'+t.id, 'Correction: 71,000 -> 7,100 - extra 63,900 removed');
        try{ db.prepare("INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)").run(t.user_id, 'Task Reward Corrected', 'That task reward na ₦7,100, no be ₦71,000. We don remove extra ₦63,900. Your ₦7,100 still dey.'); }catch{}
        corrected++;
      }
     report.push(`users corrected: ${corrected} users, ₦63,900 removed each`);
    }catch(e){ report.push(`users corrected: skipped`); }
    tryRun("wallet_transactions task 71000->7100", "UPDATE wallet_transactions SET amount=7100 WHERE amount=71000 AND type LIKE '%task%'");
    tryRun("wallet_transactions job 71000->7100", "UPDATE wallet_transactions SET amount=7100 WHERE amount=71000 AND type LIKE '%job%'");
    return res.json({success:true, message:`Done! Everywhere 71,000 don change to 7,100. ${corrected} users corrected.`, report});
  }catch(e){ return res.status(500).json({success:false, message:e.message}); }
});
force("get","/api/admin/fix-71000", sGuard, (req,res)=>{ return res.json({success:true, message:"Use POST /api/admin/fix-71000 to run the fix. Send POST with key=jovia123"}); });

console.log("✅ LOANS v4 READY - FORGOT PASSWORD + VENDOR FIXED + NO DOUBLE DEDUCT + 71000");

// ---------- REQUIRED STUFF SO SERVER 4 CAN CONNECT AND WORK WITH SERVER 3 - ADD AM HERE ----------
try{
  // Server 4 file must dey same folder as Server 3
  require("./server4")(app, db, requireUser, requireAdmin);
  console.log("✅ SERVER 4 CONNECTED TO SERVER 3 - WORKING AS ONE");
}catch(e){
  console.log("⚠️ Server4 file not found, loading Server4 inside Server 3 as backup:", e.message);
  // BACKUP: If server4.js no dey, these go still work inside Server 3, so Server 4 no go fail
  try{
    // 2. Admin Search
    force("get","/api/admin/users/search", sGuard, (req,res)=>{
      try{
        const q = String(req.query.q || req.query.search || req.query.email || req.query.username || "").trim();
        if(!q) return res.status(400).json({success:false,message:"Enter email / name / username / ID"});
        const like="%"+q+"%";
        const rows=db.prepare("SELECT * FROM users WHERE CAST(id AS TEXT) LIKE ? OR username LIKE ? OR email LIKE ? OR full_name LIKE ? ORDER BY id DESC LIMIT 100").all(like,like,like,like);
        return res.json({success:true, users:rows, total:rows.length});
      }catch(err){ return res.status(500).json({success:false,message:err.message}); }
    });
    // 4. Admin Balance User
    force("get","/api/admin/balance/user", sGuard, (req,res)=>{
      try{
        const v = req.query.email || req.query.username || req.query.userId || req.query.id || "";
        if(!v) return res.status(400).json({success:false,message:"Enter email / username / ID"});
        const user = findUserByVal(v);
        if(!user) return res.status(404).json({success:false,message:"User not found"});
        const w=Number(user.wallet_balance||0), a=Number(user.affiliate_balance||0), r=Number(user.referral_balance||0), g=Number(user.game_balance||0);
        return res.json({success:true,user:{id:user.id,username:user.username,email:user.email,full_name:user.full_name,package:user.package||user.plan,account_status:user.account_status},balances:{wallet_balance:w,affiliate_balance:a,referral_balance:r,game_balance:g,total_balance:w+a+r+g}});
      }catch(err){ return res.status(500).json({success:false,message:err.message}); }
    });
    // 4b. Admin Balance History - ADDED BACK
    force("get","/api/admin/balance/history", sGuard, (req,res)=>{
      try{
        const v = req.query.email || req.query.username || req.query.userId || req.query.id || "";
        let rows=[];
        if(v){
          const user=findUserByVal(v);
          if(!user) return res.status(404).json({success:false,message:"User not found"});
          try{ rows=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 100").all(user.id); }catch{}
          return res.json({success:true,user:{id:user.id,username:user.username,email:user.email,full_name:user.full_name},history:rows,transactions:rows,total:rows.length});
        }
        try{ rows=db.prepare("SELECT * FROM wallet_transactions ORDER BY id DESC LIMIT 100").all(); }catch{}
        return res.json({success:true,history:rows,transactions:rows,total:rows.length});
      }catch(err){ return res.status(500).json({success:false,message:err.message}); }
    });
    force("get","/api/admin/balance-history", sGuard, (req,res)=>{ return res.redirect(307, "/api/admin/balance/history?key=jovia123"); });
    // 5. Admin Upgrades List
    force("get","/api/admin/upgrades/list", sGuard, (req,res)=>{
      try{
        let rows=[];
        try{ if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='upgrades'").get()) rows=db.prepare("SELECT * FROM upgrades ORDER BY id DESC LIMIT 500").all(); }catch{}
        if(!rows.length){ const users=db.prepare("SELECT id,username,email,full_name,package,plan,account_status,created_at FROM users ORDER BY id DESC LIMIT 200").all(); rows=users.map(u=>({id:u.id,user_id:u.id,username:u.username,email:u.email,full_name:u.full_name,to_package:u.package||u.plan,status:u.account_status,created_at:u.created_at})); }
        return res.json({success:true,upgrades:rows,total:rows.length,list:rows});
      }catch(err){ return res.status(500).json({success:false,message:err.message}); }
    });
    // 5b. Loans Admin - ADDED BACK
    force("get","/api/loans/admin", sGuard, (req,res)=>{
      try{
        let rows=[];
        try{ if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='loans'").get()) rows=db.prepare("SELECT * FROM loans ORDER BY id DESC LIMIT 500").all(); }catch{}
        if(!rows.length){ try{ if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='loan_requests'").get()) rows=db.prepare("SELECT * FROM loan_requests ORDER BY id DESC LIMIT 500").all(); }catch{} }
        return res.json({success:true,loans:rows,total:rows.length,list:rows});
      }catch(err){ return res.status(500).json({success:false,message:err.message}); }
    });
    force("get","/api/admin/loans", sGuard, (req,res)=>{ return res.redirect(307, "/api/loans/admin?key=jovia123"); });
    // 6. Game Screenshot No-Duplicate
    try{ db.exec(`CREATE TABLE IF NOT EXISTS screenshot_hashes (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,hash TEXT UNIQUE,filename TEXT,game_id TEXT,created_at TEXT DEFAULT (datetime('now')))`); }catch{}
    force("post","/api/game/upload-screenshot", (req,res)=>{
      try{
        const crypto=require("crypto");
        const uid = resolveUserId(req); if(!uid) return res.status(401).json({success:false,message:"Session expired"});
        const b=req.body||{}; const raw = req.file ? req.file.buffer : Buffer.from(String(b.screenshot_base64||b.screenshot||b.image||b.proof||"").replace(/^data:[^;]+;base64,[STRIPPED],"base64");
        if(!raw.length) return res.status(400).json({success:false,message:"No screenshot sent"});
        const hash=crypto.createHash("sha256").update(raw).digest("hex");
        if(db.prepare("SELECT * FROM screenshot_hashes WHERE hash=?").get(hash)) return res.status(400).json({success:false,message:"This screenshot don already upload before - upload a new screenshot, no reuse old one",duplicate:true});
        db.prepare("INSERT OR IGNORE INTO screenshot_hashes (user_id,hash,filename,game_id) VALUES (?,?,?,?)").run(uid,hash,b.filename||"",b.game_id||"");
        return res.json({success:true,message:"Screenshot uploaded ✅"});
      }catch(err){ return res.status(500).json({success:false,message:err.message}); }
    });
    // 7. Ping
    force("get","/api/server4/ping", (req,res)=>{ return res.json({success:true,message:"Server4 dey work ✅ - connected inside Server 3"}); });
    console.log("✅ SERVER 4 BACKUP LOADED INSIDE SERVER 3");
  }catch(e2){ console.log("⚠️ Server4 backup fail:", e2.message); }
}

}catch(e){ console.log("⚠️ Loans load error (no crash):", e.message); }
};
