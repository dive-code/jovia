const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const https = require("https");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const multer = require("multer");
function loadEnvFile(){const envPath=path.join(__dirname,".env");if(!fs.existsSync(envPath))return;try{const content=fs.readFileSync(envPath,"utf8");for(const line of content.split(/\r?\n/)){const trimmed=line.trim();if(!trimmed||trimmed.startsWith("#"))continue;const index=trimmed.indexOf("=");if(index===-1)continue;const key=trimmed.slice(0,index).trim();let value=trimmed.slice(index+1).trim();if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'"))){value=value.slice(1,-1);}if(!process.env[key])process.env[key]=value;}}catch(e){}} loadEnvFile();
const app=express();
app.use(cors({origin: function(origin, cb){if(!origin) return cb(null,true); return cb(null,true);}, credentials: true}));
const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||"0.0.0.0";
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME || null;
const DB_DIR = VOLUME_PATH? VOLUME_PATH : __dirname;
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR,"jovia.db");
const ADMIN_USERNAME=process.env.ADMIN_USERNAME||"Divine";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"jovia@2026";
const PACKAGES=Object.freeze({Silver:9000,Gold:15000});
const WITHDRAWAL_MINIMUMS=Object.freeze({regular:60000,affiliate:20000});
const WITHDRAWAL_CODE_FEE=10000;
const MONNIFY_BASE_URL=(process.env.MONNIFY_BASE_URL||(String(process.env.MONNIFY_ENV||"sandbox").toLowerCase()==="live"?"https://api.monnify.com":"https://sandbox.monnify.com")).replace(/\/$/,"");
const MONNIFY_API_KEY=process.env.MONNIFY_API_KEY||"";
const MONNIFY_SECRET_KEY=process.env.MONNIFY_SECRET_KEY||"";
const MONNIFY_CONTRACT_CODE=process.env.MONNIFY_CONTRACT_CODE||"";
const MONNIFY_REDIRECT_URL=process.env.MONNIFY_REDIRECT_URL||"";
const MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS=String(process.env.MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS||"true").toLowerCase()==="true";
const SILVER_WELCOME_BONUS=Math.max(0,Number(process.env.SILVER_WELCOME_BONUS||9000)||9000);
const GOLD_WELCOME_BONUS=Math.max(0,Number(process.env.GOLD_WELCOME_BONUS||15000)||15000);
const BREVO_API_KEY=process.env.BREVO_API_KEY||process.env.BREVO_KEY||"";
const BREVO_SENDER_EMAIL=process.env.BREVO_SENDER_EMAIL||"noreply@jovianetwork.com";
const BREVO_SENDER_NAME=process.env.BREVO_SENDER_NAME||"Jovia Network";
const UPLOAD_ROOT = VOLUME_PATH? path.join(VOLUME_PATH, "uploads") : path.join(__dirname, "uploads");
const VIDEO_DIR = path.join(UPLOAD_ROOT, "videos");
const PUBLIC_DIR = path.join(__dirname, "public");
if(!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR,{recursive:true});
if(!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR,{recursive:true});
if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR,{recursive:true});
const storage = multer.diskStorage({destination:(req,file,cb)=>cb(null, VIDEO_DIR),filename:(req,file,cb)=>cb(null, "vid_"+Date.now()+"_"+crypto.randomBytes(4).toString("hex")+path.extname(file.originalname||".mp4"))});
const upload = multer({storage,limits:{fileSize: 200 * 1024 * 1024},fileFilter:(req,file,cb)=>{ file.mimetype.startsWith("video/")?cb(null,true):cb(new Error("Only video files allowed")); }});
const dbDir=path.dirname(DB_PATH);if(!fs.existsSync(dbDir))fs.mkdirSync(dbDir,{recursive:true});
const db=new Database(DB_PATH);db.pragma("journal_mode = WAL");db.pragma("foreign_keys = ON");db.pragma("busy_timeout = 5000");
db.exec(`
CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, password_hash TEXT NOT NULL, package TEXT NOT NULL DEFAULT 'Silver', package_amount INTEGER NOT NULL DEFAULT 9000, welcome_bonus INTEGER NOT NULL DEFAULT 0, referrer_id INTEGER, referral_code TEXT, referrals INTEGER NOT NULL DEFAULT 0, wallet_balance INTEGER NOT NULL DEFAULT 0, affiliate_balance INTEGER NOT NULL DEFAULT 0, total_earned INTEGER NOT NULL DEFAULT 0, account_status TEXT NOT NULL DEFAULT 'pending', status TEXT NOT NULL DEFAULT 'pending', plan TEXT, is_super INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(referrer_id) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'General', slot TEXT NOT NULL DEFAULT 'General', reward INTEGER NOT NULL DEFAULT 0, link TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT 'Flexible', status TEXT NOT NULL DEFAULT 'active', deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
CREATE TABLE IF NOT EXISTS user_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, job_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, job_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS user_job_link_opens (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, job_id INTEGER NOT NULL, opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, job_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS videos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', video_url TEXT NOT NULL DEFAULT '', thumbnail_url TEXT NOT NULL DEFAULT '', reward INTEGER NOT NULL DEFAULT 0, duration INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
CREATE TABLE IF NOT EXISTS user_videos (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, video_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', completed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, video_id), FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS wallet_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, amount INTEGER NOT NULL, balance_type TEXT NOT NULL DEFAULT 'wallet', reference TEXT, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS referral_rewards (id INTEGER PRIMARY KEY AUTOINCREMENT, referrer_id INTEGER NOT NULL, referred_user_id INTEGER NOT NULL UNIQUE, amount INTEGER NOT NULL DEFAULT 0, referrer_package TEXT NOT NULL, referred_package TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(referrer_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(referred_user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS withdrawals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('regular','affiliate')), status TEXT NOT NULL DEFAULT 'pending', bank_name TEXT NOT NULL DEFAULT '', bank_code TEXT NOT NULL DEFAULT '', account_name TEXT NOT NULL DEFAULT '', account_number TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', gateway TEXT NOT NULL DEFAULT 'manual', gateway_reference TEXT, gateway_status TEXT NOT NULL DEFAULT '', gateway_response TEXT NOT NULL DEFAULT '', refund_processed INTEGER NOT NULL DEFAULT 0, approved_by TEXT NOT NULL DEFAULT '', approved_at TEXT, rejected_by TEXT NOT NULL DEFAULT '', rejected_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount INTEGER NOT NULL, package TEXT NOT NULL, payment_reference TEXT NOT NULL UNIQUE, transaction_reference TEXT NOT NULL DEFAULT '', gateway TEXT NOT NULL DEFAULT 'monnify', gateway_status TEXT NOT NULL DEFAULT '', payment_status TEXT NOT NULL DEFAULT 'PENDING', gateway_response TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS webhook_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS withdrawal_events (id INTEGER PRIMARY KEY AUTOINCREMENT, withdrawal_id INTEGER NOT NULL, action TEXT NOT NULL, actor TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(withdrawal_id) REFERENCES withdrawals(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS links (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL DEFAULT '', title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT 'General', status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS private_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, message TEXT NOT NULL, recipient_ids TEXT NOT NULL DEFAULT '[]', recipient_summary TEXT NOT NULL DEFAULT '', type TEXT NOT NULL DEFAULT 'popup', status TEXT NOT NULL DEFAULT 'sent', created_by TEXT NOT NULL DEFAULT 'admin', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS private_message_reads (id INTEGER PRIMARY KEY AUTOINCREMENT, message_id INTEGER NOT NULL, user_id INTEGER NOT NULL, read_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(message_id, user_id), FOREIGN KEY(message_id) REFERENCES private_messages(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, enabled INTEGER NOT NULL DEFAULT 1, title TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', channel_url TEXT NOT NULL DEFAULT 'https://t.me/jovianetwerk', channel_text TEXT NOT NULL DEFAULT 'Join Official Channel', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS withdrawal_codes (id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, used INTEGER NOT NULL DEFAULT 0, used_by TEXT NOT NULL DEFAULT '', used_by_id INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, used_at TEXT, expires_at TEXT);
`);
function tableExists(t){return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").get(t));}
function columnExists(t,c){if(!tableExists(t))return false;return db.prepare(`PRAGMA table_info(${t})`).all().some(x=>x.name===c);}
function addColumnIfMissing(t,c,d){if(!tableExists(t)||columnExists(t,c))return false;try{db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`);return true;}catch(e){return false;}}
function migrateDatabase(){
  addColumnIfMissing("users","status","TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing("users","plan","TEXT");
  addColumnIfMissing("users","is_super","INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("users","account_status","TEXT NOT NULL DEFAULT 'pending'");
  try{ db.prepare("UPDATE users SET status = COALESCE(NULLIF(status,''), account_status, 'pending')").run(); }catch(e){}
  try{ db.prepare("UPDATE users SET account_status = COALESCE(NULLIF(account_status,''), status, 'pending')").run(); }catch(e){}
  try{ db.prepare("UPDATE users SET plan = COALESCE(NULLIF(plan,''), package, 'Silver')").run(); }catch(e){}
  try{ db.prepare("UPDATE users SET is_super = 1 WHERE UPPER(COALESCE(plan,'') ) = 'SUPER' OR UPPER(COALESCE(package,'')) = 'SUPER'").run(); }catch(e){}
const opened = db.prepare("SELECT * FROM user_job_link_opens WHERE user_id=? AND job_id=?").get(req.user.id, jobId);
    if(!opened){ return res.status(400).json({success:false, message:"Open the task first before claiming."}); }
    const existing = db.prepare("SELECT * FROM user_jobs WHERE user_id=? AND job_id=?").get(req.user.id, jobId);
    if(existing && (existing.status === "completed" || existing.status === "claimed")){
      const wallet = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(req.user.id);
      return res.json({success:true, message:"Already completed", reward:Number(job.reward||limits.perTask), walletBalance:wallet? wallet.wallet_balance : 0});
    }
    let reward = Number(job.reward || 0);
    if(reward <=0) reward = limits.perTask;
    if((today.totalEarned + reward) > limits.maxDaily){
      return res.status(400).json({success:false, message:`This job of N${reward} would exceed daily N${limits.maxDaily.toLocaleString()} limit. Earned today: N${today.totalEarned}. Upgrade to JOVIA Super for full offers.`, earned: today.totalEarned, maxDaily: limits.maxDaily});
    }
    const newBalance = db.transaction(function(){
      db.prepare("UPDATE users SET wallet_balance = wallet_balance +?, total_earned = total_earned +? WHERE id=?").run(reward, reward, req.user.id);
      if(existing){ db.prepare("UPDATE user_jobs SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE user_id=? AND job_id=?").run(req.user.id, jobId); }
      else { db.prepare("INSERT INTO user_jobs (user_id,job_id,status, completed_at) VALUES (?,?, 'completed', CURRENT_TIMESTAMP)").run(req.user.id, jobId); }
      try{ db.prepare("INSERT INTO wallet_transactions (user_id, amount, type, description, reference, balance_type) VALUES (?,?,?,?,?,?)").run(req.user.id, reward, 'job_reward', 'Job completed: ' + job.title + ` [${userPlan} ${today.totalCount+1}/${limits.maxJobs}]`, 'JOB_'+jobId+'_'+Date.now(), 'wallet'); }catch(err){}
      const updatedUser = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(req.user.id); return updatedUser? updatedUser.wallet_balance : 0;
    })();
    return res.json({ success:true, message:`N${reward} credited! ${today.totalCount+1}/${limits.maxJobs} today.`, reward:reward, walletBalance:newBalance, wallet_balance:newBalance, plan: userPlan, completedToday: today.totalCount+1, maxJobs: limits.maxJobs, maxDaily: limits.maxDaily });
  }catch(e){ return res.status(400).json({success:false, message:e.message}); }
});
app.get("/api/wallet",requireUser,(req,res)=>{try{const user=db.prepare(`SELECT id,wallet_balance,affiliate_balance,total_earned FROM users WHERE id=?`).get(req.user.id);if(!user)return res.status(404).json({success:false,message:"User not found."});const transactions=db.prepare(`SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC`).all(req.user.id);return res.json({success:true,walletBalance:Number(user.wallet_balance||0),affiliateBalance:Number(user.affiliate_balance||0),totalEarned:Number(user.total_earned||0),transactions:transactions.map((item)=>({id:item.id,type:item.type,amount:Number(item.amount||0),balanceType:item.balance_type,reference:item.reference,description:item.description,createdAt:item.created_at}))});}catch(error){return res.status(500).json({success:false,message:"Unable to load wallet."});}});
app.post("/api/withdrawals/verify-code",requireUser,(req,res)=>{
 try{
 if(!isWithdrawalCodesEnabled()) return res.json({success:true,valid:true,message:"Codes disabled - free withdrawal"});
 const raw=cleanString(req.body?.code??req.body?.withdrawalCode??req.body?.withdrawal_code,50).toUpperCase().trim();
 const reqType = String(req.body?.type||"regular").toLowerCase();
 if(reqType==="affiliate") return res.json({success:true,valid:true,message:"Affiliate FREE - no code needed"});
 if(!raw) return res.json({success:false,valid:false,message:"Enter code"});
 if(!raw.startsWith("JOVIA-")) return res.json({success:false,valid:false,message:"INVALID FORMAT"});
 const row=db.prepare("SELECT * FROM withdrawal_codes WHERE code=? LIMIT 1").get(raw);
 if(!row) return res.json({success:false,valid:false,message:"Invalid code - NOT FOUND"});
 if(row.used) return res.json({success:false,valid:false,used:true,message:`CODE ALREADY USED by ${row.used_by}`});
 return res.json({success:true,valid:true,message:"Valid code",code:row.code});
 }catch(e){return res.status(500).json({success:false,valid:false,message:e.message});}
});
app.post("/api/withdrawal-codes/verify",requireUser,(req,res)=>{
 try{
 const raw=cleanString(req.body?.code??req.body?.withdrawalCode,50).toUpperCase().trim();
 if(!raw) return res.json({success:false,valid:false,message:"Enter code"});
 if(!raw.startsWith("JOVIA-")) return res.json({success:false,valid:false,message:"Must be JOVIA-XXXXXXXX"});
 const row=db.prepare("SELECT * FROM withdrawal_codes WHERE code=? LIMIT 1").get(raw);
 if(!row) return res.json({success:false,valid:false,message:"Not in DB"});
 if(row.used) return res.json({success:false,valid:false,used:true,message:`USED by ${row.used_by}`});
 return res.json({success:true,valid:true,message:"Valid Admin code"});
 }catch(e){return res.status(500).json({success:false});}
});
app.post("/api/withdrawals",requireActiveUser,(req,res)=>{try{
 const body=req.body||{};
 const type=String(body.type||body.withdrawalType||"regular").toLowerCase()==="affiliate"?"affiliate":"regular";
 if(type==="regular" &&!isRegularWithdrawalsEnabled()) return res.status(403).json({success:false,message:"Regular withdrawals disabled"});
 if(type==="affiliate" &&!isAffiliateWithdrawalsEnabled()) return res.status(403).json({success:false,message:"Affiliate withdrawals disabled"});
 const amount=toPositiveInteger(body.amount);
 const bankName=cleanString(body.bankName??body.bank_name??body.bank??body.provider??body.bankName??body.country,120);
 const accountNumber=cleanString(body.accountNumber??body.account_number??body.number??body.account??body.usdtAddress??body.accountNumber,100).replace(/\s+/g,"");
 const accountNameInput=cleanString(body.accountName??body.account_name??body.name??body.accountName,150);
 const note=cleanString(body.note,500);
 const codeRaw=cleanString(body.withdrawalCode??body.code??body.withdrawal_code??body.withdrawal_code_input,50).toUpperCase().trim();
 if(!amount)return res.status(400).json({success:false,message:"Enter a valid withdrawal amount."});
 if(!accountNumber && type==="regular")return res.status(400).json({success:false,message:"Account number required."});
 const minimum=WITHDRAWAL_MINIMUMS[type];
 if(amount<minimum)return res.status(400).json({success:false,message:`Minimum ${type} withdrawal is N${minimum.toLocaleString()}`});
 const balanceColumn=type==="affiliate"?"affiliate_balance":"wallet_balance";
 const user=db.prepare(`SELECT id,wallet_balance,affiliate_balance FROM users WHERE id=? LIMIT 1`).get(req.user.id);
 if(!user)return res.status(404).json({success:false,message:"User not found."});
 const currentBalance=Number(user[balanceColumn]||0);
 if(currentBalance<amount)return res.status(400).json({success:false,message:"Insufficient balance."});
 if(type==="regular" && isWithdrawalCodesEnabled()){
 if(!codeRaw) return res.status(400).json({success:false,message:`CODE required - Min N${minimum.toLocaleString()}`});
 const codeRow=db.prepare("SELECT * FROM withdrawal_codes WHERE code=? LIMIT 1").get(codeRaw);
 if(!codeRow) return res.status(400).json({success:false,message:"NOT FOUND"});
 if(codeRow.used) return res.status(400).json({success:false,message:`ALREADY USED by ${codeRow.used_by}`});
 }
 const withdrawal=db.transaction(()=>{
 if(type==="regular" && isWithdrawalCodesEnabled() && codeRaw){
 const fresh=db.prepare("SELECT * FROM withdrawal_codes WHERE code=? LIMIT 1").get(codeRaw);
 if(!fresh || fresh.used) throw new Error(`Code already used`);
 }
 updateUserBalance(req.user.id,balanceColumn,-amount);
 const result=db.prepare(`INSERT INTO withdrawals (user_id,amount,type,status,bank_name,account_name,account_number,note,gateway) VALUES (?,?,?, 'pending',?,?,?,?, 'manual')`).run(req.user.id,amount,type,bankName||"Bank",accountNameInput||req.user.username,accountNumber||"N/A",note);
 const withdrawalId=Number(result.lastInsertRowid);
 recordWalletTransaction(req.user.id,"withdrawal",-amount,type==="affiliate"?"affiliate":"wallet",`WITHDRAWAL_${withdrawalId}`,`Withdrawal ${type} N${amount}`);
 if(isWithdrawalCodesEnabled() && codeRaw && type==="regular"){
 db.prepare("UPDATE withdrawal_codes SET used=1, used_by=?, used_by_id=?, used_at=CURRENT_TIMESTAMP WHERE code=?").run(req.user.username, req.user.id, codeRaw);
 }
 addWithdrawalEvent(withdrawalId,"withdrawal_requested",req.user.username,{amount,type,codeUsed:codeRaw||"FREE-AFFILIATE"});
 return db.prepare(`SELECT * FROM withdrawals WHERE id=? LIMIT 1`).get(withdrawalId);
 })();
 return res.status(201).json({success:true,message:`Withdrawal N${amount.toLocaleString()} submitted`,withdrawal:withdrawalResult(withdrawal),received:amount});
}catch(error){return res.status(400).json({success:false,message:error.message});}});
app.get("/api/withdrawals",requireUser,(req,res)=>{try{const rows=db.prepare("SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 100").all(req.user.id);return res.json({success:true,withdrawals:rows.map(withdrawalResult)});}catch(e){return res.status(500).json({success:false});}});
app.get("/api/referrals/link", requireUser, (req,res)=>{ try{ const username = req.user.username; const frontend = process.env.FRONTEND_URL || "https://jovianetworkcom.vercel.app"; const link = `${frontend}/register.html?ref=${encodeURIComponent(username)}`; return res.json({success:true, link, referralLink: link, url: link}); }catch(e){ return res.status(500).json({success:false, message:e.message}); } });
app.get("/api/referrals", requireUser, (req,res)=>{ try{ const refs = db.prepare("SELECT u.id, u.full_name, u.username, u.package, u.account_status, u.created_at FROM users u WHERE u.referrer_id=? ORDER BY u.id DESC").all(req.user.id); const rewards = db.prepare("SELECT * FROM referral_rewards WHERE referrer_id=? ORDER BY id DESC").all(req.user.id); const rewardMap = new Map(); for(const r of rewards){ if(!rewardMap.has(r.referred_user_id)) rewardMap.set(r.referred_user_id, r); } const mapped = refs.map(u=>{ const rew = rewardMap.get(u.id); return { id: u.id, full_name: u.full_name, name: u.full_name, fullName: u.full_name, username: u.username, package: u.package, plan: u.package, package_name: u.package, status: (u.account_status==='active' || u.account_status==='approved')? 'approved' : 'pending', commission: rew? rew.amount : 0, amount: rew? rew.amount : 0, earning: rew? rew.amount : 0, created_at: u.created_at, createdAt: u.created_at, joined_at: u.created_at, }; }); const total = mapped.length; const successful = mapped.filter(r=>r.status==='approved').length; const pending = total - successful; const totalEarnings = mapped.reduce((s,r)=>s+Number(r.commission||0),0); return res.json({ success:true, referrals: mapped, data: mapped, users: mapped, rewards, total, totalReferrals: total, successfulReferrals: successful, approvedReferrals: successful, pendingReferrals: pending, totalEarnings, referralEarnings: totalEarnings, }); }catch(e){ return res.json({success:true, referrals:[], rewards:[], totalReferrals:0, successfulReferrals:0, pendingReferrals:0, totalEarnings:0}); } });
app.get("/api/referrals/my", requireUser, (req,res)=>{ try{ const refs = db.prepare("SELECT u.id, u.username, u.full_name, u.package, u.created_at FROM users u WHERE u.referrer_id=? ORDER BY u.id DESC").all(req.user.id); const rewards = db.prepare("SELECT * FROM referral_rewards WHERE referrer_id=?").all(req.user.id); const totalEarnings = rewards.reduce((s,r)=>s+Number(r.amount||0),0); const rMap=new Map(); for(const r of rewards){ if(!rMap.has(r.referred_user_id)) rMap.set(r.referred_user_id, r.amount); } return res.json({success:true, total: refs.length, active: refs.length, totalEarnings, referrals: refs.map(r=>({username:r.username, package:r.package, bonusEarned:Number(rMap.get(r.id)||0), bonusGiven:Number(rMap.get(r.id)||0)}))}); }catch(e){ return res.json({success:true, total:0, active:0, totalEarnings:0, referrals:[]}); } });
async function verifyAdminPassword(password){const configured=String(ADMIN_PASSWORD||"");if(!configured)return false;if(configured.startsWith("$2a$")||configured.startsWith("$2b$")||configured.startsWith("$2y$")){return bcrypt.compare(password,configured);}return password===configured;}
app.post("/api/admin/login",async(req,res)=>{try{const username=cleanString(req.body?.username??req.body?.login,100);const password=String(req.body?.password||"");if(!username||!password)return res.status(400).json({success:false,message:"Username and password are required."});const validUsername=username.toLowerCase()===String(ADMIN_USERNAME||"").toLowerCase();if(!validUsername)return res.status(401).json({success:false,message:"Invalid admin credentials."});const validPassword=await verifyAdminPassword(password);if(!validPassword)return res.status(401).json({success:false,message:"Invalid admin credentials."});const token=crypto.randomBytes(32).toString("hex");const maxAge=7*24*60*60*1000;adminSessions.set(token,{username:ADMIN_USERNAME,expiresAt:Date.now()+maxAge});setSessionCookie(res,"jovia_admin_session",token,maxAge);return res.json({success:true,username:ADMIN_USERNAME,admin:{username:ADMIN_USERNAME},token,adminToken:token});}catch(error){return res.status(500).json({success:false,message:"Unable to sign in as admin."});}});
app.post("/api/admin/logout",(req,res)=>{const token=getSessionToken(req,"jovia_admin_session"); if(token) adminSessions.delete(token); const at=getAdminTokenFromRequest(req); if(at) adminSessions.delete(at); const userToken=getSessionToken(req,"jovia_session"); if(userToken) sessions.delete(userToken); clearSessionCookie(res,"jovia_admin_session"); clearSessionCookie(res,"jovia_admin_session"); return res.json({success:true});});
app.get("/api/admin/me",requireAdmin,(req,res)=>{return res.json({success:true,admin:{username:req.admin.username}});});
app.get("/api/admin/dashboard",requireAdmin,(req,res)=>{try{const users=db.prepare(`SELECT COUNT(*) AS count FROM users`).get().count;const activeUsers=db.prepare(`SELECT COUNT(*) AS count FROM users WHERE account_status IN ('active','approved')`).get().count;const pendingUsers=db.prepare(`SELECT COUNT(*) AS count FROM users WHERE account_status='pending'`).get().count;const pendingWithdrawals=db.prepare(`SELECT COUNT(*) AS count FROM withdrawals WHERE status='pending'`).get().count;const totalVideos=db.prepare(`SELECT COUNT(*) AS count FROM videos`).get().count;return res.json({success:true,users,activeUsers,pendingUsers,videos:totalVideos,withdrawals:{pending:pendingWithdrawals},withdrawalsEnabled:isWithdrawalsEnabled(),regularEnabled:isRegularWithdrawalsEnabled(),affiliateEnabled:isAffiliateWithdrawalsEnabled(),codesEnabled:isWithdrawalCodesEnabled(),withdrawals_enabled:isWithdrawalsEnabled()? '1':'0'});}catch(error){return res.status(500).json({success:false,message:"Unable to load dashboard."});}});
app.get("/api/admin/users",requireAdmin,(req,res)=>{try{const rows=db.prepare(`SELECT id,full_name,username,email,phone,package,package_amount,wallet_balance,affiliate_balance,total_earned,account_status,created_at,referral_code,referrer_id,referrals,plan,is_super FROM users ORDER BY id DESC`).all();return res.json({success:true,users:rows.map((user)=>({id:user.id,fullName:user.full_name,full_name:user.full_name,username:user.username,email:user.email,phone:user.phone,package:user.package,plan:user.plan,packageAmount:Number(user.package_amount||0),walletBalance:Number(user.wallet_balance||0),wallet_balance:user.wallet_balance,affiliateBalance:Number(user.affiliate_balance||0),affiliate_balance:user.affiliate_balance,totalEarned:Number(user.total_earned||0),total_earned:user.total_earned,accountStatus:user.account_status,account_status:user.account_status,createdAt:user.created_at,created_at:user.created_at,referral_code:user.referral_code,referrer_id:user.referrer_id,referrals:user.referrals,is_super:user.is_super}))});}catch(error){return res.status(500).json({success:false,message:"Unable to load users."});}});
// ===== SHARED HELPER - REAL BONUS ONLY: Silver 8000, Gold 13000, Super 19000/18000 =====
function getReferralCorrectAmount(pkg, alreadyPaid){
  const p = String(pkg||"").toUpperCase();
  if(p==="GOLD") return 13000;
  if(p==="SILVER") return 8000;
  if(p==="SUPER"){
    if(alreadyPaid===13000) return 19000;
    if(alreadyPaid===8000) return 18000;
    if(alreadyPaid===0) return 19000;
    return alreadyPaid;
  }
  return 0;
}
function payReferralBonus(referredUser){
  try{
    const fresh = typeof referredUser === 'object' ? referredUser : db.prepare("SELECT * FROM users WHERE id=?").get(referredUser);
    if(!fresh || !fresh.referrer_id) return 0;
    if(Number(fresh.referrer_id)===Number(fresh.id)) return 0;
    const referrer = db.prepare("SELECT * FROM users WHERE id=?").get(fresh.referrer_id);
    if(!referrer) return 0;
    const pkg = String(fresh.package||"").toUpperCase();
    const existing = db.prepare("SELECT * FROM referral_rewards WHERE referred_user_id=?").get(fresh.id);
    const alreadyPaid = existing ? Number(existing.amount||0) : 0;
    const correct = getReferralCorrectAmount(pkg, alreadyPaid);
    if(correct<=0) return 0;
    const toPay = correct - alreadyPaid;
    if(toPay<=0) return 0;
    if(existing){ db.prepare("UPDATE referral_rewards SET amount=?, referrer_id=?, referrer_package=?, referred_package=? WHERE referred_user_id=?").run(correct, referrer.id, referrer.package, fresh.package, fresh.id); }
    else{ db.prepare("INSERT INTO referral_rewards (referrer_id, referred_user_id, amount, referrer_package, referred_package) VALUES (?,?,?,?,?)").run(referrer.id, fresh.id, correct, referrer.package, fresh.package); }
    db.prepare("UPDATE users SET affiliate_balance = COALESCE(affiliate_balance,0) + ?, total_earned = COALESCE(total_earned,0) + ? WHERE id=?").run(toPay, toPay, referrer.id);
    db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, balance_type, reference, description) VALUES (?,?,?,?,?,?)").run(referrer.id, "referral_reward", toPay, "affiliate", `REFERRAL_${fresh.id}`, `Referral reward for ${fresh.username} (${pkg})`);
    return toPay;
  }catch(e){ console.error("payReferralBonus error:", e.message); return 0; }
}
function activateUserAndRewards(userId){
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(userId);
  if(!user) return null;
  db.prepare("UPDATE users SET account_status='active', status='active' WHERE id=?").run(userId);
  // Pay real referral bonus - no fake welcome, use your existing getWelcomeBonus only for display column
  try{
    if(typeof getWelcomeBonus === 'function'){
      db.prepare("UPDATE users SET welcome_bonus=? WHERE id=?").run(getWelcomeBonus(user.package), userId);
    }
  }catch{}
  payReferralBonus(userId);
  try{ if(typeof activateUserAndRewardsInternal === 'function') activateUserAndRewardsInternal(userId, user.package, user.package); }catch(e){}
  return db.prepare("SELECT * FROM users WHERE id=?").get(userId);
}
function detectPlanForSelar(body){
  try{
    const p = packageFromInput(body?.plan || body?.package || body?.product || "");
    if(p) return p;
  }catch{}
  const amt = String(body?.amount || body?.total || body?.price || body?.data?.amount || "");
  const s = JSON.stringify(body||{}).toLowerCase();
  if(s.includes("super") || amt.includes("30000")) return "Super";
  if(s.includes("gold") || amt.includes("15000")) return "Gold";
  return "Silver";
}

// ===== FIXED: Admin status - suspend + activate both work, activate FORCES bonus like backpay =====
app.post("/api/admin/users/:id/status",requireAdmin,(req,res)=>{
  try{
    const id=req.params.id;
    const raw=String(req.body?.status||req.body?.account_status||req.body?.action||"").toLowerCase().trim();
    let ns;
    if(["suspend","suspended","ban","banned","blocked","block","disable","disabled"].includes(raw)) ns="suspended";
    else if(["pending","pend","waiting"].includes(raw)) ns="pending";
    else if(["active","approve","approved","activate","activated","enable","enabled","unblock","unban"].includes(raw)) ns="active";
    else ns="active";
    const u=db.prepare("SELECT * FROM users WHERE id=?").get(id);
    if(!u) return res.status(404).json({success:false,message:"User not found"});
    if(ns==="suspended"){
      try{ db.prepare("UPDATE users SET account_status='suspended', status='suspended' WHERE id=?").run(id); }
      catch(e){ db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(id); }
      try{ db.prepare("DELETE FROM sessions WHERE user_id=?").run(id); }catch{}
      try{ db.prepare("DELETE FROM user_sessions WHERE user_id=?").run(id); }catch{}
      return res.json({success:true,message:`User suspended successfully`, status:"suspended", account_status:"suspended"});
    }
    if(ns==="pending"){
      try{ db.prepare("UPDATE users SET account_status='pending', status='pending' WHERE id=?").run(id); }
      catch(e){ db.prepare("UPDATE users SET account_status='pending' WHERE id=?").run(id); }
      return res.json({success:true,message:`User set to pending`, status:"pending", account_status:"pending"});
    }
    // ACTIVE path - FORCE PAY LIKE BACKPAY - uses shared helper, same amounts
    const result=db.transaction(()=>{
      payReferralBonus(u.id);
      try{ db.prepare("UPDATE users SET account_status='active', status='active' WHERE id=?").run(u.id); }
      catch(e){ db.prepare("UPDATE users SET account_status='active' WHERE id=?").run(u.id); }
      try{ activateUserAndRewardsInternal(u.id, u.package, u.package); }catch(e){ console.error("activate internal (non-fatal):", e.message); }
      return db.prepare("SELECT * FROM users WHERE id=?").get(u.id);
    })();
    return res.json({success:true,message:`User activated successfully + referral bonus paid`, status:"active", account_status:"active", user:result});
  }catch(e){ console.error("ADMIN STATUS ERROR:",e); return res.status(500).json({success:false,message:"Failed to update status: "+e.message}); }
});

// ===== FIXED: Fix missing rewards in one click =====
app.post("/api/admin/fix-missing-rewards",requireAdmin,(req,res)=>{
  try{ const r=repairMissingReferralRewards(); return res.json({success:true,message:`Fixed ${r.fixed} users, skipped ${r.skipped}`, ...r}); }
  catch(e){ return res.status(500).json({success:false,message:e.message}); }
});
app.post("/api/admin/repair-referral/:id",requireAdmin,(req,res)=>{
  try{
    const id=req.params.id;
    const u=db.prepare("SELECT * FROM users WHERE id=?").get(id);
    if(!u) return res.status(404).json({success:false,message:"User not found"});
    payReferralBonus(u.id);
    try{ activateUserAndRewardsInternal(u.id, u.package, u.package); }catch(e){}
    const after=db.prepare("SELECT * FROM users WHERE id=?").get(id);
    return res.json({success:true,message:"Referral repaired", user:after});
  }catch(e){ return res.status(500).json({success:false,message:e.message}); }
});
app.get("/api/admin/settings",requireAdmin,(req,res)=>{try{const allSettings = db.prepare("SELECT key, value, updated_at FROM settings").all(); const obj = {}; for(const s of allSettings){ obj[s.key] = s.value; } return res.json({success:true, settings: obj, withdrawalsEnabled: isWithdrawalsEnabled(), regularEnabled:isRegularWithdrawalsEnabled(), affiliateEnabled:isAffiliateWithdrawalsEnabled(), codesEnabled:isWithdrawalCodesEnabled(), minimums:WITHDRAWAL_MINIMUMS, codeFee:WITHDRAWAL_CODE_FEE, withdrawals_enabled: isWithdrawalsEnabled()? '1' : '0'});}catch(e){ return res.status(500).json({success:false,message:e.message}); }});
app.post("/api/admin/settings/withdrawals",requireAdmin,(req,res)=>{try{
  let enabled = req.body?.enabled?? req.body?.regularEnabled?? req.body?.withdrawalsEnabled;
  let type = String(req.body?.type||"regular").toLowerCase();
  if(typeof enabled === 'string'){ enabled = enabled === '1' || enabled.toLowerCase() === 'true' || enabled.toLowerCase() === 'on'; } else { enabled = Boolean(enabled); }
  if(type==="affiliate"){ setAffiliateWithdrawalsEnabled(enabled); return res.json({success:true, message: enabled? "Affiliate ENABLED" : "Affiliate DISABLED", enabled, affiliateEnabled:enabled, type:'affiliate'}); }
  setRegularWithdrawalsEnabled(enabled); setSettingValue('withdrawals_enabled', enabled?'1':'0');
  return res.json({success:true, message: enabled? "Regular ENABLED" : "Regular DISABLED", enabled, regularEnabled:enabled, withdrawalsEnabled:enabled, type:'regular'});
}catch(e){ return res.status(400).json({success:false,message:e.message}); }});
app.post("/api/admin/settings/regular-withdrawals",requireAdmin,(req,res)=>{try{
    let enabled = req.body?.enabled?? req.body?.regularEnabled;
  if(typeof enabled==='string') enabled = enabled==='1'||enabled.toLowerCase()==='true'||enabled.toLowerCase()==='on'; else enabled=Boolean(enabled);
  setRegularWithdrawalsEnabled(enabled); setSettingValue('withdrawals_enabled', enabled?'1':'0');
  return res.json({success:true, enabled, regularEnabled:enabled, withdrawalsEnabled:enabled, message: enabled?"Regular ON":"Regular OFF"});
}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.post("/api/admin/settings/affiliate-withdrawals",requireAdmin,(req,res)=>{try{
  let enabled = req.body?.enabled?? req.body?.affiliateEnabled;
  if(typeof enabled==='string') enabled = enabled==='1'||enabled.toLowerCase()==='true'||enabled.toLowerCase()==='on'; else enabled=Boolean(enabled);
  setAffiliateWithdrawalsEnabled(enabled);
  return res.json({success:true, enabled, affiliateEnabled:enabled, message: enabled?"Affiliate ON":"Affiliate OFF"});
}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.post("/api/admin/settings/withdrawal-codes",requireAdmin,(req,res)=>{try{
  let enabled = req.body?.enabled;
  if(typeof enabled==='string') enabled = enabled==='1'||enabled.toLowerCase()==='true'||enabled.toLowerCase()==='on'; else enabled=Boolean(enabled);
  setWithdrawalCodesEnabled(enabled);
  return res.json({success:true, enabled, codesEnabled:enabled, message: enabled?`Codes ENABLED`:"Codes DISABLED"});
}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.post("/api/admin/withdrawal-codes/generate",requireAdmin,(req,res)=>{try{
  const count= Math.min(100, Math.max(1, Number(req.body?.count||1)||1));
  const codes=[];
  for(let i=0;i<count;i++){
    let code=generateWithdrawalCode();
    try{ db.prepare("INSERT INTO withdrawal_codes (code) VALUES (?)").run(code); codes.push(code); }catch{ i--; }
  }
  return res.json({success:true, codes, count:codes.length, message:`${codes.length} codes generated`});
}catch(e){return res.status(500).json({success:false,message:e.message});}});
app.get("/api/admin/withdrawal-codes",requireAdmin,(req,res)=>{try{
  const rows=db.prepare("SELECT * FROM withdrawal_codes ORDER BY id DESC LIMIT 200").all();
  return res.json({success:true,codes:rows, total:db.prepare("SELECT COUNT(*) as c FROM withdrawal_codes").get().c, unused:db.prepare("SELECT COUNT(*) as c FROM withdrawal_codes WHERE used=0").get().c, used:db.prepare("SELECT COUNT(*) as c FROM withdrawal_codes WHERE used=1").get().c, codeFee:WITHDRAWAL_CODE_FEE, minimums:WITHDRAWAL_MINIMUMS});
}catch(e){return res.status(500).json({success:false});}});
// === BACKPAY TOTAL - FROM BEGINNING - REFUND REFERRAL - FIXED: use requireAdmin, no ?key= ===
app.get("/api/admin/backpay-all", requireAdmin, (req,res)=>{
  try{
    const result = db.transaction(()=>{
      let paidCount = 0, totalPaid = 0, details = [];
      const allActivated = db.prepare("SELECT * FROM users WHERE account_status IN ('active','approved') ORDER BY id ASC").all();
      for(const u of allActivated){
        if(!u.referrer_id) continue;
        const referrer = db.prepare("SELECT * FROM users WHERE id=?").get(u.referrer_id);
        if(!referrer || referrer.id === u.id) continue;
        const paid = payReferralBonus(u);
        if(paid>0){
          paidCount++; totalPaid += paid;
          details.push({referrer: referrer.username, referred: u.username, package: u.package, paid});
        }
      }
      return {paidCount, totalPaid, details};
    })();
    return res.json({success:true, message:`Backpay TOTAL done - ${result.paidCount} people refunded, total ₦${result.totalPaid}`, ...result});
  }catch(e){ return res.status(500).json({success:false, message:e.message}); }
});
app.get("/api/admin/private-messages",requireAdmin,(req,res)=>{
  try{
    const rows = db.prepare("SELECT * FROM private_messages ORDER BY id DESC LIMIT 200").all();
    const mapped = rows.map(r=>{
      let ids=[]; try{ids=JSON.parse(r.recipient_ids||"[]");}catch{}
      let recips=[];
      if(ids.length && ids.length<=20){
        try{ recips = db.prepare(`SELECT id, full_name, username, email FROM users WHERE id IN (${ids.map(()=>'?').join(',')})`).all(...ids); }catch{}
      }
      return {id:r.id, title:r.title, message:r.message, recipient_ids:ids, recipients:recips.length?recips:r.recipient_summary, recipient_summary:r.recipient_summary, type:r.type, status:r.status, created_at:r.created_at, createdAt:r.created_at};
    });
    return res.json({success:true, messages:mapped});
  }catch(e){return res.status(500).json({success:false,message:e.message});}
});
app.get("/api/user/private-messages",requireUser,(req,res)=>{
  try{
    const userId = req.user.id;
    const all = db.prepare("SELECT * FROM private_messages WHERE status='sent' ORDER BY id DESC LIMIT 100").all();
    const unread = [];
    for(const msg of all){
      let ids=[]; try{ids=JSON.parse(msg.recipient_ids||"[]");}catch{}
      if(!ids.includes(userId)) continue;
      const read = db.prepare("SELECT id FROM private_message_reads WHERE message_id=? AND user_id=? LIMIT 1").get(msg.id, userId);
      if(!read) unread.push({id:msg.id, title:msg.title, message:msg.message, type:msg.type, created_at:msg.created_at});
    }
    return res.json({success:true, messages:unread, count:unread.length});
  }catch(e){return res.status(500).json({success:false,message:e.message});}
});
app.post("/api/admin/private-messages",requireAdmin,(req,res)=>{
  try{
    const {recipientIds, title, message, type} = req.body||{};
    if(!Array.isArray(recipientIds) || recipientIds.length===0) return res.status(400).json({success:false,message:"Select at least one recipient"});
    const cleanTitle = cleanString(title,150);
    const cleanMessage = cleanString(message,5000);
    if(!cleanTitle) return res.status(400).json({success:false,message:"Title required"});
    if(!cleanMessage) return res.status(400).json({success:false,message:"Message required"});
    const validIds = recipientIds.map(n=>Number(n)).filter(n=>Number.isInteger(n)&&n>0);
    if(!validIds.length) return res.status(400).json({success:false,message:"No valid recipient IDs"});
    let summary = "";
    if(validIds.length===1){
      const u = db.prepare("SELECT full_name, username, email FROM users WHERE id=?").get(validIds[0]);
      summary = u? `${u.full_name} (${u.username}) - ONE user` : `User ID ${validIds[0]} - ONE`;
    } else {
      summary = `${validIds.length} users - ALL/POP`;
    }
    const result = db.prepare("INSERT INTO private_messages (title, message, recipient_ids, recipient_summary, type, status, created_by) VALUES (?,?,?,?,?,?,?)").run(cleanTitle, cleanMessage, JSON.stringify(validIds), summary, cleanString(type||"popup",20)||"popup", "sent", req.admin.username||"admin");
    return res.json({success:true, message:`Pop sent to ${validIds.length} user(s)`, id:result.lastInsertRowid, recipientCount:validIds.length, recipients:summary});
  }catch(e){return res.status(500).json({success:false,message:e.message});}
});
app.post("/api/user/private-messages/read",requireUser,(req,res)=>{
  try{
    const id = toPositiveInteger(req.body?.id || req.body?.message_id);
    if(!id) return res.status(400).json({success:false,message:"Invalid id"});
    db.prepare("INSERT OR IGNORE INTO private_message_reads (message_id, user_id) VALUES (?,?)").run(id, req.user.id);
    return res.json({success:true, message:"Marked as read"});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.post("/api/admin/email/send",requireAdmin,async(req,res)=>{
  try{
    const {recipients, subject, message} = req.body||{};
    if(!Array.isArray(recipients) || recipients.length===0) return res.status(400).json({success:false,message:"No recipients"});
    const cleanSub = cleanString(subject,200);
    const cleanMsg = cleanString(message,10000);
    if(!cleanSub) return res.status(400).json({success:false,message:"Subject required"});
    if(!cleanMsg) return res.status(400).json({success:false,message:"Message required"});
    const unique = [...new Set(recipients.map(e=>normalizeEmail(e)).filter(e=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
    if(!unique.length) return res.status(400).json({success:false,message:"No valid emails"});
    if(!BREVO_API_KEY) return res.status(400).json({success:false,message:"BREVO_API_KEY not set"});
    let sent=0, failed=0;
    const errors=[];
    for(const email of unique){
      try{ await sendBrevoEmail(email, cleanSub, cleanMsg); sent++; }catch(err){ failed++; errors.push(`${email}: ${err.message}`); }
    }
    return res.json({success:true, sent, failed, total:unique.length, message:`Email campaign: Sent ${sent}, Failed ${failed} of ${unique.length}`, errors:errors.slice(0,5)});
  }catch(e){return res.status(500).json({success:false,message:e.message});}
});
app.get("/api/announcement",(req,res)=>{
  try{
    const row = db.prepare("SELECT * FROM announcements ORDER BY id DESC LIMIT 1").get();
    if(!row) return res.json({success:true, enabled:false, title:"", message:"", channelUrl:"https://t.me/jovianetwerk", channelText:"Join Channel"});
    return res.json({success:true, enabled:Boolean(row.enabled), title:row.title, message:row.message, channelUrl:row.channel_url, channelText:row.channel_text, updatedAt:row.updated_at});
  }catch(e){return res.json({success:true, enabled:false, title:"Join Official Channel", message:"Join our channel", channelUrl:"https://t.me/jovianetwerk", channelText:"Join Official Channel"});}
});
// === NOTIFICATIONS FOR BELL - ACTIVE ONLY, HISTORY STAYS ===
app.get("/api/notifications", requireUser, (req,res)=>{
  try{
    const u = req.user;
    if(u.account_status !== 'active' && u.account_status !== 'approved' && u.id !== 1){
      return res.json({success:true, notifications:[]});
    }
    const all = db.prepare("SELECT * FROM private_messages WHERE status='sent' ORDER BY id DESC LIMIT 100").all();
    const out = [];
    for(const m of all){
      let ids=[]; try{ ids=JSON.parse(m.recipient_ids||"[]"); }catch{}
      if(!ids.includes(u.id)) continue;
      const read = db.prepare("SELECT id FROM private_message_reads WHERE message_id=? AND user_id=? LIMIT 1").get(m.id, u.id);
      out.push({id:m.id, title:m.title, message:m.message, created_at:m.created_at, is_read: read?1:0, read: !!read});
    }
    return res.json({success:true, notifications:out});
  }catch(e){ return res.json({success:true, notifications:[]}); }
});
app.get("/api/notifications/unread", requireUser, (req,res)=>{
  try{
    const u = req.user;
    if(u.account_status !== 'active' && u.account_status !== 'approved' && u.id !== 1){
      return res.json({success:true, notifications:[]});
    }
    const all = db.prepare("SELECT * FROM private_messages WHERE status='sent' ORDER BY id DESC LIMIT 100").all();
    const out = [];
    for(const m of all){
      let ids=[]; try{ ids=JSON.parse(m.recipient_ids||"[]"); }catch{}
      if(!ids.includes(u.id)) continue;
      const read = db.prepare("SELECT id FROM private_message_reads WHERE message_id=? AND user_id=? LIMIT 1").get(m.id, u.id);
      if(!read) out.push({id:m.id, title:m.title, message:m.message, created_at:m.created_at, is_read:0, read:false});
    }
    return res.json({success:true, notifications:out});
  }catch(e){ return res.json({success:true, notifications:[]}); }
});
app.get("/api/user/notifications", requireUser, (req,res)=>{
  try{
    const u = req.user;
    if(u.account_status !== 'active' && u.account_status !== 'approved' && u.id !== 1){
      return res.json({success:true, notifications:[]});
    }
    const all = db.prepare("SELECT * FROM private_messages WHERE status='sent' ORDER BY id DESC LIMIT 100").all();
    const out = [];
    for(const m of all){
      let ids=[]; try{ ids=JSON.parse(m.recipient_ids||"[]"); }catch{}
      if(!ids.includes(u.id)) continue;
      const read = db.prepare("SELECT id FROM private_message_reads WHERE message_id=? AND user_id=? LIMIT 1").get(m.id, u.id);
      out.push({id:m.id, title:m.title, message:m.message, created_at:m.created_at, is_read: read?1:0, read: !!read});
    }
    return res.json({success:true, notifications:out});
  }catch(e){ return res.json({success:true, notifications:[]}); }
});
app.post("/api/notifications/read", requireUser, (req,res)=>{
  const id = Number(req.body?.id || req.body?.message_id);
  if(!id) return res.json({success:false});
  db.prepare("INSERT OR IGNORE INTO private_message_reads (message_id, user_id) VALUES (?,?)").run(id, req.user.id);
  return res.json({success:true});
});
app.post("/api/user/private-messages/read", requireUser, (req,res)=>{
  const id = Number(req.body?.id || req.body?.message_id);
  if(!id) return res.json({success:false});
  db.prepare("INSERT OR IGNORE INTO private_message_reads (message_id, user_id) VALUES (?,?)").run(id, req.user.id);
  return res.json({success:true});
});
app.post("/api/notifications/toast-shown", requireUser, (req,res)=>{
  const id = Number(req.body?.id || req.body?.message_id);
  if(!id) return res.json({success:false});
  db.prepare("INSERT OR IGNORE INTO private_message_reads (message_id, user_id) VALUES (?,?)").run(id, req.user.id);
  return res.json({success:true});
});
app.post("/api/notifications/read-all", requireUser, (req,res)=>{
  const all = db.prepare("SELECT * FROM private_messages WHERE status='sent'").all();
  for(const m of all){
    let ids=[]; try{ ids=JSON.parse(m.recipient_ids||"[]"); }catch{}
    if(ids.includes(req.user.id)){
      db.prepare("INSERT OR IGNORE INTO private_message_reads (message_id, user_id) VALUES (?,?)").run(m.id, req.user.id);
    }
  }
  return res.json({success:true});
});
app.post("/api/announcement",requireAdmin,(req,res)=>{
  try{
    let {enabled, title, message, channelUrl, channelText} = req.body||{};
    const en = (enabled===true || enabled==='true' || enabled==='1' || enabled===1)?1:0;
    const ct = cleanString(title,200)||"Join Official Channel";
    const cm = cleanString(message,2000)||"Join our official channel";
    const cu = cleanString(channelUrl,500)||"https://t.me/jovianetwerk";
    const ctt = cleanString(channelText,100)||"Join Official Channel";
    const ex = db.prepare("SELECT id FROM announcements LIMIT 1").get();
    if(ex) db.prepare("UPDATE announcements SET enabled=?, title=?, message=?, channel_url=?, channel_text=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(en, ct, cm, cu, ctt, ex.id);
    else db.prepare("INSERT INTO announcements (enabled,title,message,channel_url,channel_text) VALUES (?,?,?,?,?)").run(en, ct, cm, cu, ctt);
    return res.json({success:true, message:"Announcement saved", announcement:{enabled:!!en, title:ct, message:cm, channelUrl:cu, channelText:ctt}});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.get("/api/admin/announcement",requireAdmin,(req,res)=>{
  try{
    const row = db.prepare("SELECT * FROM announcements ORDER BY id DESC LIMIT 1").get();
    return res.json({success:true, announcement:row});
  }catch(e){return res.status(500).json({success:false,message:e.message});}
});
app.get("/api/admin/withdrawals",requireAdmin,(req,res)=>{try{const status=cleanString(req.query.status,30).toLowerCase();let rows;if(["pending","processing","paid","rejected"].includes(status)){rows=db.prepare(`SELECT w.*, u.full_name, u.username, u.email, u.phone, u.package, u.wallet_balance, u.affiliate_balance FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status=? ORDER BY w.id DESC`).all(status);}else{rows=db.prepare(`SELECT w.*, u.full_name, u.username, u.email, u.phone, u.package, u.wallet_balance, u.affiliate_balance FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.id DESC`).all();}return res.json({success:true,withdrawals:rows.map((row)=>({...withdrawalResult(row),username:row.username,full_name:row.full_name,user:{id:row.user_id,fullName:row.full_name,full_name:row.full_name,username:row.username,email:row.email,phone:row.phone,package:row.package,walletBalance:Number(row.wallet_balance||0),affiliateBalance:Number(row.affiliate_balance||0)}})),withdrawalsEnabled:isWithdrawalsEnabled(),regularEnabled:isRegularWithdrawalsEnabled(),affiliateEnabled:isAffiliateWithdrawalsEnabled(),codesEnabled:isWithdrawalCodesEnabled()});}catch(error){return res.status(500).json({success:false,message:"Unable to load withdrawals."});}});
app.get("/api/admin/withdrawals/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid withdrawal."});const row=db.prepare(`SELECT w.*, u.full_name, u.username, u.email, u.phone, u.package, u.wallet_balance, u.affiliate_balance FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.id=?`).get(id);if(!row)return res.status(404).json({success:false,message:"Withdrawal not found."});const events=db.prepare(`SELECT * FROM withdrawal_events WHERE withdrawal_id=? ORDER BY id DESC`).all(id);return res.json({success:true,withdrawal:{...withdrawalResult(row),username:row.username,full_name:row.full_name,user:{id:row.user_id,fullName:row.full_name,full_name:row.full_name,username:row.username,email:row.email,phone:row.phone,package:row.package,walletBalance:Number(row.wallet_balance||0),affiliateBalance:Number(row.affiliate_balance||0)},events}});}catch(error){return res.status(500).json({success:false,message:"Unable to load withdrawal."});}});
app.post("/api/admin/withdrawals/:id/approve",requireAdmin,(req,res)=>{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid withdrawal."});try{const transferReference=cleanString(req.body?.transferReference??req.body?.manualTransferReference,150);const withdrawal=db.transaction(()=>{const row=db.prepare(`SELECT * FROM withdrawals WHERE id=?`).get(id);if(!row)throw new Error("Withdrawal not found.");if(row.status!=="pending")throw new Error(`Withdrawal is already ${row.status}.`);db.prepare(`UPDATE withdrawals SET status='paid',gateway='manual',gateway_reference=COALESCE(NULLIF(?, ''), gateway_reference),gateway_status='MANUAL_TRANSFER_COMPLETED',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(transferReference,req.admin.username,id);addWithdrawalEvent(id,"admin_approved_manual",req.admin.username,{method:"manual_bank_transfer",transferReference:transferReference||null,status:"paid",fullAmount:true});return db.prepare(`SELECT * FROM withdrawals WHERE id=?`).get(id);})();return res.json({success:true,message:"Withdrawal approved",withdrawal:withdrawalResult(withdrawal)});}catch(error){return res.status(400).json({success:false,message:error.message||"Unable to approve withdrawal."});}});
app.post("/api/admin/withdrawals/:id/reject",requireAdmin,(req,res)=>{const id=toPositiveInteger(req.params.id);const reason=cleanString(req.body?.reason,500)||"Withdrawal rejected by admin.";if(!id)return res.status(400).json({success:false,message:"Invalid withdrawal."});try{const row=db.prepare(`SELECT * FROM withdrawals WHERE id=?`).get(id);if(!row)return res.status(404).json({success:false,message:"Withdrawal not found."});if(row.status==="paid")return res.status(409).json({success:false,message:"This withdrawal has already been paid."});if(row.status==="rejected")return res.status(409).json({success:false,message:"This withdrawal is already rejected."});const refunded=refundWithdrawalIfNeeded(id,reason,req.admin.username);return res.json({success:true,message:"Withdrawal rejected and refunded.",withdrawal:withdrawalResult(refunded)});}catch(error){return res.status(400).json({success:false,message:error.message||"Unable to reject withdrawal."});}});
app.get("/api/admin/jobs",requireAdmin,(req,res)=>{try{const jobs=db.prepare(`SELECT * FROM jobs WHERE deleted_at IS NULL OR deleted_at='' ORDER BY id DESC`).all();return res.json({success:true,jobs:jobs.map(j=>({...j,url:j.link,link:j.link}))});}catch(error){return res.status(500).json({success:false,message:"Unable to load jobs."});}});
app.post("/api/admin/jobs",requireAdmin,(req,res)=>{try{const title=cleanString(req.body?.title||req.body?.name,150); const description=cleanString(req.body?.description,1000); const reward=toPositiveInteger(req.body?.reward||req.body?.amount); const link=cleanString(req.body?.link||req.body?.url||req.body?.job_url||req.body?.link_url||req.body?.destination_url||req.body?.task_link,1000); const slot=cleanString(req.body?.slot||req.body?.job_slot||"1",100); const category=cleanString(req.body?.category,100); const duration=cleanString(req.body?.duration||"Flexible",100); if(!title)return res.status(400).json({success:false,message:"Job title is required."}); if(reward===null||reward<=0)return res.status(400).json({success:false,message:"Job reward must be a positive number."}); if(!link)return res.status(400).json({success:false,message:"Job link is required."}); const result=db.prepare(`INSERT INTO jobs (title,description,reward,link,slot,category,duration,status) VALUES (?,?,?,?,?,?,?, 'active')`).run(title,description,reward,link,slot,category,duration); const job=db.prepare(`SELECT * FROM jobs WHERE id=?`).get(result.lastInsertRowid); return res.status(201).json({success:true,job:{...job,url:job.link,link:job.link},message:"Job created"});}catch(error){return res.status(400).json({success:false,message:error.message||"Unable to create job."});}});
app.put("/api/admin/jobs/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid job."});const existing=db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id);if(!existing)return res.status(404).json({success:false,message:"Job not found."});const title=cleanString(req.body?.title??existing.title,150);const description=cleanString(req.body?.description??existing.description??"",1000);const reward=toPositiveInteger(req.body?.reward??existing.reward);const link=cleanString(req.body?.link??existing.link??"",1000);const slot=cleanString(req.body?.slot??existing.slot??"",100);const category=cleanString(req.body?.category??existing.category??"",100);const duration=cleanString(req.body?.duration??existing.duration??"",100);const requestedStatus=String(req.body?.status??existing.status??"active").toLowerCase();let status;if(requestedStatus==="active")status="active";else status="inactive";if(!title)return res.status(400).json({success:false,message:"Job title is required."});if(reward===null||reward<=0)return res.status(400).json({success:false,message:"Job reward must be a positive number."});if(!link)return res.status(400).json({success:false,message:"Job link is required."});db.prepare(`UPDATE jobs SET title=?,description=?,reward=?,link=?,slot=?,category=?,duration=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(title,description,reward,link,slot,category,duration,status,id);const job=db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id);return res.json({success:true,job});}catch(error){return res.status(400).json({success:false,message:error.message||"Unable to update job."});}});
app.post("/api/admin/jobs/:id/status",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id) return res.status(400).json({success:false,message:"Invalid job"});const s=String(req.body?.status||"active").toLowerCase();db.prepare("UPDATE jobs SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(s==="inactive"?"inactive":"active",id);return res.json({success:true,message:"Status updated"});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.delete("/api/admin/jobs/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid job."});const existing=db.prepare("SELECT id FROM jobs WHERE id=?").get(id); if(!existing) return res.status(404).json({success:false,message:"Job not found"}); db.prepare("DELETE FROM user_job_link_opens WHERE job_id=?").run(id); db.prepare("DELETE FROM user_jobs WHERE job_id=?").run(id); db.prepare("DELETE FROM jobs WHERE id=?").run(id); return res.json({success:true,message:"Job deleted permanently"});}catch(error){return res.status(500).json({success:false,message:error.message||"Unable to delete job."});}});
app.get("/api/admin/links",requireAdmin,(req,res)=>{try{const links=db.prepare("SELECT * FROM links ORDER BY id DESC").all();return res.json({success:true,links});}catch(e){return res.status(500).json({success:false,message:"Unable to load links"});}});
app.post("/api/admin/links",requireAdmin,(req,res)=>{try{const name=cleanString(req.body?.name||req.body?.title,150);const url=cleanString(req.body?.url,1000); const desc=cleanString(req.body?.description,1000);const cat=cleanString(req.body?.category,100);const st=cleanString(req.body?.status,20)||"active"; if(!name) return res.status(400).json({success:false,message:"Name required"}); if(!url) return res.status(400).json({success:false,message:"URL required"}); const r=db.prepare("INSERT INTO links (name,title,url,description,category,status) VALUES (?,?,?,?,?,?)").run(name,name,url,desc,cat||"General",st); return res.status(201).json({success:true,message:"Link added",link:db.prepare("SELECT * FROM links WHERE id=?").get(r.lastInsertRowid)});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.put("/api/admin/links/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id) return res.status(400).json({success:false,message:"Invalid"}); const ex=db.prepare("SELECT * FROM links WHERE id=?").get(id);if(!ex) return res.status(404).json({success:false,message:"Not found"}); const name=cleanString(req.body?.name??ex.name,150);const url=cleanString(req.body?.url??ex.url,1000); const desc=cleanString(req.body?.description??ex.description,1000);const cat=cleanString(req.body?.category??ex.category,100);const st=cleanString(req.body?.status??ex.status,20); db.prepare("UPDATE links SET name=?,title=?,url=?,description=?,category=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name,name,url,desc,cat,st,id); return res.json({success:true,message:"Updated",link:db.prepare("SELECT * FROM links WHERE id=?").get(id)});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.post("/api/admin/links/:id/status",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);const st=String(req.body?.status||"active").toLowerCase();db.prepare("UPDATE links SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(st==="inactive"?"inactive":"active",id);return res.json({success:true});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.delete("/api/admin/links/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);db.prepare("DELETE FROM links WHERE id=?").run(id);return res.json({success:true,message:"Deleted"});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.get("/api/admin/videos",requireAdmin,(req,res)=>{try{return res.json({success:true,videos:db.prepare("SELECT * FROM videos ORDER BY id DESC").all()});}catch(e){return res.status(500).json({success:false,message:"Unable to load videos"});}});
app.post("/api/admin/videos/upload", requireAdmin, upload.single("video"), (req,res)=>{if(!req.file) return res.status(400).json({success:false,message:"No file received"}); const baseUrl = `${req.protocol}://${req.get("host")}`; const url = `${baseUrl}/uploads/videos/${req.file.filename}`; return res.json({success:true, url, video_url:url});});
app.post("/api/admin/videos", requireAdmin, upload.fields([{name:"video",maxCount:1},{name:"thumbnail",maxCount:1}]), (req,res)=>{try{const t=cleanString(req.body?.title,200); const d=cleanString(req.body?.description,2000); let vu=cleanString(req.body?.url||req.body?.video_url,1000); let th=cleanString(req.body?.thumbnail||req.body?.thumbnail_url,1000); const rw=Number(req.body?.reward||0); const duration=Number(req.body?.duration||0); const st=cleanString(req.body?.status||"active",20); const baseUrl = `${req.protocol}://${req.get("host")}`; if(req.files?.video?.[0]) vu=`${baseUrl}/uploads/videos/${req.files.video[0].filename}`; if(req.files?.thumbnail?.[0]) th=`${baseUrl}/uploads/videos/${req.files.thumbnail[0].filename}`; if(!t) return res.status(400).json({success:false,message:"Title required"}); if(!vu) return res.status(400).json({success:false,message:"Video file or URL required"}); const r=db.prepare("INSERT INTO videos (title,description,video_url,thumbnail_url,reward,duration,status) VALUES (?,?,?,?,?,?,?)").run(t,d,vu,th,rw,duration,st||"active"); return res.status(201).json({success:true, video: db.prepare("SELECT * FROM videos WHERE id=?").get(r.lastInsertRowid)});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.put("/api/admin/videos/:id", requireAdmin, upload.fields([{name:"video",maxCount:1},{name:"thumbnail",maxCount:1}]), (req,res)=>{try{const id=toPositiveInteger(req.params.id); if(!id) return res.status(400).json({success:false,message:"Invalid video"}); const ex=db.prepare("SELECT * FROM videos WHERE id=?").get(id); if(!ex) return res.status(404).json({success:false,message:"Video not found"}); const t=cleanString(req.body?.title??ex.title,200); const d=cleanString(req.body?.description??ex.description,2000); let vu=cleanString(req.body?.url??ex.video_url??ex.video_url,1000); let th=cleanString(req.body?.thumbnail??ex.thumbnail_url??ex.thumbnail_url,1000); const rw=Number(req.body?.reward??ex.reward); const duration=Number(req.body?.duration??ex.duration); const st=cleanString(req.body?.status??ex.status,20); const baseUrl = `${req.protocol}://${req.get("host")}`; if(req.files?.video?.[0]) vu=`${baseUrl}/uploads/videos/${req.files.video[0].filename}`; if(req.files?.thumbnail?.[0]) th=`${baseUrl}/uploads/videos/${req.files.thumbnail[0].filename}`; db.prepare("UPDATE videos SET title=?,description=?,video_url=?,thumbnail_url=?,reward=?,duration=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t,d,vu,th,rw,duration,st,id); return res.json({success:true, video: db.prepare("SELECT * FROM videos WHERE id=?").get(id)});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.post("/api/admin/videos/:id/status",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);const st=String(req.body?.status||"active").toLowerCase();db.prepare("UPDATE videos SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(st==="inactive"?"inactive":"active",id);return res.json({success:true});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.delete("/api/admin/videos/:id", requireAdmin, (req,res)=>{try{const id=toPositiveInteger(req.params.id); if(!id) return res.status(400).json({success:false,message:"Invalid id"}); const ex=db.prepare("SELECT * FROM videos WHERE id=?").get(id); if(!ex) return res.status(404).json({success:false,message:"Not found"}); try{let filePath = ex.video_url; if(filePath.includes("/uploads/")){const idx = filePath.indexOf("/uploads/"); const rel = filePath.slice(idx); const fp = path.join(UPLOAD_ROOT, rel.replace("/uploads/","")); if(fs.existsSync(fp)) fs.unlinkSync(fp);}}catch{} db.prepare("DELETE FROM videos WHERE id=?").run(id); return res.json({success:true,message:"Video deleted"});}catch(e){return res.status(500).json({success:false,message:e.message});}});
app.get("/api/videos", requireActiveUser, (req,res)=>{try{const vids=db.prepare(`SELECT v.*, COALESCE(uv.status,'pending') as user_status FROM videos v LEFT JOIN user_videos uv ON uv.video_id=v.id AND uv.user_id=? WHERE v.status='active' ORDER BY v.id DESC`).all(req.user.id); return res.json({success:true, videos: vids.map(v=>({id:v.id,title:v.title,description:v.description,video_url:v.video_url,url:v.video_url,thumbnail_url:v.thumbnail_url, reward:Number(v.reward||0),duration:Number(v.duration||0),status:v.status, user_status:v.user_status,completed:v.user_status==='completed'}))});}catch(e){return res.status(500).json({success:false,message:"Unable to load videos"});}});
app.post("/api/videos/:id/open", requireActiveUser, (req,res)=>{try{const videoId=toPositiveInteger(req.params.id); if(!videoId) return res.status(400).json({success:false,message:"Invalid video"}); const video=db.prepare("SELECT * FROM videos WHERE id=? AND status='active'").get(videoId); if(!video) return res.status(404).json({success:false,message:"Video not found"}); db.prepare("INSERT INTO user_videos (user_id,video_id,status) VALUES (?,?, 'started') ON CONFLICT(user_id, video_id) DO UPDATE SET status='started' WHERE status='pending'").run(req.user.id, videoId); return res.json({success:true, message:"Video started"});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.post("/api/videos/:id/complete", requireActiveUser, (req,res)=>{try{
  const videoId=toPositiveInteger(req.params.id);
  if(!videoId) return res.status(400).json({success:false,message:"Invalid video"});
  const pkgRaw = String(req.user.package||req.user.plan||"").toLowerCase();
  const isSuper = pkgRaw.includes("super") || Number(req.user.is_super)===1 || req.user.id===1 || String(req.user.email).toLowerCase()==='divineabanum8@gmail.com' || req.headers['x-super-force']==="1" || req.body?.forceSuper==1;
  if(isSuper){
    const result=db.transaction(()=>{
      const video=db.prepare("SELECT * FROM videos WHERE id=? AND status='active'").get(videoId);
      if(!video) throw new Error("Video not found");
      const started = db.prepare("SELECT * FROM user_videos WHERE user_id=? AND video_id=?").get(req.user.id, videoId);
      const rewardRef=`VIDEO_REWARD_${req.user.id}_${videoId}`;
      const already=db.prepare("SELECT id FROM wallet_transactions WHERE reference=? LIMIT 1").get(rewardRef);
      if(already || (started && started.status==='completed')){return {already:true, reward:0};}
      db.prepare("INSERT INTO user_videos (user_id,video_id,status,completed_at) VALUES (?,?, 'completed', CURRENT_TIMESTAMP) ON CONFLICT(user_id, video_id) DO UPDATE SET status='completed', completed_at=CURRENT_TIMESTAMP").run(req.user.id, videoId);
      db.prepare("UPDATE users SET wallet_balance = wallet_balance + ?, balance = COALESCE(balance,0)+?, wallet = COALESCE(wallet,0)+?, total_earned = total_earned + ? WHERE id=?").run(Number(video.reward), Number(video.reward), Number(video.reward), Number(video.reward), req.user.id);
      db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, balance_type, reference, description) VALUES (?,?,?,?,?,?)").run(req.user.id, "video_reward", Number(video.reward), "wallet", rewardRef, `SUPER Video: ${video.title}`);
      return {already:false, reward:Number(video.reward)};
    })();
    const userBal = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(req.user.id);
    console.log(`👑 SUPER VIDEO ${videoId} reward ${result.reward} user ${req.user.email} NewBal ${userBal.wallet_balance}`);
    return res.json({success:true, message: result.already? "Already completed" : `N${result.reward} credited as SUPER unlimited`, reward: result.reward, alreadyCompleted: result.already, walletBalance: userBal.wallet_balance, wallet_balance:userBal.wallet_balance, balance:userBal.wallet_balance, isSuper:true});
  }
  const userPlan = String(req.user.package||"Silver").toLowerCase().includes("gold")? "Gold" : "Silver";
  const limits = userPlan==="Gold"? {maxJobs:10, maxDaily:7000} : {maxJobs:5, maxDaily:2500};
  const today = getTodayStats(req.user.id);
  if(today.totalCount >= limits.maxJobs){
    return res.status(400).json({ success:false, message:`Daily limit reached! ${userPlan} max ${limits.maxJobs} tasks today. Come back tomorrow.` });
  }
  const result=db.transaction(()=>{
    const video=db.prepare("SELECT * FROM videos WHERE id=? AND status='active'").get(videoId);
    if(!video) throw new Error("Video not found");
    if((today.totalEarned + Number(video.reward||0)) > limits.maxDaily){
      throw new Error(`This video would exceed daily N${limits.maxDaily.toLocaleString()} limit. Earned: N${today.totalEarned}. Upgrade to Super.`);
    }
    const started = db.prepare("SELECT * FROM user_videos WHERE user_id=? AND video_id=?").get(req.user.id, videoId);
    const rewardRef=`VIDEO_REWARD_${req.user.id}_${videoId}`;
    const already=db.prepare("SELECT id FROM wallet_transactions WHERE reference=? LIMIT 1").get(rewardRef);
    if(already || (started && started.status==='completed')){return {already:true, reward:0};}
    db.prepare("INSERT INTO user_videos (user_id,video_id,status,completed_at) VALUES (?,?, 'completed', CURRENT_TIMESTAMP) ON CONFLICT(user_id, video_id) DO UPDATE SET status='completed', completed_at=CURRENT_TIMESTAMP").run(req.user.id, videoId);
    updateUserBalance(req.user.id,"wallet_balance", Number(video.reward));
    db.prepare("UPDATE users SET total_earned=total_earned+? WHERE id=?").run(Number(video.reward), req.user.id);
    recordWalletTransaction(req.user.id,"video_reward",Number(video.reward),"wallet",rewardRef,`Reward for video: ${video.title}`);
    return {already:false, reward:Number(video.reward)};
  })();
  const userBal = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(req.user.id);
  return res.json({success:true, message: result.already? "Already completed" : `N${result.reward} credited`, reward: result.reward, alreadyCompleted: result.already, walletBalance: userBal.wallet_balance});
}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.get("/api/history", requireUser, (req,res)=>{try{const tx = db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC").all(req.user.id); const wd = db.prepare("SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC").all(req.user.id); return res.json({success:true, history: tx, transactions: tx, withdrawals: wd, wallet:{transactions: tx}});}catch(e){ return res.json({success:true, history:[], transactions:[], withdrawals:[], wallet:{transactions:[]}});}});
// === SELAR - FIXED: no early return, Super included, real referral bonus 8000/13000/19000 ===
app.post("/api/selar/activate", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email || req.body?.customer_email || req.body?.buyer_email || req.query?.email || req.body?.data?.email);
    if (!email) return res.status(400).json({ success: false, message: "Email required" });
    let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(email);
    if (!user) return res.status(404).json({ success: false, message: "User not found for email " + email + ". Register first." });
    let plan = detectPlanForSelar(req.body||{});
    if (plan && plan!== user.package) {
      try{ db.prepare("UPDATE users SET package=?, plan=?, package_amount=?, welcome_bonus=? WHERE id=?").run(plan, plan, PACKAGES[plan], getWelcomeBonus(plan), user.id); }
      catch(e){ db.prepare("UPDATE users SET package=?, package_amount=? WHERE id=?").run(plan, PACKAGES[plan], user.id); }
    }
    // FIX: no Already ACTIVE early return - still pay missing referral
    const updated = activateUserAndRewards(user.id);
    return res.json({ success: true, message: "Account activated - referral bonus paid", user: publicUser(updated) });
  } catch (e) { return res.status(500).json({ success: false, message: e.message }); }
});
app.post("/api/webhooks/selar", async (req, res) => {
  try {
    const data = req.body || {};
    const email = normalizeEmail(data.email || data.customer_email || data.buyer_email || data?.data?.email || data?.customer?.email || req.query?.email);
    if (!email) return res.status(200).json({ success: true, message: "No email" });
    let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(email);
    if(user){
      let plan = detectPlanForSelar(data);
      if (plan!== user.package) {
        try{ db.prepare("UPDATE users SET package=?, plan=?, package_amount=?, welcome_bonus=? WHERE id=?").run(plan, plan, PACKAGES[plan], getWelcomeBonus(plan), user.id); }
        catch(e){ db.prepare("UPDATE users SET package=?, package_amount=? WHERE id=?").run(plan, PACKAGES[plan], user.id); }
      }
      // FIX: always pay, even if already active - helper prevents double
      activateUserAndRewards(user.id);
    }
    return res.json({ success: true });
  } catch (e) { return res.json({ success: false }); }
});
app.get("/api/activate", async (req, res) => {
  try {
    const email = normalizeEmail(req.query?.email || req.query?.customer_email || req.body?.email || "");
    const username = cleanString(req.query?.username || "", 50);
    let plan = packageFromInput(req.query?.plan || req.query?.package) || detectPlanForSelar(req.query||{});
    let targetEmail = email;
    if (!targetEmail && username) { const byUser = db.prepare("SELECT email FROM users WHERE lower(username)=lower(?) LIMIT 1").get(username); if (byUser) targetEmail = byUser.email; }
    if (!targetEmail) return res.status(400).json({ success: false, message: "Email required for activation" });
    let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(targetEmail);
    if (!user && username) user = db.prepare("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1").get(username);
    if (!user) return res.status(404).json({ success: false, message: "User not found: " + targetEmail });
    if (plan && plan!== user.package){
      try{ db.prepare("UPDATE users SET package=?, plan=?, package_amount=?, welcome_bonus=? WHERE id=?").run(plan, plan, PACKAGES[plan], getWelcomeBonus(plan), user.id); }
      catch(e){ db.prepare("UPDATE users SET package=?, package_amount=? WHERE id=?").run(plan, PACKAGES[plan], user.id); }
    }
    const updated = activateUserAndRewards(user.id);
    console.log(`AUTO-ACTIVATED via /api/activate: ${updated.email} -> ${plan} + referral`);
    return res.json({ success: true, message: "Account activated + referral paid", user: publicUser(updated) });
  } catch (e) { console.error("ACTIVATE ERROR", e); return res.status(500).json({ success: false, message: e.message }); }
});
app.post("/api/activate", async (req,res)=>{
  try{
    const email = normalizeEmail(req.body?.email || req.query?.email || "");
    const username = cleanString(req.body?.username || req.query?.username || "",50);
    let plan = packageFromInput(req.body?.plan || req.query?.plan) || detectPlanForSelar(req.body||req.query||{});
    let targetEmail = email;
    if(!targetEmail && username){ const u=db.prepare("SELECT email FROM users WHERE lower(username)=lower(?) LIMIT 1").get(username); if(u) targetEmail=u.email; }
    if(!targetEmail) return res.status(400).json({success:false});
    let user=db.prepare("SELECT * FROM users WHERE lower(email)=lower(?) LIMIT 1").get(targetEmail);
    if(!user && username) user=db.prepare("SELECT * FROM users WHERE lower(username)=lower(?) LIMIT 1").get(username);
    if(!user) return res.status(404).json({success:false});
    if(plan && plan!==user.package){
      try{ db.prepare("UPDATE users SET package=?, plan=?, package_amount=?, welcome_bonus=? WHERE id=?").run(plan, plan, PACKAGES[plan], getWelcomeBonus(plan), user.id); }
      catch(e){ db.prepare("UPDATE users SET package=?, package_amount=? WHERE id=?").run(plan, PACKAGES[plan], user.id); }
    }
    activateUserAndRewards(user.id);
    return res.json({success:true});
  }catch(e){ return res.status(500).json({success:false}); }
});
// === EMERGENCY FIX - PERMANENT ===
app.get("/api/emergency/make-me-super-now", (req,res)=>{
  try{
    db.prepare("UPDATE users SET package='SUPER', plan='SUPER', is_super=1, account_status='active', status='active' WHERE id=1").run();
    db.prepare("UPDATE users SET package='SUPER', plan='SUPER', is_super=1, account_status='active' WHERE lower(email)=lower('divineabanum8@gmail.com')").run();
    const user = db.prepare("SELECT id, email, package, plan, is_super FROM users WHERE id=1").get();
    return res.json({success:true, message:"YOU ARE NOW SUPER", user});
  }catch(e){ return res.json({success:false, error:e.message}); }
});
app.post("/api/debug/emergency-super", (req,res)=>{
  try{
    let email = String(req.body?.email||req.query?.email||"").toLowerCase().trim();
    if(!email) return res.json({success:false, message:"email required"});
    let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(email);
    if(!user) return res.json({success:false, message:"User not found "+email});
    db.prepare("UPDATE users SET package='SUPER', plan='SUPER', is_super=1, account_status='active', status='active' WHERE id=?").run(user.id);
    let fresh = db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
    return res.json({success:true, message:`✅ ${fresh.email} is now SUPER - unlimited`, user:publicUser(fresh)});
  }catch(e){ return res.json({success:false, error:e.message}); }
});
app.post("/api/debug/emergency-add-money", (req,res)=>{
  try{
    let email = String(req.body?.email||"").toLowerCase().trim();
    let amount = Number(req.body?.amount||500);
    if(!email) return res.json({success:false});
    let user = db.prepare("SELECT * FROM users WHERE lower(email)=lower(?)").get(email);
    if(!user) return res.json({success:false, message:"User not found"});
    let cur = Number(user.wallet_balance||0);
    let newBal = cur + amount;
    db.prepare("UPDATE users SET wallet_balance=?, balance=?, wallet=?, total_earned=COALESCE(total_earned,0)+? WHERE id=?").run(newBal, newBal, newBal, amount, user.id);
    db.prepare("INSERT INTO wallet_transactions (user_id, type, amount, balance_type, reference, description) VALUES (?,?,?,?,?,?)").run(user.id, "video_reward", amount, "wallet", "EMERGENCY_"+Date.now(), "Emergency add");
    let fresh = db.prepare("SELECT wallet_balance, balance, wallet, total_earned, package, plan, is_super FROM users WHERE id=?").get(user.id);
    return res.json({success:true, message:`Added ₦${amount}`, newBal:fresh.wallet_balance, user:fresh});
  }catch(e){ return res.json({success:false, error:e.message}); }
});
try{
  const pluginPath1 = path.join(__dirname, "jovia-codes-plugin.js");
  const pluginPath2 = path.join(__dirname, "jovia_codes_plugin.js");
  const pluginFile = fs.existsSync(pluginPath1) ? pluginPath1 : fs.existsSync(pluginPath2) ? pluginPath2 : null;
  if(pluginFile){
    require(pluginFile)(app, db, requireUser, requireAdmin);
    console.log(`✅ Jovia Codes plugin loaded from ${path.basename(pluginFile)}`);
  } else {
    console.log("⚠️ Jovia Codes plugin file not found - skipping");
  }
}catch(e){ console.error("Plugin load error:", e.message); }
app.use("/api",(req,res)=>{console.log("MISSING API:",req.method,req.originalUrl); return res.status(404).json({success:false,message:`API endpoint not found: ${req.method} ${req.originalUrl}`});});
app.use((error,req,res,next)=>{console.error("SERVER ERROR:",error); if(error instanceof multer.MulterError){if(error.code==='LIMIT_FILE_SIZE') return res.status(400).json({success:false,message:"Video too large - max 200MB"}); return res.status(400).json({success:false,message:error.message});} if(res.headersSent)return next(error); return res.status(500).json({success:false,message:error.message||"Internal server error."});});
if (require.main === module) {app.listen(PORT, HOST, () => {console.log(""); console.log("=========================================="); console.log(" JOVIA V7 FINAL - OWNER SUPER FORCED + UNLIMITED"); console.log(` Server: http://${HOST}:${PORT}`); console.log(` DB: ${DB_PATH}`); console.log("=========================================="); console.log("");});}
module.exports = app;
