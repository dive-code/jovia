"use strict";
module.exports = (app, db, requireUser, requireAdmin) => {
try{
console.log("🔧 LOANS v2 - 12% FEE + 6-12 WEEKS + DISBURSED");
if(!app || typeof app.get !== "function" || typeof app.post !== "function"){ console.log("⚠️ Loans skip"); return; }

// ---------- Helpers - Same Style As Server3 ----------
const exists = (p,m) => { try{ if(!app._router?.stack) return false; return app._router.stack.some(l=>l.route && l.route.path===p && Object.keys(l.route.methods)[0]===m); }catch{ return false; } };
let allow=false; const withAllow = fn => { allow=true; try{ fn() }finally{ allow=false } };
const safe = (m,p,...h) => { try{ if(exists(p,m)){ console.log("⏭️ Skip "+m.toUpperCase()+" "+p); return } withAllow(()=>app[m](p,...h)); console.log("✅ Loans Added "+m.toUpperCase()+" "+p); }catch(e){ console.log("⚠️ Loans safeAdd skip", e.message) } };
const force = (m,p,...h) => { try{ if(app._router?.stack) app._router.stack = app._router.stack.filter(l=>!l.route || l.route.path!==p || Object.keys(l.route.methods)[0]!==m); }catch{} try{ withAllow(()=>app[m](p,...h)); }catch(e){ console.log("⚠️ Loans forceAdd skip", e.message); return; } console.log("✅ Loans FORCE "+m.toUpperCase()+" "+p); };

const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";
const isOrigin = o => String(o||"").includes("jovianetworkcom") || String(o||"").includes("vercel.app") || String(o||"").includes("localhost");

// Admin guard - same as Server3
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

// User guard - use your requireUser if exists, else session
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

// Try to add columns if table existed before - NOW WITH DISBURSED_AT
try{ const cols = db.prepare("PRAGMA table_info(loans)").all().map(c=>c.name);
  if(!cols.includes("receipt_data")) db.exec("ALTER TABLE loans ADD COLUMN receipt_data TEXT");
  if(!cols.includes("estimated_from")) db.exec("ALTER TABLE loans ADD COLUMN estimated_from TEXT");
  if(!cols.includes("estimated_to")) db.exec("ALTER TABLE loans ADD COLUMN estimated_to TEXT");
  if(!cols.includes("disbursed_at")) db.exec("ALTER TABLE loans ADD COLUMN disbursed_at TEXT");
  if(!cols.includes("approved_at")) db.exec("ALTER TABLE loans ADD COLUMN approved_at TEXT");
  if(!cols.includes("fee_status")) db.exec("ALTER TABLE loans ADD COLUMN fee_status TEXT DEFAULT 'PENDING'");
}catch{}

// ---------- Helpers ----------
const isSuperPkg = (u) => String(u?.package||u?.plan||"").toUpperCase().includes("SUPER");
const money = n => "₦"+Number(n||0).toLocaleString("en-NG");
const cleanLoan = (l) => {
  if(!l) return null;
  const { receipt_data, ...rest } = l;
  return { ...rest, has_receipt: !!l.receipt_data || !!l.receipt_name };
};

// Multer for receipt - optional, fallback to base64
let upload = null;
try{
  const multer = require("multer");
  upload = multer({ storage: multer.memoryStorage(), limits:{ fileSize: 5*1024*1024 } });
}catch{ console.log("⚠️ multer not found - will use base64 receipt field"); }

// ---------- 1. USER APPLY - POST /api/loans/apply ----------
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
      if(pending) return res.status(400).json({success:false,message:"You already have a pending loan. Wait for Admin review."});
    }catch{}
    const loanCode = "LOAN-" + Date.now();
    const info = db.prepare(`INSERT INTO loans (loan_code,user_id,username,email,full_name,amount,fee,purpose,term_months,receipt_name,receipt_data,receipt_type,status,fee_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(loanCode, userId, user.username, user.email, user.full_name, amount, fee, purpose, term, receiptName, receiptData, receiptType, "PENDING", "PENDING");
    const loan = db.prepare("SELECT * FROM loans WHERE id=?").get(info.lastInsertRowid);
    console.log(`✅ Loan applied ${loanCode} ${user.username} ${money(amount)} fee ${money(fee)}`);
    return res.json({success:true,message:"Application received. Pending Admin approval.", loan: cleanLoan(loan)});
  }catch(e){ console.error("Loan apply", e); return res.status(500).json({success:false,message:e.message}); }
};
if(upload){
  safe("post","/api/loans/apply", userGuard, upload.single("receipt"), applyHandler);
} else {
  safe("post","/api/loans/apply", userGuard, applyHandler);
}

// ---------- 2. USER MY LOANS - GET /api/loans/my ----------
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

// ---------- 3. ADMIN LIST - GET /api/loans/admin ----------
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
    return res.json({success:true, loans, total, pending, processing, disbursed, totalFees, totalLoans, totalDisbursed});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
safe("get","/api/loans/admin", sGuard, adminList);
safe("get","/api/admin/loans", sGuard, adminList);
safe("get","/api/admin/loans/list", sGuard, adminList);

// ---------- 4. ADMIN VIEW RECEIPT - GET /api/loans/admin/:id/receipt ----------
const viewReceipt = (req,res) => {
  try{
    const id = Number(req.params.id);
    const loan = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
    if(!loan) return res.status(404).json({success:false,message:"Loan not found"});
    if(!loan.receipt_data) return res.status(404).json({success:false,message:"No receipt file"});
    return res.json({success:true, loan_code:loan.loan_code, receipt_name:loan.receipt_name, receipt_type:loan.receipt_type, receipt_data:loan.receipt_data});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
safe("get","/api/loans/admin/:id/receipt", sGuard, viewReceipt);

// ---------- 5. ADMIN APPROVE / REJECT / DISBURSE - POST /api/loans/admin ----------
const adminAction = (req,res) => {
  try{
    const body = req.body||{};
    const id = Number(body.id || body.loanId || body.loan_id);
    const action = String(body.action||"").toUpperCase();
    if(!id || !["APPROVED","REJECTED","DISBURSED"].includes(action)) return res.status(400).json({success:false,message:"Invalid id or action"});

    const loan = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
    if(!loan) return res.status(404).json({success:false,message:"Loan not found"});

    if(action === "APPROVED"){
      if(loan.status !== "PENDING") return res.status(400).json({success:false,message:`Loan already ${loan.status}`});
      const approvedAt = new Date();
      const from = new Date(approvedAt); from.setDate(from.getDate() + 42);
      const to = new Date(approvedAt); to.setDate(to.getDate() + 84);
      db.prepare(`UPDATE loans SET status='APPROVED', fee_status='FEE APPROVED', approved_at=?, estimated_from=?, estimated_to=?, processing_time='6 - 12 Weeks', processing_message=?, reviewed_at=datetime('now') WHERE id=?`)
        .run(approvedAt.toISOString(), from.toISOString(), to.toISOString(), "Your fee has been approved. Your loan is now processing. It will take 6 - 12 weeks to be disbursed.", id);
      console.log(`✅ Loan APPROVED ${loan.loan_code} - Processing 6-12 Weeks`);
      const updated = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
      return res.json({success:true, message:"Fee Approved. Loan now processing 6-12 weeks.", loan: cleanLoan(updated)});
    }

    if(action === "DISBURSED"){
      if(loan.status !== "APPROVED") return res.status(400).json({success:false,message:`Only PROCESSING (APPROVED) loans can be disbursed. Current: ${loan.status}. Approve fee first.`});
      db.prepare(`UPDATE loans SET status='DISBURSED', fee_status='DISBURSED', disbursed_at=datetime('now'), processing_message=?, reviewed_at=datetime('now') WHERE id=?`)
        .run("Your loan has been disbursed. ₦" + Number(loan.amount||0).toLocaleString("en-NG") + " paid to you. Repayment starts from disbursement date.", id);
      console.log(`✅ Loan DISBURSED ${loan.loan_code} - ₦${loan.amount} paid`);
      const updated = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
      return res.json({success:true, message:"Loan marked as DISBURSED. User will see Loan Disbursed.", loan: cleanLoan(updated)});
    }

    // REJECTED - only from PENDING
    if(loan.status !== "PENDING") return res.status(400).json({success:false,message:`Loan already ${loan.status}`});
    db.prepare(`UPDATE loans SET status='REJECTED', fee_status='REJECTED', reviewed_at=datetime('now') WHERE id=?`).run(id);
    const updated = db.prepare("SELECT * FROM loans WHERE id=?").get(id);
    return res.json({success:true, message:"Loan Rejected", loan: cleanLoan(updated)});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
};
force("post","/api/loans/admin", sGuard, adminAction);
force("post","/api/admin/loans/action", sGuard, adminAction);
force("post","/api/admin/loans/approve", sGuard, (req,res)=>{ req.body.action="APPROVED"; return adminAction(req,res); });
force("post","/api/admin/loans/reject", sGuard, (req,res)=>{ req.body.action="REJECTED"; return adminAction(req,res); });
force("post","/api/admin/loans/disburse", sGuard, (req,res)=>{ req.body.action="DISBURSED"; return adminAction(req,res); });

console.log("✅ LOANS v2 READY - /api/loans/apply + /api/loans/my + /api/loans/admin + 6-12 WEEKS + DISBURSED");
}catch(e){ console.log("⚠️ Loans load error (no crash):", e.message); }
};
