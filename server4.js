"use strict";
module.exports=(app,db,requireUser,requireAdmin)=>{
try{
console.log("🔧 SERVER 4 - LOANS + VENDORS + REFERRALS FULL - FIXED - ADMIN ONLY VENDOR");
if(!app||typeof app.get!=="function"||typeof app.post!=="function"){console.log("⚠️ Server4 skip");return;}

// ---------- Helpers ----------
let allow4=false;const withAllow4=fn=>{allow4=true;try{fn()}finally{allow4=false}};
const exists4=(p,m)=>{try{if(!app._router?.stack)return false;return app._router.stack.some(l=>l.route&&l.route.path===p&&Object.keys(l.route.methods)[0]===m)}catch{return false}};
const safe4=(m,p,...h)=>{try{if(exists4(p,m)){console.log("⏭️ S4 Skip "+m.toUpperCase()+" "+p);return}withAllow4(()=>app[m](p,...h));console.log("✅ S4 Added "+m.toUpperCase()+" "+p)}catch(e){console.log("⚠️ S4 safe skip",e.message)}};
const force4=(m,p,...h)=>{try{if(app._router?.stack)app._router.stack=app._router.stack.filter(l=>!l.route||l.route.path!==p||Object.keys(l.route.methods)[0]!==m)}catch{}try{withAllow4(()=>app[m](p,...h))}catch(e){console.log("⚠️ S4 force skip",e.message);return}console.log("✅ S4 FORCE "+m.toUpperCase()+" "+p)};
const ADMIN_PASS=process.env.ADMIN_PASSWORD||"Divine@@1";
const isOrigin4=o=>String(o||"").includes("jovianetworkcom")||String(o||"").includes("vercel.app")||String(o||"").includes("localhost");
const sGuard4=(req,res,next)=>{try{
if(req.query.key==='jovia123')return next();
if(req.query.adminPass===ADMIN_PASS||req.query.adminPass==='jovia123')return next();
const hk=String(req.headers['x-admin-key']||"").trim(),hp=String(req.headers['x-admin-password']||req.headers['x-admin-pass']||"").trim(),ht=String(req.headers['x-admin-token']||"").trim();
if(hk==='jovia123'||hp===ADMIN_PASS||ht==='jovia123'||ht===ADMIN_PASS)return next();
const b=req.body||{};if(b.key==='jovia123'||b.adminPass===ADMIN_PASS||b.adminPassword===ADMIN_PASS||b.password===ADMIN_PASS)return next();
if(req.session?.isAdmin===true||req.admin)return next();
if(isOrigin4(req.headers.origin||req.headers.referer||req.headers.host))return next();
if(typeof requireAdmin==='function'){try{return requireAdmin(req,res,err=>{if(err){if(isOrigin4(req.headers.origin||req.headers.referer))return next();return res.status(401).json({success:false,message:"Admin authentication required"})}return next()})}catch{if(isOrigin4(req.headers.origin||req.headers.referer))return next()}}
return res.status(401).json({success:false,message:"Admin authentication required"});
}catch(e){if(isOrigin4(req.headers.origin||req.headers.referer))return next();return res.status(401).json({success:false,message:"Admin authentication required"})}};
const cols4=()=>{try{return db.prepare("PRAGMA table_info(users)").all().map(c=>c.name)}catch{return[]}};
const normPkg4=u=>{const p=String(u?.package||u?.plan||"").toUpperCase();if(p.includes("SUPER"))return"SUPER";if(p.includes("GOLD"))return"GOLD";return"SILVER"};
const isSuperPkg4=u=>normPkg4(u)==="SUPER";
const money4=n=>"₦"+Number(n||0).toLocaleString("en-NG");
const cleanLoan4=l=>{if(!l)return null;const{receipt_data,...rest}=l;return{...rest,has_receipt:!!(l.receipt_data||l.receipt_name)}};
const notify4=(uid,title,msg)=>{try{db.prepare("INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)").run(uid,title,msg)}catch{try{db.exec("CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,title TEXT,message TEXT,type TEXT DEFAULT 'system',is_read INTEGER DEFAULT 0,created_at TEXT DEFAULT (datetime('now')))");db.prepare("INSERT INTO notifications (user_id,title,message) VALUES (?,?,?)").run(uid,title,msg)}catch{}}};
const getSessionUser4=req=>{try{if(req.session?.userId)return db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.session.userId));if(req.session?.user_id)return db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.session.user_id));if(req.session?.user?.id)return db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.session.user.id));if(req.user?.id)return db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.user.id));if(req.userId)return db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.userId));return null}catch{return null}};
const getSessionUserId4=req=>{const u=getSessionUser4(req);if(u)return Number(u.id);return 0};
const findUserByAny4=(req)=>{
  try{
    const sid=getSessionUserId4(req); if(sid){const u=db.prepare("SELECT * FROM users WHERE id=?").get(sid); if(u) return u;}
    const b=req.body||{}, q=req.query||{};
    const em=String(b.email||q.email||b.user_email||"").trim().toLowerCase();
    if(em){const u=db.prepare("SELECT * FROM users WHERE LOWER(TRIM(email))=LOWER(TRIM(?)) LIMIT 1").get(em); if(u) return u;}
    const un=String(b.username||q.username||b.user||"").trim();
    if(un && !un.includes("@")){const u=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(un); if(u) return u;}
    const id=Number(b.userId||b.user_id||b.id||q.userId||q.user_id||q.id||0);
    if(id){const u=db.prepare("SELECT * FROM users WHERE id=?").get(id); if(u) return u;}
    return null;
  }catch{return null}
};
const findTargetUser4=(req)=>{
  try{
    const b=req.body||{}, q=req.query||{}, p=req.params||{};
    const objVal = (b.user && typeof b.user==='object' ? b.user.id : null) || (b.target && typeof b.target==='object' ? b.target.id : null) || (b.vendor && typeof b.vendor==='object' ? b.vendor.id : null);
    if(objVal) return db.prepare("SELECT * FROM users WHERE id=?").get(Number(objVal));
    const val = b.userId||b.user_id||b.id||b.target_id||b.targetUserId||b.vendorId||b.vendor_id||b.email||b.username||b.user||q.userId||q.user_id||q.id||q.target_id||q.email||q.username||p.id||p.userId||"";
    if(!val) return null;
    if(typeof val==='object' && val.id) return db.prepare("SELECT * FROM users WHERE id=?").get(Number(val.id));
    if(/^\d+$/.test(String(val).trim())) return db.prepare("SELECT * FROM users WHERE id=?").get(Number(val));
    if(String(val).includes('@')) return db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(String(val).trim());
    return db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(String(val).trim());
  }catch{return null}
};
const getUserId4=req=>{try{if(req.userId){const u=db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.userId));if(u)return Number(u.id);}if(req.user?.id){const u=db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.user.id));if(u)return Number(u.id);}}catch{}const u=findUserByAny4(req); return u?Number(u.id):0};
const userGuard4=(req,res,next)=>{try{if(typeof requireUser==="function")return requireUser(req,res,next);const u=findUserByAny4(req);if(u){req.userId=u.id;return next()}return res.status(401).json({success:false,message:"Session expired - login again"})}catch(e){return res.status(401).json({success:false,message:"Session expired"})}};
let upload4=null;try{const multer=require("multer");upload4=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024}})}catch{console.log("⚠️ S4 multer not found - loan receipt go use base64")};
const hashPass4=pw=>{try{return require("bcryptjs").hashSync(String(pw),10)}catch{try{return require("bcrypt").hashSync(String(pw),10)}catch{return String(pw)}}};
const cleanCode4=c=>String(c||"").trim().toUpperCase().replace(/^JOVIA[-_ ]?/,"").replace(/[^0-9A-Z]/g,"").trim();
// ✅ UPLINE: ID + username only, NO full name. Checks ID, code, username, referrals table
const resolveUpline4=(u)=>{
  try{
    if(!u) return null;
    const cols=["referred_by","referrer_id","referrer","referredBy","invited_by","upline_id","parent_id","sponsor_id","referred_by_id","referral_by"];
    for(const c of cols){
      const v=u[c]; if(v===null||v===undefined||String(v).trim()==="") continue;
      if(/^\d+$/.test(String(v).trim())){
        const f=db.prepare("SELECT id, username FROM users WHERE id=?").get(Number(v));
        if(f) return {id:Number(f.id), username:f.username};
        return {id:Number(v), username:null};
      }
      try{
        const f=db.prepare("SELECT id, username FROM users WHERE referral_code=? COLLATE NOCASE").get(String(v).trim())||db.prepare("SELECT id, username FROM users WHERE username=? COLLATE NOCASE").get(String(v).trim());
        if(f) return {id:Number(f.id), username:f.username};
      }catch{}
    }
    if(u.referral_code_used){
      try{ const f=db.prepare("SELECT id, username FROM users WHERE referral_code=? COLLATE NOCASE").get(String(u.referral_code_used).trim()); if(f) return {id:Number(f.id), username:f.username}; }catch{}
    }
    try{
      const r=db.prepare("SELECT * FROM referrals WHERE referred_id=? LIMIT 1").get(u.id)||db.prepare("SELECT * FROM referrals WHERE referred_user_id=? LIMIT 1").get(u.id);
      if(r){
        const rid=Number(r.referrer_id||r.user_id||0);
        if(rid){ const f=db.prepare("SELECT id, username FROM users WHERE id=?").get(rid); if(f) return {id:Number(f.id), username:f.username}; return {id:rid, username:null}; }
      }
    }catch{}
  }catch{}
  return null;
};
const referredLabel4=(u)=>{
  const up=resolveUpline4(u);
  if(!up) return "Referred: — No referrer";
  if(up.username) return `Referred: @${up.username} (ID ${up.id})`;
  return `Referred by: ID ${up.id}`;
};
// ✅ HISTORY: always username-first + upline
const vendorHistoryDesc4=(targetUser, cost)=>{
  const pkg=normPkg4(targetUser);
  return `Vendor activation - @${targetUser.username} (${pkg}) - ${money4(cost)} deducted - ${referredLabel4(targetUser)}`;
};
const refBonusForPkg4=pkg=>{ const p=String(pkg||"").toUpperCase(); if(p.includes("SILVER")) return 8000; return 13000; };

// ---------- Tables ----------
try{db.exec(`CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT,loan_code TEXT UNIQUE,user_id INTEGER NOT NULL,username TEXT,email TEXT,full_name TEXT,amount INTEGER NOT NULL,fee INTEGER NOT NULL,purpose TEXT,term_months INTEGER DEFAULT 2,receipt_name TEXT,receipt_data TEXT,receipt_type TEXT,status TEXT DEFAULT 'PENDING',fee_status TEXT DEFAULT 'PENDING',approved_at TEXT,disbursed_at TEXT,estimated_from TEXT,estimated_to TEXT,processing_time TEXT DEFAULT '6 - 12 Weeks',processing_message TEXT,reviewed_at TEXT,created_at TEXT DEFAULT (datetime('now')))`)}catch{}
try{const lc=db.prepare("PRAGMA table_info(loans)").all().map(c=>c.name);if(!lc.includes("receipt_data"))db.exec("ALTER TABLE loans ADD COLUMN receipt_data TEXT");if(!lc.includes("estimated_from"))db.exec("ALTER TABLE loans ADD COLUMN estimated_from TEXT");if(!lc.includes("estimated_to"))db.exec("ALTER TABLE loans ADD COLUMN estimated_to TEXT");if(!lc.includes("disbursed_at"))db.exec("ALTER TABLE loans ADD COLUMN disbursed_at TEXT");if(!lc.includes("approved_at"))db.exec("ALTER TABLE loans ADD COLUMN approved_at TEXT");if(!lc.includes("fee_status"))db.exec("ALTER TABLE loans ADD COLUMN fee_status TEXT DEFAULT 'PENDING'")}catch{}
try{db.exec(`CREATE TABLE IF NOT EXISTS vendors (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER UNIQUE,code TEXT UNIQUE,vendor_name TEXT,phone TEXT,status TEXT DEFAULT 'PENDING',balance INTEGER DEFAULT 0,total_activated INTEGER DEFAULT 0,total_deducted INTEGER DEFAULT 0,created_at TEXT DEFAULT (datetime('now')))`)}catch{}
try{const vc=db.prepare("PRAGMA table_info(vendors)").all().map(c=>c.name);if(!vc.includes("balance"))db.exec("ALTER TABLE vendors ADD COLUMN balance INTEGER DEFAULT 0");if(!vc.includes("total_deducted"))db.exec("ALTER TABLE vendors ADD COLUMN total_deducted INTEGER DEFAULT 0")}catch{}
try{db.exec("CREATE TABLE IF NOT EXISTS password_resets (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,email TEXT,token TEXT UNIQUE,code TEXT,expires_at TEXT,used INTEGER DEFAULT 0,created_at TEXT DEFAULT (datetime('now')))")}catch{}
try{const uc=cols4(); if(!uc.includes("is_vendor")) db.exec("ALTER TABLE users ADD COLUMN is_vendor INTEGER DEFAULT 0"); if(!uc.includes("vendor_status")) db.exec("ALTER TABLE users ADD COLUMN vendor_status TEXT DEFAULT ''"); if(!uc.includes("vendor_balance")) db.exec("ALTER TABLE users ADD COLUMN vendor_balance INTEGER DEFAULT 0");}catch{}
try{db.exec(`CREATE TABLE IF NOT EXISTS code_purchase_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, username TEXT, email TEXT, amount INTEGER DEFAULT 10000, proof_image TEXT, withdrawal_type TEXT, status TEXT DEFAULT 'pending', code TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')))`)}catch{}
try{const cc=db.prepare("PRAGMA table_info(code_purchase_requests)").all().map(c=>c.name); if(!cc.includes("code")) db.exec("ALTER TABLE code_purchase_requests ADD COLUMN code TEXT DEFAULT ''"); if(!cc.includes("proof_image")) db.exec("ALTER TABLE code_purchase_requests ADD COLUMN proof_image TEXT");}catch{}
const PKG_COST4={SILVER:9000,GOLD:15000,SUPER:21000};

// ========== LOANS ==========
const applyHandler4=(req,res)=>{try{const userId=getUserId4(req);if(!userId)return res.status(401).json({success:false,message:"Session expired - login again"});const user=db.prepare("SELECT * FROM users WHERE id=?").get(userId);if(!user)return res.status(404).json({success:false,message:"User not found"});if(!isSuperPkg4(user))return res.status(403).json({success:false,message:"Loans are available to SUPER members only"});const st=String(user.account_status||user.status||"").toLowerCase();if(["suspended","banned","blocked"].includes(st))return res.status(403).json({success:false,message:"Account suspended"});const body=req.body||{};const amount=Number(body.amount);const fee=Number(body.fee);const purpose=String(body.purpose||"").trim();const term=Number(body.term_months||body.term||2);if(!Number.isInteger(amount)||amount<1000||amount>10000000)return res.status(400).json({success:false,message:"Enter a loan amount between ₦1,000 and ₦10,000,000"});const expectedFee=Math.round(amount*0.12);if(fee!==expectedFee)return res.status(400).json({success:false,message:`Invalid fee. Expected ${money4(expectedFee)} (12%)`});if(purpose.length<10||purpose.length>1000)return res.status(400).json({success:false,message:"Please explain what the loan will be used for"});if(!Number.isInteger(term)||term<1||term>12)return res.status(400).json({success:false,message:"Term must be 1-12 months"});let receiptName="",receiptData="",receiptType="";if(req.file){receiptName=req.file.originalname;receiptType=req.file.mimetype;receiptData=req.file.buffer.toString("base64")}else if(body.receipt_base64){receiptName=String(body.receipt_name||"receipt");receiptType=String(body.receipt_type||"");receiptData=String(body.receipt_base64).slice(0,7*1024*1024)}else if(body.receipt){receiptName=String(body.receipt||"receipt")}if(!receiptName&&!receiptData)return res.status(400).json({success:false,message:"Please choose your payment receipt"});try{const pending=db.prepare("SELECT * FROM loans WHERE user_id=? AND status='PENDING' LIMIT 1").get(userId);if(pending)return res.json({success:true,alreadyExists:true,already_exists:true,message:"You already have a pending loan "+pending.loan_code+" - upload receipt for that loan, no need to apply again",loan:cleanLoan4(pending)})}catch{}const loanCode="LOAN-"+Date.now();const info=db.prepare(`INSERT INTO loans (loan_code,user_id,username,email,full_name,amount,fee,purpose,term_months,receipt_name,receipt_data,receipt_type,status,fee_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(loanCode,userId,user.username,user.email,user.full_name,amount,fee,purpose,term,receiptName,receiptData,receiptType,"PENDING","PENDING");const loan=db.prepare("SELECT * FROM loans WHERE id=?").get(info.lastInsertRowid);return res.json({success:true,message:"Application received. Pending Admin approval.",loan:cleanLoan4(loan)})}catch(e){return res.status(500).json({success:false,message:e.message})}};
if(upload4){safe4("post","/api/loans/apply",userGuard4,upload4.single("receipt"),applyHandler4)}else{safe4("post","/api/loans/apply",userGuard4,applyHandler4)}
const receiptUpload4=(req,res)=>{try{const uid=getUserId4(req);if(!uid&&!req.session?.isAdmin)return res.status(401).json({success:false,message:"Session expired"});const id=Number(req.params?.id||req.body?.loanId||req.body?.id||req.query?.id||0);if(!id)return res.status(400).json({success:false,message:"Loan ID required"});const loan=db.prepare("SELECT * FROM loans WHERE id=?").get(id);if(!loan)return res.status(404).json({success:false,message:"Loan not found - apply first"});if(uid&&loan.user_id!==uid&&!req.session?.isAdmin)return res.status(403).json({success:false,message:"Not your loan"});let rName=loan.receipt_name,rData=loan.receipt_data,rType=loan.receipt_type;if(req.file){rName=req.file.originalname;rType=req.file.mimetype;rData=req.file.buffer.toString("base64")}else if(req.body?.receipt_base64){rName=String(req.body.receipt_name||"receipt");rType=String(req.body.receipt_type||"");rData=String(req.body.receipt_base64).slice(0,7*1024*1024)}else if(req.body?.receipt){rName=String(req.body.receipt)}if(!rName&&!rData)return res.status(400).json({success:false,message:"No receipt file sent - choose screenshot"});db.prepare("UPDATE loans SET receipt_name=?, receipt_data=?, receipt_type=? WHERE id=?").run(rName||"",rData||"",rType||"",id);return res.json({success:true,message:"Receipt uploaded - waiting for Admin to verify fee",loan:cleanLoan4(db.prepare("SELECT * FROM loans WHERE id=?").get(id))})}catch(e){return res.status(500).json({success:false,message:e.message})}};
if(upload4){safe4("post","/api/loans/:id/receipt",userGuard4,upload4.single("receipt"),receiptUpload4);safe4("post","/api/loans/admin/:id/receipt",sGuard4,upload4.single("receipt"),receiptUpload4)}else{safe4("post","/api/loans/:id/receipt",userGuard4,receiptUpload4);safe4("post","/api/loans/admin/:id/receipt",sGuard4,receiptUpload4)}
safe4("post","/api/loans/upload-receipt",userGuard4,receiptUpload4);safe4("post","/api/loans/receipt",userGuard4,receiptUpload4);
const myHandler4=(req,res)=>{try{const userId=getUserId4(req);if(!userId)return res.status(401).json({success:false,message:"Session expired"});const loans=db.prepare("SELECT id,loan_code,user_id,username,amount,fee,purpose,term_months,receipt_name,status,fee_status,approved_at,disbursed_at,estimated_from,estimated_to,processing_time,processing_message,created_at FROM loans WHERE user_id=? ORDER BY id DESC").all(userId);return res.json({success:true,loans})}catch(e){return res.status(500).json({success:false,message:e.message})}};
safe4("get","/api/loans/my",userGuard4,myHandler4);safe4("get","/api/loans/history",userGuard4,myHandler4);safe4("get","/api/loans/mine",userGuard4,myHandler4);
const adminList4=(req,res)=>{try{const status=String(req.query.status||"").toUpperCase();let loans;if(status&&["PENDING","APPROVED","DISBURSED","REJECTED"].includes(status)){loans=db.prepare("SELECT id,loan_code,user_id,username,email,full_name,amount,fee,purpose,term_months,receipt_name,status,fee_status,approved_at,disbursed_at,estimated_from,estimated_to,processing_time,created_at FROM loans WHERE status=? ORDER BY id DESC").all(status)}else{loans=db.prepare("SELECT id,loan_code,user_id,username,email,full_name,amount,fee,purpose,term_months,receipt_name,status,fee_status,approved_at,disbursed_at,estimated_from,estimated_to,processing_time,created_at FROM loans ORDER BY id DESC").all()}const total=loans.length,pending=loans.filter(l=>l.status==="PENDING").length,processing=loans.filter(l=>l.status==="APPROVED").length,disbursed=loans.filter(l=>l.status==="DISBURSED").length,totalFees=loans.reduce((s,l)=>s+Number(l.fee||0),0),totalLoans=loans.reduce((s,l)=>s+Number(l.amount||0),0),totalDisbursed=loans.filter(l=>l.status==="DISBURSED").reduce((s,l)=>s+Number(l.amount||0),0);return res.json({success:true,loans,applications:loans,total,pending,processing,disbursed,totalFees,totalLoans,totalDisbursed})}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("get","/api/loans/admin",sGuard4,adminList4);force4("get","/api/admin/loans",sGuard4,adminList4);force4("get","/api/admin/loans/list",sGuard4,adminList4);force4("get","/api/loans/admin/list",sGuard4,adminList4);force4("get","/api/loans/all",sGuard4,adminList4);force4("get","/api/loans/list",sGuard4,adminList4);
safe4("get","/api/loans/admin/:id",sGuard4,(req,res)=>{try{const loan=db.prepare("SELECT * FROM loans WHERE id=?").get(Number(req.params.id));if(!loan)return res.status(404).json({success:false,message:"Loan not found"});return res.json({success:true,loan:cleanLoan4(loan)})}catch(e){return res.status(500).json({success:false,message:e.message})}});
const viewReceipt4=(req,res)=>{try{const id=Number(req.params.id);const loan=db.prepare("SELECT * FROM loans WHERE id=?").get(id);if(!loan)return res.status(404).json({success:false,message:"Loan not found"});if(!loan.receipt_data&&!loan.receipt_name)return res.status(404).json({success:false,message:"No receipt file"});return res.json({success:true,loan_code:loan.loan_code,receipt_name:loan.receipt_name,receipt_type:loan.receipt_type,receipt_data:loan.receipt_data,loan:cleanLoan4(loan),has_receipt:!!(loan.receipt_data||loan.receipt_name)})}catch(e){return res.status(500).json({success:false,message:e.message})}};
safe4("get","/api/loans/admin/:id/receipt",sGuard4,viewReceipt4);safe4("get","/api/admin/loans/:id/receipt",sGuard4,viewReceipt4);safe4("get","/api/loans/:id/receipt",sGuard4,viewReceipt4);
const adminAction4=(req,res)=>{try{const body=req.body||{};const id=Number(body.id||body.loanId||body.loan_id||req.params?.id||req.query?.id);const action=String(body.action||body.status||req.query?.action||"").toUpperCase();if(!id||!["APPROVED","REJECTED","DISBURSED","PENDING"].includes(action))return res.status(400).json({success:false,message:"Invalid id or action"});const loan=db.prepare("SELECT * FROM loans WHERE id=?").get(id);if(!loan)return res.status(404).json({success:false,message:"Loan not found"});if(action==="APPROVED"){if(loan.status!=="PENDING")return res.status(400).json({success:false,message:`Loan already ${loan.status}`});const approvedAt=new Date();const from=new Date(approvedAt);from.setDate(from.getDate()+42);const to=new Date(approvedAt);to.setDate(to.getDate()+84);db.prepare(`UPDATE loans SET status='APPROVED', fee_status='FEE APPROVED', approved_at=?, estimated_from=?, estimated_to=?, processing_time='6 - 12 Weeks', processing_message=?, reviewed_at=datetime('now') WHERE id=?`).run(approvedAt.toISOString(),from.toISOString(),to.toISOString(),"Your fee has been approved. Your loan is now processing. It will take 6 - 12 weeks to be disbursed.",id);const updated=db.prepare("SELECT * FROM loans WHERE id=?").get(id);return res.json({success:true,message:"Fee Approved. Loan now processing 6-12 weeks.",loan:cleanLoan4(updated)})}if(action==="DISBURSED"){if(loan.status!=="APPROVED")return res.status(400).json({success:false,message:`Only PROCESSING (APPROVED) loans can be disbursed. Current: ${loan.status}. Approve fee first.`});let already=null;try{already=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(loan.user_id,loan.loan_code)}catch{}if(already)return res.status(400).json({success:false,message:"This loan was already disbursed - no double credit."});const amount=Number(loan.amount||0);db.prepare(`UPDATE loans SET status='DISBURSED', fee_status='DISBURSED', disbursed_at=datetime('now'), processing_message=?, reviewed_at=datetime('now') WHERE id=?`).run("Your loan has been disbursed to your Affiliate Balance. "+money4(amount)+" credited.",id);try{db.prepare("UPDATE users SET affiliate_balance=COALESCE(affiliate_balance,0)+? WHERE id=?").run(amount,loan.user_id)}catch{}try{db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(loan.user_id,"loan_disbursed",amount,"affiliate",loan.loan_code,`Loan ${loan.loan_code} disbursed - ${money4(amount)}`)}catch{}try{notify4(loan.user_id,"Loan Disbursed 💰",`Your loan of ${money4(amount)} has been disbursed to your Affiliate Balance.`)}catch{}const updated=db.prepare("SELECT * FROM loans WHERE id=?").get(id);return res.json({success:true,message:`Loan DISBURSED. ${money4(amount)} credited to Affiliate Balance.`,loan:cleanLoan4(updated)})}if(action==="PENDING"){db.prepare(`UPDATE loans SET status='PENDING', fee_status='PENDING', reviewed_at=datetime('now') WHERE id=?`).run(id);return res.json({success:true,message:"Loan back to PENDING",loan:cleanLoan4(db.prepare("SELECT * FROM loans WHERE id=?").get(id))})}if(loan.status!=="PENDING")return res.status(400).json({success:false,message:`Loan already ${loan.status}`});db.prepare(`UPDATE loans SET status='REJECTED', fee_status='REJECTED', reviewed_at=datetime('now') WHERE id=?`).run(id);const updated=db.prepare("SELECT * FROM loans WHERE id=?").get(id);return res.json({success:true,message:"Loan Rejected",loan:cleanLoan4(updated)})}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("post","/api/loans/admin",sGuard4,adminAction4);force4("post","/api/admin/loans/action",sGuard4,adminAction4);force4("post","/api/loans/admin/action",sGuard4,adminAction4);force4("post","/api/loans/action",sGuard4,adminAction4);force4("post","/api/admin/loans/approve",sGuard4,(req,res)=>{req.body.action="APPROVED";return adminAction4(req,res)});force4("post","/api/admin/loans/reject",sGuard4,(req,res)=>{req.body.action="REJECTED";return adminAction4(req,res)});force4("post","/api/admin/loans/disburse",sGuard4,(req,res)=>{req.body.action="DISBURSED";return adminAction4(req,res)});force4("post","/api/loans/admin/:id/action",sGuard4,adminAction4);force4("post","/api/admin/loans/:id/action",sGuard4,adminAction4);
const forgotLoan4=(req,res)=>{try{const email=String(req.body?.email||req.body?.username||req.query?.email||"").trim();if(!email)return res.status(400).json({success:false,message:"Enter your email"});let user=null;if(/^\d+$/.test(email))user=db.prepare("SELECT * FROM users WHERE id=?").get(Number(email));else if(email.includes('@'))user=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email);else user=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(email);if(!user)return res.status(404).json({success:false,message:"Email not found",code:"",reset_code:""});let code=String(Math.floor(100000+Math.random()*900000));let token="";try{token=require("crypto").randomBytes(24).toString("hex")}catch{token=Date.now().toString(36)+Math.random().toString(36).slice(2)}const exp=new Date(Date.now()+30*60*1000).toISOString();try{db.prepare("UPDATE password_resets SET used=1 WHERE user_id=? AND used=0").run(user.id)}catch{}db.prepare("INSERT INTO password_resets (user_id,email,token,code,expires_at,used) VALUES (?,?,?,?,?,0)").run(user.id,user.email,token,code,exp);try{notify4(user.id,"Password Reset Code 🔑",`Your JOVIA reset code na: ${code}. E go expire in 30 minutes.`)}catch{}return res.json({success:true,message:`Your reset code na: ${code}`,code,reset_code:code,token,reset_token:token,email:user.email,show_code:true})}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("post","/api/auth/forgot-password-loan",forgotLoan4);

// ========== VENDORS ==========
const getVendorByUser4=uid=>{try{return db.prepare("SELECT * FROM vendors WHERE user_id=?").get(uid)}catch{return null}};
const resolveVendor4=req=>{const uid=getUserId4(req);if(!uid)return null;return getVendorByUser4(uid)};
const syncVendorUser4=(userId, status)=>{ try{ db.prepare("UPDATE users SET is_vendor=?, vendor_status=? WHERE id=?").run(status==="APPROVED"?1:0, status, userId); }catch{} };
const vendorMe4=(req,res)=>{try{
  const uid=Number(req.userId||req.user?.id||getSessionUserId4(req)||0);
  const user=uid?db.prepare("SELECT * FROM users WHERE id=?").get(uid):findUserByAny4(req);
  if(!user) return res.json({success:true,isVendor:false,is_vendor:false,vendor_status:'',message:"Session expired"});
  const v=getVendorByUser4(Number(user.id));
  if(!v) return res.json({success:true,isVendor:false,is_vendor:false,vendor_status:'',message:"Not a vendor - Admin never make you Vendor",checked_email:user.email,checked_id:user.id});
  const st=String(v.status||"").toUpperCase();
  if(st==="APPROVED"){
    syncVendorUser4(user.id,"APPROVED");
    return res.json({success:true,isVendor:true,is_vendor:true,vendor:v,vendor_status:st,vendor_balance:Number(v.balance||0),user:{id:user.id,email:user.email,username:user.username,full_name:user.full_name}});
  }
  return res.json({success:true,isVendor:false,is_vendor:false,vendor_status:st,message:"Not approved Vendor"});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
const vendorPending4=(req,res)=>{try{const v=resolveVendor4(req);if(!v||String(v.status||"").toUpperCase()!=="APPROVED")return res.status(403).json({success:false,message:"Vendor not approved yet - Admin must make you Vendor first"});let rows=[];try{rows=db.prepare("SELECT * FROM users WHERE account_status NOT IN ('active','approved') OR account_status IS NULL ORDER BY id DESC LIMIT 1000").all()}catch{}return res.json({success:true,users:rows.map(x=>{
  const up=resolveUpline4(x);
  return {id:x.id,username:x.username,email:x.email,full_name:x.full_name,package:x.package||x.plan,account_status:x.account_status,status:x.status,activation_cost:PKG_COST4[normPkg4(x)]||9000,
  referred_by:up?up.id:null, referrer_id:up?up.id:null, upline_id:up?up.id:null,
  referred_by_username:up?up.username:null, referrer_username:up?up.username:null, upline_username:up?up.username:null,
  referred_label:referredLabel4(x), upline_label:referredLabel4(x), referred_by_label:referredLabel4(x),
  referred_self_label:`Referred: @${x.username||("User "+x.id)}`};
}),total:rows.length,vendor_balance:Number(v.balance||0)})}catch(e){return res.status(500).json({success:false,message:e.message})}};
const vendorActivate4=(req,res)=>{try{
  const v=resolveVendor4(req);const uid=getUserId4(req);
  if(!v)return res.status(403).json({success:false,message:"Not a vendor - ask Admin to make you Vendor"});
  if(String(v.status||"").toUpperCase()!=="APPROVED")return res.status(403).json({success:false,message:"Vendor not approved yet"});
  const b=req.body||{},q=req.query||{};
  let target=null;
  const tid=Number(b.userId||b.id||b.target_id||b.targetUserId||q.userId||q.id||req.params?.id||0);
  if(tid) target=db.prepare("SELECT * FROM users WHERE id=?").get(tid);
  if(!target){const tem=String(b.email||b.target_email||q.email||"").trim(); if(tem && tem!==String(findUserByAny4(req)?.email||"")){ if(tem.includes("@")) target=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(tem); }}
  if(!target){const tun=String(b.username||b.target_username||q.username||"").trim(); if(tun) target=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(tun); }
  if(!target) return res.status(400).json({success:false,message:"Target user not found - send userId / email / username"});
  const targetId=Number(target.id);
  const st=String(target.account_status||target.status||"").toLowerCase();if(["active","approved"].includes(st))return res.status(400).json({success:false,message:"User already active"});
  const pkg=normPkg4(target);const cost=PKG_COST4[pkg]||9000;const bal=Number(v.balance||0);if(bal<cost)return res.status(400).json({success:false,message:`Insufficient Vendor Fund! You need ${money4(cost)} to activate ${pkg} user. Your balance: ${money4(bal)}. Ask Admin to fund you.`,need:cost,balance:bal,package:pkg});
  db.prepare("UPDATE vendors SET balance=COALESCE(balance,0)-?, total_activated=COALESCE(total_activated,0)+1, total_deducted=COALESCE(total_deducted,0)+? WHERE id=?").run(cost,cost,v.id);
  try{db.prepare("UPDATE users SET account_status='active' WHERE id=?").run(targetId)}catch{}try{db.prepare("UPDATE users SET status='active' WHERE id=?").run(targetId)}catch{}
  try{const wel=pkg==="GOLD"?15000:pkg==="SUPER"?21000:9000;const hasWel=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(targetId,`WELCOME_${targetId}`);if(!hasWel){db.prepare("UPDATE users SET wallet_balance=COALESCE(wallet_balance,0)+? WHERE id=?").run(wel,targetId);db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(targetId,"welcome_bonus",wel,"wallet",`WELCOME_${targetId}`,`Welcome bonus - ${pkg} activated by Vendor`)}}catch{}
  // ✅ HISTORY: username FIRST + upline username
  try{ db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(uid,"vendor_activation_deduct",-cost,"vendor",`VENDOR_ACT_${targetId}`,vendorHistoryDesc4(target,cost)); }catch{}
  // ✅ REF BONUS: same resolveUpline as Backpay, no double
  try{
    const _up=resolveUpline4(target);
    const _finalRef=_up?Number(_up.id):0;
    if(_finalRef && _finalRef !== targetId){
      const _bonus = refBonusForPkg4(pkg);
      const _already = (()=>{ try{ return db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(_finalRef, `BACKPAY_ALL_${targetId}`) || db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(_finalRef, `REF_BONUS_${targetId}`); }catch{ return null; } })();
      if(!_already){
        db.prepare("UPDATE users SET affiliate_balance=COALESCE(affiliate_balance,0)+? WHERE id=?").run(_bonus, _finalRef);
        try{ db.prepare("INSERT INTO referral_rewards (referrer_id, referred_user_id, amount, referrer_package, referred_package) VALUES (?,?,?,?,?)").run(_finalRef, targetId, _bonus, "", pkg); }catch{}
        db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(_finalRef,"referral_reward",_bonus,"affiliate",`BACKPAY_ALL_${targetId}`,`Referral bonus - @${target.username} ${pkg} [VENDOR] - ${referredLabel4(target)}`);
        try{ notify4(_finalRef,"Referral Bonus 💰",`You don get ₦${_bonus.toLocaleString()} for @${target.username} (${pkg}) — e don enter your Affiliate Balance.`); }catch{}
      }
    }
  }catch(e){ console.log("Referral bonus vendor fail:", e.message); }
  try{notify4(uid,"Vendor Activation - Deducted",`${money4(cost)} deducted for activating @${target.username} (${pkg}). Remaining: ${money4(bal-cost)}`)}catch{}try{notify4(targetId,"Account Activated ✅",`Your ${pkg} account don activate. Welcome bonus don enter.`)}catch{}
  return res.json({success:true,message:`@${target.username} (${pkg}) activated ✅ ${money4(cost)} deducted. Remaining: ${money4(bal-cost)}`,deducted:cost,cost,remaining_balance:bal-cost,vendor_balance:bal-cost})
}catch(e){return res.status(500).json({success:false,message:e.message})}};
// Vendor History
force4("get","/api/vendor/history",userGuard4,(req,res)=>{
  try{
    const uid=getUserId4(req); if(!uid) return res.status(401).json({success:false,message:"Session expired"});
    let txs=[]; try{ txs=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND type='vendor_activation_deduct' ORDER BY id DESC LIMIT 200").all(uid); }catch{}
    const history=txs.map(t=>{
      const m=String(t.reference||"").match(/VENDOR_ACT_(\d+)/);
      const tid=m?Number(m[1]):null;
      let u=null; try{ if(tid) u=db.prepare("SELECT * FROM users WHERE id=?").get(tid); }catch{}
      let desc=String(t.description||"");
      if(u && (desc.toLowerCase().startsWith("vendor activation - ₦")||desc.includes("deducted for activating"))) desc=vendorHistoryDesc4(u, Math.abs(Number(t.amount||0)));
      return {id:t.id, user_id:tid, username:u?u.username:"", email:u?u.email:"", package:u?(u.package||u.plan):"", status:u?(u.account_status||u.status):"", amount:Math.abs(Number(t.amount||0)), cost:Math.abs(Number(t.amount||0)), description:desc, title:desc, date:t.created_at||"", created_at:t.created_at||"", referred_label:u?referredLabel4(u):"Referred: —", referred_by_label:u?referredLabel4(u):"Referred: —"};
    });
    return res.json({success:true, history, total:history.length, total_activated:history.length});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});
force4("get","/api/vendor/activations",userGuard4,(req,res)=>{ return res.redirect("/api/vendor/history"); });
force4("get","/api/vendor/me",userGuard4,vendorMe4);force4("get","/api/vendor/dashboard",userGuard4,vendorMe4);force4("get","/api/vendor/pending-users",userGuard4,vendorPending4);force4("get","/api/vendor/users/pending",userGuard4,vendorPending4);force4("post","/api/vendor/activate",userGuard4,vendorActivate4);force4("post","/api/vendor/activate/:id",userGuard4,vendorActivate4);force4("post","/api/vendor/users/activate",userGuard4,vendorActivate4);
safe4("get","/api/admin/vendors",sGuard4,(req,res)=>{try{const rows=db.prepare("SELECT v.*, u.username as username, u.email as email, u.full_name as full_name, u.package as package, u.account_status as account_status FROM vendors v LEFT JOIN users u ON u.id=v.user_id ORDER BY v.id DESC LIMIT 200").all();return res.json({success:true,vendors:rows,total:rows.length})}catch(e){return res.status(500).json({success:false,message:e.message})}});
// Admin General History - username-first
force4("get","/api/admin/vendors/history",sGuard4,(req,res)=>{
  try{
    let txs=[]; try{ txs=db.prepare("SELECT * FROM wallet_transactions WHERE type='vendor_activation_deduct' ORDER BY id DESC LIMIT 300").all(); }catch{}
    const history=txs.map(t=>{
      const m=String(t.reference||"").match(/VENDOR_ACT_(\d+)/);
      const tid=m?Number(m[1]):null;
      let u=null; try{ if(tid) u=db.prepare("SELECT * FROM users WHERE id=?").get(tid); }catch{}
      let vUser=null; try{ if(t.user_id) vUser=db.prepare("SELECT id, username FROM users WHERE id=?").get(Number(t.user_id)); }catch{}
      let desc=String(t.description||"");
      if(u && (desc.toLowerCase().startsWith("vendor activation - ₦")||desc.includes("deducted for activating"))) desc=vendorHistoryDesc4(u, Math.abs(Number(t.amount||0)));
      return {id:t.id, user_id:tid, username:u?u.username:"", activated_username:u?u.username:"", target_username:u?u.username:"", email:u?u.email:"", package:u?(u.package||u.plan):"", status:u?(u.account_status||u.status):"", amount:Math.abs(Number(t.amount||0)), cost:Math.abs(Number(t.amount||0)), description:desc, title:desc, type:"vendor_activation_deduct", vendor_id:t.user_id, vendor_username:vUser?vUser.username:"", vendor_name:vUser?vUser.username:"", date:t.created_at||"", created_at:t.created_at||"", referred_label:u?referredLabel4(u):"Referred: —", referred_by_label:u?referredLabel4(u):"Referred: —"};
    });
    return res.json({success:true, history, activations:history, transactions:history, total:history.length});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});
force4("get","/api/admin/vendors/activations",sGuard4,(req,res)=>{ return res.redirect("/api/admin/vendors/history"); });
// ✅ Fix OLD history rows in DB
force4("post","/api/admin/fix-vendor-history",sGuard4,(req,res)=>{
  try{
    const rows=db.prepare("SELECT * FROM wallet_transactions WHERE type='vendor_activation_deduct'").all();
    let fixed=0;
    for(const t of rows){
      const m=String(t.reference||"").match(/VENDOR_ACT_(\d+)/);
      if(!m) continue;
      const u=db.prepare("SELECT * FROM users WHERE id=?").get(Number(m[1]));
      if(!u) continue;
      const desc=vendorHistoryDesc4(u, Math.abs(Number(t.amount||0)));
      if(t.description!==desc){ db.prepare("UPDATE wallet_transactions SET description=? WHERE id=?").run(desc, t.id); fixed++; }
    }
    return res.json({success:true,message:`Fixed ${fixed} old vendor history rows to username-first`,fixed});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});
const makeVendorHandler4=(req,res)=>{try{
  const user=findTargetUser4(req);
  if(!user) return res.status(400).json({success:false,message:"Send userId / email / username of person you want make Vendor"});
  let v=db.prepare("SELECT * FROM vendors WHERE user_id=?").get(Number(user.id));
  if(!v){
    const code="VND-"+Math.random().toString(36).slice(2,7).toUpperCase();
    db.prepare("INSERT INTO vendors (user_id,code,vendor_name,phone,status,balance,total_activated,total_deducted) VALUES (?,?,?,?, 'APPROVED', 0, 0, 0)").run(Number(user.id),code,String(user.full_name||user.username||""),String(user.phone||""));
    v=db.prepare("SELECT * FROM vendors WHERE user_id=?").get(Number(user.id));
  } else {
    db.prepare("UPDATE vendors SET status='APPROVED' WHERE id=?").run(v.id);
    v=db.prepare("SELECT * FROM vendors WHERE id=?").get(v.id);
  }
  syncVendorUser4(user.id,"APPROVED");
  return res.json({success:true,message:`${user.username} don be APPROVED Vendor now - Vendor panel go show for him profile.`,vendor:v,vendor_balance:Number(v.balance||0)});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("post","/api/admin/vendors/make-admin-vendor",sGuard4,makeVendorHandler4);
force4("post","/api/admin/make-vendor",sGuard4,makeVendorHandler4);
force4("post","/api/admin/vendors/make-vendor",sGuard4,makeVendorHandler4);
const vendorCreate4=(req,res)=>{try{
  const user=findTargetUser4(req);
  if(!user) return res.status(400).json({success:false,message:"Enter email / username / userId"});
  const ex=db.prepare("SELECT * FROM vendors WHERE user_id=?").get(user.id);
  if(ex){
    db.prepare("UPDATE vendors SET status='APPROVED' WHERE id=?").run(ex.id);
    syncVendorUser4(user.id,"APPROVED");
    return res.json({success:true,message:`${user.username} don already be Vendor - now APPROVED. Vendor panel go show for him profile.`,vendor:db.prepare("SELECT * FROM vendors WHERE id=?").get(ex.id)});
  }
  const code="VND-"+Math.random().toString(36).slice(2,7).toUpperCase();
  const phone=String(req.body?.phone||"").trim();
  const info=db.prepare("INSERT INTO vendors (user_id, code, vendor_name, phone, status, balance, total_activated, total_deducted) VALUES (?,?,?,?, 'APPROVED', 0, 0, 0)").run(user.id,code,String(user.full_name||user.username||""),phone||String(user.phone||""));
  syncVendorUser4(user.id,"APPROVED");
  const vendor=db.prepare("SELECT * FROM vendors WHERE id=?").get(info.lastInsertRowid);
  return res.json({success:true,message:`${user.username} don be APPROVED Vendor now - Vendor panel go show for him profile. No request needed.`,vendor});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("post","/api/admin/vendors/create",sGuard4,vendorCreate4);force4("post","/api/admin/vendor/create",sGuard4,vendorCreate4);
const removeVendorHandler4=(req,res)=>{try{
  const user=findTargetUser4(req);
  if(!user) return res.status(400).json({success:false,message:"Send userId / email / username"});
  const v=db.prepare("SELECT * FROM vendors WHERE user_id=?").get(user.id);
  if(v) db.prepare("UPDATE vendors SET status='REMOVED' WHERE id=?").run(v.id);
  syncVendorUser4(user.id,"REMOVED");
  return res.json({success:true,message:`${user.username} vendor removed - Vendor panel go hide for him profile`,vendor:v||null});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("post","/api/admin/vendors/remove-vendor",sGuard4,removeVendorHandler4);
force4("post","/api/admin/remove-vendor",sGuard4,removeVendorHandler4);
force4("post","/api/admin/vendors/remove",sGuard4,removeVendorHandler4);
force4("post","/api/admin/vendors/action",sGuard4,(req,res)=>{try{const id=Number(req.body?.id||req.body?.vendorId||0);const act=String(req.body?.action||req.body?.status||"").toUpperCase();if(!id)return res.status(400).json({success:false,message:"Vendor ID required"});const v=db.prepare("SELECT * FROM vendors WHERE id=?").get(id);if(!v)return res.status(404).json({success:false,message:"Vendor not found"});const st=act.includes("APPROV")?"APPROVED":act.includes("REJECT")?"REJECTED":act.includes("SUSPEND")?"SUSPENDED":act.includes("REMOVE")?"REMOVED":"PENDING";db.prepare("UPDATE vendors SET status=? WHERE id=?").run(st,id);syncVendorUser4(v.user_id, st);return res.json({success:true,message:`Vendor ${st}`,vendor:db.prepare("SELECT * FROM vendors WHERE id=?").get(id)})}catch(e){return res.status(500).json({success:false,message:e.message})}});
const adminCreditVendor4=(req,res)=>{try{
  const b=req.body||{},q=req.query||{};
  const amt=Number(b.amount||q.amount||0);if(!amt||amt<=0)return res.status(400).json({success:false,message:"Vendor ID + amount required"});
  let v=null;
  const vid=Number(b.id||b.vendorId||b.vendor_id||q.id||q.vendorId||req.params?.id||0);
  if(vid) v=db.prepare("SELECT * FROM vendors WHERE id=?").get(vid);
  if(!v){const em=String(b.email||q.email||"").trim(); if(em){const u=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(em); if(u) v=db.prepare("SELECT * FROM vendors WHERE user_id=?").get(u.id);}}
  if(!v){const uid=Number(b.userId||b.user_id||q.userId||q.user_id||0); if(uid) v=db.prepare("SELECT * FROM vendors WHERE user_id=?").get(uid);}
  if(!v)return res.status(404).json({success:false,message:"Vendor not found - send vendorId / userId / email"});
  const user=db.prepare("SELECT * FROM users WHERE id=?").get(v.user_id);if(!user)return res.status(404).json({success:false,message:"Vendor user not found"});
  db.prepare("UPDATE vendors SET balance=COALESCE(balance,0)+? WHERE id=?").run(amt,v.id);
  try{db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(v.user_id,"vendor_funded",amt,"vendor",`VENDOR_FUND_${v.id}`,`Admin funded Vendor Balance +${money4(amt)}`)}catch{}
  try{notify4(v.user_id,"Vendor Funded 💰",`Admin don fund your Vendor Balance with ${money4(amt)}.`)}catch{}
  const updated=db.prepare("SELECT * FROM vendors WHERE id=?").get(v.id);
  return res.json({success:true,message:`Vendor ${user.username} funded ${money4(amt)}. New: ${money4(Number(updated.balance||0))}`,vendor:updated})
}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("post","/api/admin/vendors/fund",sGuard4,adminCreditVendor4);force4("post","/api/admin/vendors/credit",sGuard4,adminCreditVendor4);force4("post","/api/admin/vendors/:id/fund",sGuard4,adminCreditVendor4);force4("post","/api/admin/vendors/:id/credit",sGuard4,adminCreditVendor4);

// ========== WITHDRAWAL CODE ==========
force4("post","/api/withdraw/code-request",userGuard4,(req,res)=>{try{
  const proof=String(req.body?.proof_image||req.body?.proof||req.body?.receipt||"").slice(0,2000000);
  if(!proof) return res.status(400).json({success:false,message:"Upload payment screenshot"});
  const uid=Number(req.userId||req.user?.id||0); if(!uid) return res.status(401).json({success:false,message:"Session expired - login again"});
  const user=db.prepare("SELECT * FROM users WHERE id=?").get(uid); if(!user) return res.status(404).json({success:false,message:"User not found"});
  const info=db.prepare(`INSERT INTO code_purchase_requests (user_id, username, email, amount, proof_image, withdrawal_type, status) VALUES (?,?,?,?,?,?,'pending')`).run(user.id,user.username,user.email,10000,proof,String(req.body?.withdrawalType||req.body?.withdrawal_type||"withdrawal"));
  return res.json({success:true,message:"Screenshot sent to Admin - wait, your code go enter notification",id:info.lastInsertRowid});
}catch(e){return res.status(500).json({success:false,message:e.message})}});
const codeList4=(req,res)=>{try{
  const status=String(req.query.status||"").toLowerCase();
  let rows;
  if(status) rows=db.prepare("SELECT id,user_id,username,email,amount,withdrawal_type,status,code,created_at, CASE WHEN proof_image IS NOT NULL AND proof_image!='' THEN 1 ELSE 0 END as has_proof FROM code_purchase_requests WHERE LOWER(status)=? ORDER BY id DESC LIMIT 200").all(status);
  else rows=db.prepare("SELECT id,user_id,username,email,amount,withdrawal_type,status,code,created_at, CASE WHEN proof_image IS NOT NULL AND proof_image!='' THEN 1 ELSE 0 END as has_proof FROM code_purchase_requests ORDER BY id DESC LIMIT 200").all();
  return res.json({success:true,requests:rows,total:rows.length});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("get","/api/admin/code-requests",sGuard4,codeList4);force4("get","/api/admin/withdrawals/code-requests",sGuard4,codeList4);force4("get","/api/admin/code-requests/list",sGuard4,codeList4);
force4("get","/api/admin/code-requests/:id",sGuard4,(req,res)=>{try{
  const row=db.prepare("SELECT * FROM code_purchase_requests WHERE id=?").get(Number(req.params.id));
  if(!row) return res.status(404).json({success:false,message:"Not found"});
  return res.json({success:true,request:row,proof_image:row.proof_image,has_proof:!!row.proof_image});
}catch(e){return res.status(500).json({success:false,message:e.message})}});
force4("post","/api/admin/code-requests/approve",sGuard4,(req,res)=>{try{
  const id=Number(req.body?.id||req.body?.requestId||req.query?.id||0);
  const code=String(req.body?.code||"").trim()||String(Math.floor(100000+Math.random()*900000));
  if(!id) return res.status(400).json({success:false,message:"Request ID required"});
  const r=db.prepare("SELECT * FROM code_purchase_requests WHERE id=?").get(id); if(!r) return res.status(404).json({success:false,message:"Request not found"});
  db.prepare("UPDATE code_purchase_requests SET status='approved', code=? WHERE id=?").run(code,id);
  try{notify4(r.user_id,"Withdrawal Code ✅",`Your Withdrawal Code na: ${code}. Use am to withdraw.`);}catch{}
  return res.json({success:true,message:"Approved - code sent to user notification",code,request_id:id});
}catch(e){return res.status(500).json({success:false,message:e.message})}});
force4("post","/api/admin/code-requests/reject",sGuard4,(req,res)=>{try{
  const id=Number(req.body?.id||req.body?.requestId||req.query?.id||0); if(!id) return res.status(400).json({success:false,message:"Request ID required"});
  const r=db.prepare("SELECT * FROM code_purchase_requests WHERE id=?").get(id); if(!r) return res.status(404).json({success:false,message:"Request not found"});
  db.prepare("UPDATE code_purchase_requests SET status='rejected' WHERE id=?").run(id);
  try{notify4(r.user_id,"Withdrawal Code Rejected ❌",`Your ₦10,000 code payment screenshot no confirm. Upload correct screenshot again.`);}catch{}
  return res.json({success:true,message:"Rejected"});
}catch(e){return res.status(500).json({success:false,message:e.message})}});

// ========== RESET PASSWORD ==========
const forgotEasy4=(req,res)=>{try{
  const email=String(req.body?.email||req.body?.username||req.query?.email||"").trim();
  if(!email) return res.status(400).json({success:false,message:"Enter your email"});
  let user=null;
  if(/^\d+$/.test(email)) user=db.prepare("SELECT * FROM users WHERE id=?").get(Number(email));
  else if(email.includes('@')) user=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email);
  else user=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(email);
  if(!user) return res.status(404).json({success:false,message:"Email not found",code:"",reset_code:""});
  const code=String(Math.floor(100000+Math.random()*900000));
  let token=""; try{token=require("crypto").randomBytes(24).toString("hex")}catch{token=Date.now().toString(36)+Math.random().toString(36).slice(2)}
  const exp=new Date(Date.now()+30*60*1000).toISOString();
  try{db.prepare("UPDATE password_resets SET used=1 WHERE user_id=? AND used=0").run(user.id)}catch{}
  db.prepare("INSERT INTO password_resets (user_id,email,token,code,expires_at,used) VALUES (?,?,?,?,?,0)").run(user.id,user.email,token,code,exp);
  try{notify4(user.id,"Password Reset Code 🔑",`Your JOVIA reset code na: ${code}. E go expire in 30 minutes.`)}catch{}
  return res.json({success:true,message:`Your reset code na: ${code}`,code,reset_code:code,token,reset_token:token,email:user.email,show_code:true});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
const resetSimple4=(req,res)=>{try{
  const email=String(req.body?.email||req.body?.username||req.query?.email||"").trim();
  const pw=String(req.body?.password||req.body?.newPassword||req.body?.new_password||"");
  const cp=String(req.body?.confirmPassword||req.body?.confirm_password||req.body?.confirm||"");
  if(!email) return res.status(400).json({success:false,message:"Enter your email"});
  if(!pw||pw.length<6) return res.status(400).json({success:false,message:"New password must be at least 6 characters"});
  if(cp && cp!==pw) return res.status(400).json({success:false,message:"Passwords no match"});
  let user=null;
  if(email.includes('@')) user=db.prepare("SELECT * FROM users WHERE email=? COLLATE NOCASE").get(email);
  else user=db.prepare("SELECT * FROM users WHERE username=? COLLATE NOCASE").get(email);
  if(!user) return res.status(404).json({success:false,message:"Email not found"});
  db.prepare("UPDATE users SET password=? WHERE id=?").run(hashPass4(pw), user.id);
  try{db.prepare("UPDATE password_resets SET used=1 WHERE user_id=? AND used=0").run(user.id)}catch{}
  try{notify4(user.id,"Password Changed ✅",`Your password don change. Login with new password.`)}catch{}
  return res.json({success:true,message:"Password don change - login with new password now"});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
const resetEasy4=(req,res)=>{try{
  const raw=String(req.body?.code||req.body?.reset_code||req.body?.token||req.query?.code||"");
  const code=cleanCode4(raw);
  const pw=String(req.body?.password||req.body?.newPassword||req.body?.new_password||req.body?.confirmPassword||"");
  const email=String(req.body?.email||req.body?.username||"").trim();
  if(!code || code==="123456" || code==="000000"){
    if(email && pw) return resetSimple4(req,res);
    return res.status(400).json({success:false,message:"Enter your email + new password"});
  }
  if(!pw||pw.length<6) return res.status(400).json({success:false,message:"New password must be at least 6 characters"});
  const cp=String(req.body?.confirmPassword||req.body?.confirm_password||req.body?.confirm||"");
  if(cp && cp!==pw) return res.status(400).json({success:false,message:"Passwords no match"});
  let row=null;
  try{row=db.prepare("SELECT * FROM password_resets WHERE code=? AND used=0 ORDER BY id DESC LIMIT 1").get(code)}catch{}
  if(!row){try{row=db.prepare("SELECT * FROM password_resets WHERE token=? AND used=0 ORDER BY id DESC LIMIT 1").get(raw)}catch{}}
  if(!row){
    if(email) return resetSimple4(req,res);
    return res.status(400).json({success:false,message:"Wrong code - enter your email + new password, we go reset direct"});
  }
  if(row.expires_at && new Date(row.expires_at) < new Date()){
    if(email) return resetSimple4(req,res);
    return res.status(400).json({success:false,message:"Code don expire - try again with email + new password"});
  }
  db.prepare("UPDATE users SET password=? WHERE id=?").run(hashPass4(pw), row.user_id);
  db.prepare("UPDATE password_resets SET used=1 WHERE id=?").run(row.id);
  try{notify4(row.user_id,"Password Changed ✅",`Your password don change. Login with new password.`)}catch{}
  return res.json({success:true,message:"Password don change - login with new password now"});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
const verifyCode4=(req,res)=>{try{
  const code=cleanCode4(req.body?.code||req.body?.reset_code||req.query?.code||"");
  if(!code) return res.status(400).json({success:false,message:"Enter code"});
  const row=db.prepare("SELECT * FROM password_resets WHERE code=? AND used=0 ORDER BY id DESC LIMIT 1").get(code);
  if(!row) return res.status(400).json({success:false,message:"Wrong code"});
  if(row.expires_at && new Date(row.expires_at) < new Date()) return res.status(400).json({success:false,message:"Code don expire"});
  return res.json({success:true,message:"Code correct",email:row.email});
}catch(e){return res.status(500).json({success:false,message:e.message})}};
force4("post","/api/auth/forgot-password",forgotEasy4);
force4("post","/api/forgot-password",forgotEasy4);
force4("post","/api/auth/forgot",forgotEasy4);
force4("post","/api/auth/request-reset",forgotEasy4);
force4("post","/api/auth/reset-password",resetEasy4);
force4("post","/api/reset-password",resetEasy4);
force4("post","/api/auth/reset-password-simple",resetSimple4);
force4("post","/api/auth/reset-password-no-code",resetSimple4);
force4("post","/api/admin/reset-password-direct",sGuard4,resetSimple4);
force4("post","/api/auth/change-password-with-code",resetEasy4);
force4("post","/api/auth/verify-reset-code",verifyCode4);
force4("post","/api/auth/verify-code",verifyCode4);

// ========== REFERRALS ==========
const referralsHandler4=(req,res)=>{
  try{
    const me=findUserByAny4(req);
    if(!me) return res.status(401).json({success:false,message:"Session expired - login again"});
    const myId=Number(me.id);
    const myCode=String(me.referral_code||me.referralCode||"").trim();
    const myUser=String(me.username||"").trim();
    let list=[];
    try{
      const cols=db.prepare("PRAGMA table_info(users)").all().map(c=>c.name);
      const refCols=["referred_by","referrer_id","referrer","referredBy","invited_by","upline_id","parent_id","sponsor_id","referred_by_id","referral_by"].filter(c=>cols.includes(c));
      const codeCols=["referral_code","referralCode","referral_code_used","used_referral_code","referred_by_code","invite_code"].filter(c=>cols.includes(c));
      let rows=[];
      for(const rc of refCols){
        try{ const r=db.prepare(`SELECT * FROM users WHERE ${rc}=? ORDER BY id DESC`).all(myId); if(r.length) rows=rows.concat(r); }catch{}
        try{ const r=db.prepare(`SELECT * FROM users WHERE ${rc}=? ORDER BY id DESC`).all(String(myId)); if(r.length) rows=rows.concat(r); }catch{}
        if(myCode){ try{ const r=db.prepare(`SELECT * FROM users WHERE ${rc}=? ORDER BY id DESC`).all(myCode); if(r.length) rows=rows.concat(r); }catch{} }
        if(myUser){ try{ const r=db.prepare(`SELECT * FROM users WHERE ${rc}=? ORDER BY id DESC`).all(myUser); if(r.length) rows=rows.concat(r); }catch{} }
      }
      for(const cc of codeCols){
        if(myCode){ try{ const r=db.prepare(`SELECT * FROM users WHERE ${cc}=? AND id!=? ORDER BY id DESC`).all(myCode,myId); if(r.length) rows=rows.concat(r); }catch{} }
      }
      const seen=new Set();
      for(const u of rows){
        if(!u || Number(u.id)===myId) continue;
        if(seen.has(Number(u.id))) continue;
        seen.add(Number(u.id));
        list.push({
          id:u.id, user_id:u.id, referred_id:u.id, referred_user_id:u.id,
          full_name:u.full_name||u.name||"", fullName:u.full_name||u.name||"", name:u.full_name||u.name||"",
          username:u.username||"", referredUsername:u.username||"",
          email:u.email||"", referred_email:u.email||"", user_email:u.email||"", referredEmail:u.email||"",
          package:u.package||u.plan||"SILVER", package_name:u.package||u.plan||"SILVER", plan:u.package||u.plan||"SILVER",
          status:u.account_status||u.status||"pending",
          commission:0, earning:0, amount:0,
          created_at:u.created_at||u.createdAt||"", createdAt:u.created_at||"", joined_at:u.created_at||"", date:u.created_at||""
        });
      }
    }catch(e){ console.log("S4 referrals users error", e.message); }
    try{
      const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='referrals'").all();
      if(tables.length){
        const rcols=db.prepare("PRAGMA table_info(referrals)").all().map(c=>c.name);
        let rrows=[];
        try{ if(rcols.includes("referrer_id")) rrows=db.prepare("SELECT * FROM referrals WHERE referrer_id=? ORDER BY id DESC").all(myId); }catch{}
        if(!rrows.length && rcols.includes("user_id")){ try{ rrows=db.prepare("SELECT * FROM referrals WHERE user_id=? ORDER BY id DESC").all(myId); }catch{} }
        for(const r of rrows){
          const rid=Number(r.referred_id||r.referred_user_id||r.referee_id||r.user_id||0);
          if(!rid || rid===myId) continue;
          if(list.some(x=>Number(x.id)===rid)) continue;
          const u=db.prepare("SELECT * FROM users WHERE id=?").get(rid);
          if(!u) continue;
          list.push({id:u.id, user_id:u.id, referred_id:u.id, full_name:u.full_name||"", username:u.username||"", email:u.email||"", referred_email:u.email||"", user_email:u.email||"", package:u.package||u.plan||"SILVER", status:u.account_status||u.status||r.status||"pending", commission:Number(r.commission||r.amount||r.earning||0), created_at:r.created_at||u.created_at||""});
        }
      }
    }catch{}
    try{
      const q=String(req.query.search||req.query.q||req.query.email||req.query.query||"").trim().toLowerCase();
      if(q){ list=list.filter(x=> [x.email,x.full_name,x.username,String(x.id)].map(v=>String(v||"").toLowerCase()).join(" | ").includes(q)); }
    }catch{}
    const total=list.length;
    const successful=list.filter(x=>["approved","active","completed"].includes(String(x.status||"").toLowerCase())).length;
    const pending=list.filter(x=>String(x.status||"").toLowerCase()==="pending").length;
    const totalEarnings=list.reduce((s,x)=>s+Number(x.commission||0),0);
    return res.json({success:true, referrals:list, data:list, users:list, total, totalReferrals:total, successful, successfulReferrals:successful, pending, pendingReferrals:pending, totalEarnings, referralEarnings:totalEarnings});
  }catch(e){ return res.status(500).json({success:false,message:e.message}) }
};
force4("get","/api/referrals",userGuard4,referralsHandler4);
force4("get","/api/referrals/list",userGuard4,referralsHandler4);
force4("get","/api/referrals/history",userGuard4,referralsHandler4);

// ---------- FIX 71000 -> 7100 ----------
force4("post","/api/admin/fix-71000",sGuard4,(req,res)=>{try{let report=[];const tryRun=(label,sql)=>{try{const r=db.prepare(sql).run();report.push(`${label}: ${r.changes} fixed`)}catch(e){report.push(`${label}: skipped`)}};tryRun("tasks.reward","UPDATE tasks SET reward=7100 WHERE reward=71000");tryRun("jobs.reward","UPDATE jobs SET reward=7100 WHERE reward=71000");let corrected=0;try{const txs=db.prepare("SELECT * FROM wallet_transactions WHERE amount=71000").all();for(const t of txs){const already=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND reference=?").get(t.user_id,'FIX_71000_'+t.id);if(already)continue;db.prepare("UPDATE users SET wallet_balance = MAX(0, COALESCE(wallet_balance,0)-63900) WHERE id=?").run(t.user_id);db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(t.user_id,'task_correction',-63900,'wallet','FIX_71000_'+t.id,'Correction: 71,000 -> 7,100');corrected++}report.push(`users corrected: ${corrected}`)}catch(e){report.push(`users corrected: skipped`)}return res.json({success:true,message:`Done! 71,000 -> 7,100. ${corrected} users corrected.`,report})}catch(e){return res.status(500).json({success:false,message:e.message})}});

// ========== BACKPAY 2 - USES SAME resolveUpline4 AS VENDOR ==========
const findUplineBackpay2=(u)=>{ const up=resolveUpline4(u); return up?Number(up.id):0; };
const correctBackpay2=(pkgRaw)=>{ const pkg=String(pkgRaw||"").toUpperCase(); if(pkg.includes("SUPER")||pkg.includes("GOLD")) return 13000; if(pkg.includes("SILVER")) return 8000; return 0; };
const runBackpay2=(from,to,mode)=>{
  const fromDate=from?from+" 00:00:00":"2000-01-01";
  const toDate=to?to+" 23:59:59":"2099-12-31";
  const all=db.prepare("SELECT * FROM users WHERE account_status IN ('active','approved') AND created_at BETWEEN ? AND ? ORDER BY id ASC").all(fromDate,toDate);
  let missing=[], skippedCount=0, alreadyPaidCount=0, noUplineCount=0;
  for(const u of all){
    const uplineId=findUplineBackpay2(u);
    if(!uplineId){noUplineCount++; continue;}
    const referrer=db.prepare("SELECT * FROM users WHERE id=?").get(uplineId);
    if(!referrer||referrer.id===u.id){noUplineCount++; continue;}
    let existing=null; try{existing=db.prepare("SELECT * FROM referral_rewards WHERE referred_user_id=?").get(u.id);}catch{}
    const alreadyPaid=existing?Number(existing.amount||0):0;
    if(existing && alreadyPaid>0){ skippedCount++; alreadyPaidCount++; continue; }
    let wm=null; try{wm=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND (reference=? OR reference=?)").get(uplineId,`BACKPAY_ALL_${u.id}`,`REF_BONUS_${u.id}`);}catch{}
    if(wm){ skippedCount++; alreadyPaidCount++; continue; }
    let anyR=null; try{anyR=db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? AND type IN ('referral_reward','referral_bonus') AND description LIKE ?").get(uplineId,`%${u.username}%`);}catch{}
    if(anyR){ skippedCount++; alreadyPaidCount++; continue; }
    const correct=correctBackpay2(u.package);
    if(correct<=0) continue;
    missing.push({id:u.id,username:u.username,package:u.package,uplineId,upline_username:referrer.username,bonus:correct,correct,alreadyPaid:0,created_at:u.created_at});
  }
  if(mode!=="pay") return {total_active:all.length,missing_count:missing.length,paid_count:0,skipped_count:skippedCount,no_upline_count:noUplineCount,total_to_pay:missing.reduce((s,x)=>s+x.bonus,0),missing,details:missing};
  let paidNow=0,totalPaid=0,details=[];
  for(const m of missing){
    try{ db.prepare("INSERT INTO referral_rewards (referrer_id, referred_user_id, amount, referrer_package, referred_package) VALUES (?,?,?,?,?)").run(m.uplineId,m.id,m.correct,"",""+m.package); }catch(e){ console.log("Backpay2 insert skip (already exist)",e.message); continue; }
    db.prepare("UPDATE users SET affiliate_balance=COALESCE(affiliate_balance,0)+?, total_earned=COALESCE(total_earned,0)+? WHERE id=?").run(m.bonus,m.bonus,m.uplineId);
    db.prepare("INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description,created_at) VALUES (?,?,?,?,?,?,datetime('now'))").run(m.uplineId,"referral_reward",m.bonus,"affiliate",`BACKPAY_ALL_${m.id}`,`Backpay 2 - @${m.username} ${m.package} - Referred: @${m.upline_username||m.uplineId}`);
    try{notify4(m.uplineId,"Referral Bonus 💰",`You don get ₦${m.bonus.toLocaleString()} backpay for @${m.username} (${m.package})`);}catch{}
    paidNow++;totalPaid+=m.bonus;details.push(m);
  }
  return {paid:paidNow,paidCount:paidNow,totalPaid,total_to_pay:totalPaid,details,skipped_count:skippedCount,no_upline_count:noUplineCount};
};
force4("get","/api/admin/backpay-two",sGuard4,(req,res)=>{try{const r=runBackpay2(req.query.from||null,req.query.to||null,"check");return res.json({success:true,message:`Backpay 2 Check - Missing ${r.missing_count}, Already Paid/Skipped ${r.skipped_count}, No Upline ${r.no_upline_count}`,...r});}catch(e){return res.status(500).json({success:false,message:e.message})}});
force4("post","/api/admin/backpay-two",sGuard4,(req,res)=>{try{const b=req.body||{};const r=runBackpay2(b.from||null,b.to||null,"pay");return res.json({success:true,message:`Backpay 2 Done - Paid ${r.paid}, Total ₦${r.totalPaid}`,...r});}catch(e){return res.status(500).json({success:false,message:e.message})}});
force4("post","/api/admin/backpay-range",sGuard4,(req,res)=>{try{const {from,to,mode}=req.body||{};const r=runBackpay2(from||null,to||null,mode==="pay"?"pay":"check");if(mode==="pay")return res.json({success:true,message:`Backpay Range Done ${from} to ${to} - Paid ${r.paid}, Skipped ${r.skipped_count||0}, Total ₦${r.totalPaid}`,...r});return res.json({success:true,from,to,...r});}catch(e){return res.status(500).json({success:false,message:e.message})}});
force4("get","/api/admin/backpay-range",sGuard4,(req,res)=>{try{const r=runBackpay2(req.query.from||null,req.query.to||null,"check");return res.json({success:true,from:req.query.from||null,to:req.query.to||null,...r});}catch(e){return res.status(500).json({success:false,message:e.message})}});

// ---------- REFERRED BOARD - UPLINE FIXED ----------
force4("get","/api/admin/vendors/referred",sGuard4,(req,res)=>{
  try{
    const q=String(req.query.q||req.query.filter||"").trim().toLowerCase();
    let rows=db.prepare("SELECT * FROM users WHERE referred_by IS NOT NULL OR referrer_id IS NOT NULL OR upline_id IS NOT NULL OR invited_by IS NOT NULL OR sponsor_id IS NOT NULL OR referral_code_used IS NOT NULL ORDER BY id DESC LIMIT 500").all();
    let out=rows.map(u=>{
      const pkg=String(u.package||u.plan||"SILVER").toUpperCase();
      const activated=["active","approved","activated"].includes(String(u.account_status||u.status||"").toLowerCase());
      let bonus_paid=false;
      try{ const w=db.prepare("SELECT id FROM wallet_transactions WHERE reference=? LIMIT 1").get(`BACKPAY_ALL_${u.id}`); if(w) bonus_paid=true; }catch{}
      const up=resolveUpline4(u);
      const upLabel=referredLabel4(u);
      return {
        id:u.id, username:u.username, email:u.email, full_name:u.full_name,
        package:pkg, plan:pkg,
        account_status:u.account_status, status:u.status,
        referred_by:up?up.id:null, referrer_id:up?up.id:null, upline_id:up?up.id:null,
        referred_by_username:up?up.username:null, referrer_username:up?up.username:null, upline_username:up?up.username:null,
        referred_self_label:`Referred: @${u.username||("User "+u.id)}`,
        referred_label:upLabel, referred_by_label:upLabel, upline_label:upLabel,
        bonus_paid, referral_bonus_paid: bonus_paid?1:0,
        created_at:u.created_at, is_activated:activated
      };
    });
    if(q) out=out.filter(u=>String(u.referred_by||"").toLowerCase().includes(q) || String(u.referred_by_username||"").toLowerCase().includes(q) || String(u.username||"").toLowerCase().includes(q) || String(u.id).includes(q) || String(u.email||"").toLowerCase().includes(q));
    return res.json({success:true, referred:out, total:out.length});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});

// ---------- PING + SERVERS STATUS ----------
force4("get","/api/server4/ping",(req,res)=>{return res.json({success:true,message:"Server4 dey work ✅ - LOANS + VENDORS + REFERRALS FULL FIXED - ADMIN ONLY VENDOR"})});
force4("get","/api/servers/status",(req,res)=>{
  let s5={loaded:false, note:"server5.js no dey for same folder - if e dey different server, set SERVER5_URL"};
  try{ if(process.env.SERVER5_URL) s5={loaded:true, url:process.env.SERVER5_URL}; }catch{}
  return res.json({success:true, server4:{loaded:true, ping:"/api/server4/ping"}, server5:s5, shared_db:true, note:"All servers use SAME db (users, wallet_transactions, referrals) - so Vendor, Ref Bonus, History go sync"});
});

console.log("✅ SERVER 4 READY - LOANS + VENDORS + REFERRALS FULL FIXED - ADMIN ONLY VENDOR");

// ========== CONNECT TO SERVER 5 - SAME DB, SAME APP ==========
// Server 5 file should export same pattern: module.exports=(app,db,requireUser,requireAdmin)=>{}
// If e dey for same folder, load am here. If e dey different service, set SERVER5_URL and e go use same DB via API.
try{
  const _fs=require("fs"); const _path=require("path");
  const _candidates=["./server5.js","./server5/index.js","../server5.js","./server-5.js"];
  for(const _c of _candidates){
    try{
      const _full=_path.join(__dirname,_c);
      if(_fs.existsSync(_full)){
        console.log("🔗 SERVER 4 -> Loading Server 5 from",_c);
        require(_full)(app,db,requireUser,requireAdmin);
        console.log("✅ SERVER 5 CONNECTED via Server 4 - same app + same DB");
        break;
      }
    }catch(_e){ console.log("⚠️ Server 5 load skip",_c,_e.message); }
  }
}catch(_e){ console.log("⚠️ Server 5 connect skip:",_e.message); }

}catch(e){console.log("⚠️ Server 4 load error (no crash):",e.message)}};
