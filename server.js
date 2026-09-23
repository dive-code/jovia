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

// ===== FIX 1: CORS - Allow Vercel Frontend + Railway =====
app.use(cors({
  origin: function(origin, cb){
    if(!origin) return cb(null,true);
    if(origin.includes("vercel.app") || origin.includes("localhost") || origin.includes("jovia")) return cb(null,true);
    return cb(null,true);
  },
  credentials: true
}));

const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||"0.0.0.0";

// ===== FIX 2: PERSISTENCE - Railway Volume Support =====
const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.RAILWAY_VOLUME || "/app/data";
const DB_DIR = VOLUME_PATH? VOLUME_PATH : __dirname;
const DB_PATH = process.env.DB_PATH || path.join(DB_DIR,"jovia.db");

const ADMIN_USERNAME=process.env.ADMIN_USERNAME||"Divine";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"jovia@2026";
const PACKAGES=Object.freeze({Silver:9000,Gold:15000});
const WITHDRAWAL_MINIMUMS=Object.freeze({regular:30000,affiliate:20000});
const MONNIFY_BASE_URL=(process.env.MONNIFY_BASE_URL||(String(process.env.MONNIFY_ENV||"sandbox").toLowerCase()==="live"?"https://api.monnify.com":"https://sandbox.monnify.com")).replace(/\/$/,"");
const MONNIFY_API_KEY=process.env.MONNIFY_API_KEY||"";
const MONNIFY_SECRET_KEY=process.env.MONNIFY_SECRET_KEY||"";
const MONNIFY_CONTRACT_CODE=process.env.MONNIFY_CONTRACT_CODE||"";
const MONNIFY_REDIRECT_URL=process.env.MONNIFY_REDIRECT_URL||"";
const MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS=String(process.env.MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS||"true").toLowerCase()==="true";
const SILVER_WELCOME_BONUS=Math.max(0,Number(process.env.SILVER_WELCOME_BONUS||0)||0);
const GOLD_WELCOME_BONUS=Math.max(0,Number(process.env.GOLD_WELCOME_BONUS||0)||0);

const UPLOAD_ROOT = VOLUME_PATH? path.join(VOLUME_PATH, "uploads") : path.join(__dirname, "uploads");
const VIDEO_DIR = path.join(UPLOAD_ROOT, "videos");
const PUBLIC_DIR = path.join(__dirname, "public");
if(!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR,{recursive:true});
if(!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR,{recursive:true});
if(!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR,{recursive:true});

const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null, VIDEO_DIR),
  filename:(req,file,cb)=>cb(null, "vid_"+Date.now()+"_"+crypto.randomBytes(4).toString("hex")+path.extname(file.originalname||".mp4"))
});
const upload = multer({
  storage,
  limits:{fileSize: 200 * 1024 * 1024},
  fileFilter:(req,file,cb)=>{ file.mimetype.startsWith("video/")?cb(null,true):cb(new Error("Only video files allowed")); }
});

const dbDir=path.dirname(DB_PATH);if(!fs.existsSync(dbDir))fs.mkdirSync(dbDir,{recursive:true});
const db=new Database(DB_PATH);db.pragma("journal_mode = WAL");db.pragma("foreign_keys = ON");db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE, phone TEXT NOT NULL, password_hash TEXT NOT NULL, package TEXT NOT NULL DEFAULT 'Silver' CHECK(package IN ('Silver','Gold')), package_amount INTEGER NOT NULL DEFAULT 9000, welcome_bonus INTEGER NOT NULL DEFAULT 0, referrer_id INTEGER, referral_code TEXT, referrals INTEGER NOT NULL DEFAULT 0, wallet_balance INTEGER NOT NULL DEFAULT 0, affiliate_balance INTEGER NOT NULL DEFAULT 0, total_earned INTEGER NOT NULL DEFAULT 0, account_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(referrer_id) REFERENCES users(id) ON DELETE SET NULL);
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
`);

function tableExists(t){return Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1").get(t));}
function columnExists(t,c){if(!tableExists(t))return false;return db.prepare(`PRAGMA table_info(${t})`).all().some(x=>x.name===c);}
function addColumnIfMissing(t,c,d){if(!tableExists(t)||columnExists(t,c))return false;db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${d}`);return true;}
function migrateDatabase(){
  addColumnIfMissing("users","affiliate_balance","INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("users","welcome_bonus","INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("users","referrer_id","INTEGER");
  addColumnIfMissing("users","referral_code","TEXT");
  addColumnIfMissing("users","referrals","INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("users","wallet_balance","INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("users","total_earned","INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("users","account_status","TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing("jobs","description","TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("jobs","category","TEXT NOT NULL DEFAULT 'General'");
  addColumnIfMissing("jobs","slot","TEXT NOT NULL DEFAULT 'General'");
  addColumnIfMissing("jobs","reward","INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing("jobs","link","TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("jobs","duration","TEXT NOT NULL DEFAULT 'Flexible'");
  addColumnIfMissing("jobs","status","TEXT NOT NULL DEFAULT 'active'");
  addColumnIfMissing("jobs","updated_at","TEXT");
  addColumnIfMissing("jobs","deleted_at","TEXT");
  addColumnIfMissing("withdrawals","type","TEXT NOT NULL DEFAULT 'regular'");
  addColumnIfMissing("withdrawals","status","TEXT NOT NULL DEFAULT 'pending'");
  addColumnIfMissing("withdrawals","bank_name","TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("withdrawals","account_name","TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("withdrawals","account_number","TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing("withdrawals","gateway","TEXT NOT NULL DEFAULT 'manual'");
  console.log("MIGRATION COMPLETE - LINKS TABLE + REFERRAL_CODE + REFERRALS ADDED");
  try{
    const jobCount = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status='active'").get().c;
    if(jobCount === 0){
      db.exec(`INSERT INTO jobs (title, description, category, reward, link, duration, status) VALUES
      ('Story of life - Watch & Earn','Watch 5 sec to unlock ₦30,000','Videos',30000,'https://jovianetworkcom.vercel.app/videos.html','5 sec','active'),
      ('Daily Check-in','Check in daily to earn ₦500','General',500,'https://jovianetworkcom.vercel.app','Flexible','active'),
      ('Share Jovia on WhatsApp','Share your referral link','Affiliate',1000,'https://jovianetworkcom.vercel.app','Flexible','active')`);
      console.log("JOBS SEEDED - Available now 3");
    }
  }catch(e){console.log("SEED ERROR", e.message);}
  try{
    const users = db.prepare("SELECT id, username FROM users WHERE referral_code IS NULL OR referral_code=''").all();
    for(const u of users){ db.prepare("UPDATE users SET referral_code=? WHERE id=?").run(u.username.toUpperCase(), u.id); }
  }catch(e){}
}
migrateDatabase();

app.set("trust proxy",1);
app.use(express.json({limit:"10mb",verify(req,res,buf){req.rawBody=Buffer.from(buf);}}));
app.use(express.urlencoded({extended:true,limit:"10mb"}));
app.use("/uploads", express.static(UPLOAD_ROOT));
app.use(express.static(PUBLIC_DIR));
app.use(express.static(__dirname));
app.get("/",(req,res)=>{
  const p1=path.join(PUBLIC_DIR,"index.html");
  const p2=path.join(__dirname,"index.html");
  if(fs.existsSync(p1)) return res.sendFile(p1);
  if(fs.existsSync(p2)) return res.sendFile(p2);
  res.status(404).send("index.html not found");
});
app.get(/.*\.db$/,function(req,res){return res.status(403).send("Forbidden");});
app.get(/.*\.env$/,function(req,res){return res.status(403).send("Forbidden");});
app.get("/server.js",function(req,res){return res.status(403).send("Forbidden");});

const sessions=new Map();const adminSessions=new Map();
setInterval(()=>{const n=Date.now();for(const [k,v] of sessions){if(!v||n>v.expiresAt)sessions.delete(k);}for(const [k,v] of adminSessions){if(!v||n>v.expiresAt)adminSessions.delete(k);}},10*60*1000).unref();

function nowIso(){return new Date().toISOString();}
function safeJson(v){try{return JSON.stringify(v);}catch{return "{}";}}
function normalizeEmail(v){return String(v||"").trim().toLowerCase();}
function cleanString(v,m){const r=String(v==null?"":v).trim();return m?r.slice(0,m):r;}
function toPositiveInteger(v){const n=Number(v);if(!Number.isFinite(n)||!Number.isInteger(n)||n<=0)return null;return n;}
function packageFromInput(v){const s=String(v||"").trim().toLowerCase();if(s==="gold")return "Gold";if(s==="silver")return "Silver";return null;}
function getWelcomeBonus(p){return p==="Gold"?GOLD_WELCOME_BONUS:SILVER_WELCOME_BONUS;}
function parseCookieHeader(h){const c={};String(h||"").split(";").forEach(p=>{const i=p.indexOf("=");if(i===-1)return;c[p.slice(0,i).trim()]=p.slice(i+1).trim();});return c;}
function getSessionToken(req,n){return parseCookieHeader(req.headers.cookie||"")[n]||null;}
function setSessionCookie(res,n,t,m){const s=process.env.NODE_ENV==="production"?"; Secure":"";res.setHeader("Set-Cookie",`${n}=${t}; HttpOnly; SameSite=None; Path=/; Max-Age=${Math.floor(m/1000)}${s}`);}
function clearSessionCookie(res,n){res.setHeader("Set-Cookie",`${n}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);}
function createReference(p){return p+"_"+Date.now()+"_"+crypto.randomBytes(5).toString("hex").toUpperCase();}
function getSessionUser(req){const t=getSessionToken(req,"jovia_session");if(!t)return null;const s=sessions.get(t);if(!s||Date.now()>s.expiresAt){sessions.delete(t);return null;}const u=db.prepare("SELECT * FROM users WHERE id=?").get(s.userId);if(!u){sessions.delete(t);return null;}return u;}
function getAdminSession(req){const t=getSessionToken(req,"jovia_admin_session");if(!t)return null;const s=adminSessions.get(t);if(!s||Date.now()>s.expiresAt){adminSessions.delete(t);return null;}return{username:s.username,token:t};}
function publicUser(u){if(!u)return null;return{id:u.id,full_name:u.full_name,fullName:u.full_name,username:u.username,email:u.email,phone:u.phone,package:u.package,package_amount:u.package_amount,packageAmount:u.package_amount,wallet_balance:u.wallet_balance,walletBalance:u.wallet_balance,affiliate_balance:u.affiliate_balance,affiliateBalance:u.affiliate_balance,total_earned:u.total_earned,totalEarned:u.total_earned,account_status:u.account_status,accountStatus:u.account_status,created_at:u.created_at,createdAt:u.created_at,referral_code:u.referral_code||u.username.toUpperCase(),referralCode:u.referral_code||u.username.toUpperCase(),referrals:u.referrals||0};}
function paymentResultForUser(p){if(!p)return null;return{id:p.id,userId:p.user_id,amount:p.amount,package:p.package,paymentReference:p.payment_reference,transactionReference:p.transaction_reference,gateway:p.gateway,paymentStatus:p.payment_status,createdAt:p.created_at};}
function withdrawalResult(r){if(!r)return null;return{id:r.id,user_id:r.user_id,userId:r.user_id,amount:r.amount,type:r.type,withdrawal_type:r.type,status:r.status,bank_name:r.bank_name,bankName:r.bank_name,account_name:r.account_name,accountName:r.account_name,account_number:r.account_number,accountNumber:r.account_number,note:r.note,gateway:r.gateway,username:r.username,full_name:r.full_name,email:r.email,created_at:r.created_at,createdAt:r.created_at,approved_by:r.approved_by,rejected_by:r.rejected_by};}
function requireUser(req,res,next){const u=getSessionUser(req);if(!u)return res.status(401).json({success:false,message:"Not authenticated"});req.user=u;next();}
function requireActiveUser(req,res,next){const u=getSessionUser(req);if(!u)return res.status(401).json({success:false,message:"Not authenticated"});if(u.account_status!=="active"&&u.account_status!=="approved")return res.status(403).json({success:false,message:"Account not active yet"});req.user=u;next();}
function requireAdmin(req,res,next){const a=getAdminSession(req);if(!a)return res.status(401).json({success:false,message:"Admin authentication required"});req.admin=a;next();}
function updateUserBalance(id,col,amt){if(col!=="wallet_balance"&&col!=="affiliate_balance")throw new Error("Invalid column");db.prepare(`UPDATE users SET ${col}=${col}+? WHERE id=?`).run(amt,id);}
function recordWalletTransaction(uid,type,amt,btype,ref,desc){db.prepare(`INSERT INTO wallet_transactions (user_id,type,amount,balance_type,reference,description) VALUES (?,?,?,?,?,?)`).run(uid,type,amt,btype,ref,desc);}
function getReferralReward(referrerPackage, referredPackage){
  const a = String(referrerPackage||'').trim();
  const b = String(referredPackage||'').trim();
  if(a==="Gold" && b==="Gold") return 13000;
  if(a==="Gold" && b==="Silver") return 8000;
  if(a==="Silver" && b==="Silver") return 8000;
  if(a==="Silver" && b==="Gold") return 0;
  return 0;
}
function activateUserAndRewardsInternal(uid){const u=db.prepare("SELECT * FROM users WHERE id=?").get(uid);if(!u)throw new Error("User not found");db.prepare(`UPDATE users SET account_status='active' WHERE id=?`).run(uid);const f=db.prepare("SELECT * FROM users WHERE id=?").get(uid);if(f.welcome_bonus>0){const ex=db.prepare(`SELECT id FROM wallet_transactions WHERE user_id=? AND type='welcome_bonus' LIMIT 1`).get(uid);if(!ex){updateUserBalance(uid,"wallet_balance",f.welcome_bonus);db.prepare(`UPDATE users SET total_earned=total_earned+? WHERE id=?`).run(f.welcome_bonus,uid);recordWalletTransaction(uid,"welcome_bonus",f.welcome_bonus,"wallet",`WELCOME_BONUS_${uid}`,"Package welcome bonus");}}if(!f.referrer_id)return;const ref=db.prepare("SELECT * FROM users WHERE id=?").get(f.referrer_id);if(!ref)return;const ex2=db.prepare(`SELECT id FROM referral_rewards WHERE referred_user_id=? LIMIT 1`).get(uid);if(ex2)return;const rew=getReferralReward(ref.package,f.package);db.prepare(`INSERT INTO referral_rewards (referrer_id,referred_user_id,amount,referrer_package,referred_package) VALUES (?,?,?,?,?)`).run(ref.id,f.id,rew,ref.package,f.package);if(rew>0){updateUserBalance(ref.id,"affiliate_balance",rew);db.prepare(`UPDATE users SET total_earned=total_earned+?, referrals=COALESCE(referrals,0)+1 WHERE id=?`).run(rew,ref.id);recordWalletTransaction(ref.id,"referral_reward",rew,"affiliate",`REFERRAL_${f.id}`,`Referral reward for ${f.username} (${f.package})`);}else{db.prepare(`UPDATE users SET referrals=COALESCE(referrals,0)+1 WHERE id=?`).run(ref.id);}}
function activateUserAndRewards(uid){return db.transaction(()=>activateUserAndRewardsInternal(uid))();}
function monnifyConfigured(){return Boolean(MONNIFY_API_KEY&&MONNIFY_SECRET_KEY&&MONNIFY_CONTRACT_CODE);}
function monnifyRequest(method,requestPath,body,bearerToken,extraHeaders){return new Promise((resolve,reject)=>{const url=new URL(MONNIFY_BASE_URL+requestPath);const payload=body==null?null:Buffer.from(JSON.stringify(body));const headers=Object.assign({},extraHeaders||{});if(payload){headers["Content-Type"]="application/json";headers["Content-Length"]=payload.length;}if(bearerToken)headers.Authorization=`Bearer ${bearerToken}`;const request=https.request({protocol:url.protocol,hostname:url.hostname,port:url.port||443,path:url.pathname+url.search,method,headers,timeout:30000},(response)=>{const chunks=[];response.on("data",(chunk)=>{chunks.push(chunk);});response.on("end",()=>{const raw=Buffer.concat(chunks).toString("utf8");let parsed;try{parsed=raw?JSON.parse(raw):{};}catch(_){parsed={raw};}resolve({statusCode:response.statusCode,body:parsed,raw});});});request.on("timeout",()=>{request.destroy(new Error("Monnify request timed out."));});request.on("error",reject);if(payload)request.write(payload);request.end();});}
async function getMonnifyToken(){const auth=Buffer.from(MONNIFY_API_KEY+":"+MONNIFY_SECRET_KEY).toString("base64");const response=await monnifyRequest("POST","/api/v1/auth/login",null,null,{Authorization:"Basic "+auth});if(response.statusCode<200||response.statusCode>=300||!response.body.requestSuccessful)throw new Error(response.body?.responseMessage||"Unable to authenticate with Monnify.");const token=response.body.responseBody?.accessToken;if(!token)throw new Error("Monnify did not return an access token.");return token;}
async function initializeMonnifyPayment(payment){const token=await getMonnifyToken();const response=await monnifyRequest("POST","/api/v1/merchant/transactions/init-transaction",{amount:payment.amount,customerName:payment.customerName,customerEmail:payment.customerEmail,paymentReference:payment.paymentReference,paymentDescription:`Jovia Network ${payment.package} package`,currencyCode:"NGN",contractCode:MONNIFY_CONTRACT_CODE,redirectUrl:payment.redirectUrl,paymentMethods:["CARD","ACCOUNT_TRANSFER","USSD","PHONE_NUMBER"]},token);if(response.statusCode<200||response.statusCode>=300||!response.body.requestSuccessful)throw new Error(response.body?.responseMessage||"Monnify could not initialize the payment.");const data=response.body.responseBody||{};if(!data.checkoutUrl)throw new Error("Monnify returned no checkout URL.");return data;}
async function verifyMonnifyPayment(paymentReference){const token=await getMonnifyToken();const response=await monnifyRequest("GET","/api/v2/merchant/transactions/query?paymentReference="+encodeURIComponent(paymentReference),null,token);if(response.statusCode<200||response.statusCode>=300||!response.body.requestSuccessful)throw new Error(response.body?.responseMessage||"Unable to verify the Monnify transaction.");return(response.body.responseBody||{});}
function addWithdrawalEvent(withdrawalId,action,actor,details){try{db.prepare(`INSERT INTO withdrawal_events (withdrawal_id,action,actor,details) VALUES (?,?,?,?)`).run(withdrawalId,action,actor||"",safeJson(details||{}));}catch(error){console.error("WITHDRAWAL EVENT ERROR:",error);}}
function refundWithdrawalIfNeeded(withdrawalId,reason,actor){return db.transaction(()=>{const row=db.prepare("SELECT * FROM withdrawals WHERE id =?").get(withdrawalId);if(!row)throw new Error("Withdrawal not found.");if(row.refund_processed)return row;const balanceColumn=row.type==="affiliate"?"affiliate_balance":"wallet_balance";updateUserBalance(row.user_id,balanceColumn,row.amount);recordWalletTransaction(row.user_id,"withdrawal_refund",row.amount,row.type==="affiliate"?"affiliate":"wallet",`WITHDRAWAL_REFUND_${row.id}`,reason||"Withdrawal refunded");db.prepare(`UPDATE withdrawals SET status='rejected',refund_processed=1,note=?,rejected_by=?,rejected_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(reason||"Withdrawal refunded",actor||"system",row.id);addWithdrawalEvent(row.id,"rejected_refunded",actor||"system",{reason:reason||"Withdrawal refunded"});return db.prepare("SELECT * FROM withdrawals WHERE id =?").get(row.id);})();}
function processSuccessfulPayment(paymentReference,verificationData){return db.transaction(()=>{const payment=db.prepare(`SELECT * FROM payments WHERE payment_reference =? LIMIT 1`).get(paymentReference);if(!payment)throw new Error("Payment record not found.");if(payment.payment_status==="PAID")return{paid:true,duplicate:true,payment};const paidAmount=Number(verificationData?.amountPaid!=null?verificationData.amountPaid:verificationData?.amount);const expectedAmount=Number(payment.amount);const paymentStatus=String(verificationData?.paymentStatus||"").toUpperCase();if(paymentStatus!=="PAID"){db.prepare(`UPDATE payments SET gateway_status=?,payment_status=?,gateway_response=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(paymentStatus||"UNKNOWN",paymentStatus||"UNKNOWN",safeJson(verificationData),payment.id);return{paid:false,duplicate:false,payment:db.prepare("SELECT * FROM payments WHERE id =?").get(payment.id)};}if(!Number.isFinite(paidAmount)||Math.round(paidAmount)!==expectedAmount){db.prepare(`UPDATE payments SET gateway_status=?,payment_status='AMOUNT_MISMATCH',gateway_response=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(paymentStatus,safeJson(verificationData),payment.id);throw new Error("Payment amount does not match the expected package amount.");}const transactionReference=verificationData?.transactionReference||verificationData?.transactionReferenceNumber||payment.transaction_reference||"";db.prepare(`UPDATE payments SET transaction_reference=?,gateway_status='PAID',payment_status='PAID',gateway_response=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(transactionReference,safeJson(verificationData),payment.id);activateUserAndRewardsInternal(payment.user_id);return{paid:true,duplicate:false,payment:db.prepare("SELECT * FROM payments WHERE id =?").get(payment.id)};})();}

app.get("/api/health",(req,res)=>{res.json({success:true,service:"Jovia Network API FIXED + PERSISTENT",status:"ok",dbPath:DB_PATH,volume:VOLUME_PATH||"local",uploadRoot:UPLOAD_ROOT,videoDir:VIDEO_DIR,time:nowIso()});});
app.get("/api/referral/:code",(req,res)=>{
  try{
    const code = String(req.params.code||"").trim().toUpperCase();
    if(!code) return res.status(400).json({success:false,message:"Code required"});
    const user = db.prepare("SELECT username, referral_code FROM users WHERE UPPER(referral_code)=? OR UPPER(username)=? LIMIT 1").get(code, code);
    if(!user) return res.status(404).json({success:false,message:"Invalid referral code"});
    return res.json({success:true, username:user.username, code:user.referral_code||user.username.toUpperCase(), full_name:user.username});
  }catch(e){ return res.status(500).json({success:false}); }
});
app.post("/api/register",async(req,res)=>{try{
  const body=req.body||{};
  const fullName=cleanString(body.fullName??body.full_name,120);
  const username=cleanString(body.username,50);
  const email=normalizeEmail(body.email);
  const phone=cleanString(body.phone,30);
  const password=String(body.password||"");
  const selectedPackage=packageFromInput(body.package??body.plan);
  let referrerInput = cleanString(body.referred_by || body.referral_code || body.referredBy || body.referralCode || body.referrer || body.ref || "", 50);
  const referrerIdNum=toPositiveInteger(body.referrerId??body.referrer_id);
  if(!fullName||!username||!email||!phone||!password||!selectedPackage)return res.status(400).json({success:false,message:"Please complete all required fields."});
  if(password.length<6)return res.status(400).json({success:false,message:"Password must contain at least 6 characters."});
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({success:false,message:"Please enter a valid email address."});
  const exists=db.prepare(`SELECT id FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?) LIMIT 1`).get(username,email);
  if(exists)return res.status(409).json({success:false,message:"That username or email is already registered."});
  let validReferrerId=null;
  if(referrerIdNum){
    const referrer=db.prepare("SELECT id FROM users WHERE id =?").get(referrerIdNum);
    if(referrer) validReferrerId=referrer.id;
  } else if(referrerInput){
    const refUpper = referrerInput.toUpperCase();
    const referrer=db.prepare("SELECT id FROM users WHERE UPPER(referral_code)=? OR UPPER(username)=? LIMIT 1").get(refUpper, refUpper);
    if(referrer) validReferrerId=referrer.id;
  }
  const passwordHash=await bcrypt.hash(password,12);
  const amount=PACKAGES[selectedPackage];
  const welcomeBonus=getWelcomeBonus(selectedPackage);
  const myReferralCode = username.toUpperCase();
  const result=db.prepare(`INSERT INTO users (full_name,username,email,phone,password_hash,package,package_amount,welcome_bonus,referrer_id,referral_code,account_status) VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`).run(fullName,username,email,phone,passwordHash,selectedPackage,amount,welcomeBonus,validReferrerId,myReferralCode);
  const userId=Number(result.lastInsertRowid);
  const token=crypto.randomBytes(32).toString("hex");
  const maxAge=8*60*60*1000;sessions.set(token,{userId,expiresAt:Date.now()+maxAge});
  setSessionCookie(res,"jovia_session",token,maxAge);
  const user=db.prepare("SELECT * FROM users WHERE id =?").get(userId);
  return res.status(201).json({success:true,message:"Account created successfully.",userId:user.id,package:user.package,amount:user.package_amount,user:publicUser(user),referredBy: validReferrerId? true : false});
}catch(error){console.error("REGISTER ERROR:",error);return res.status(500).json({success:false,message:"Unable to create the account."});}});

app.post("/api/login",async(req,res)=>{try{const body=req.body||{};const login=cleanString(body.login??body.username??body.email,120);const password=String(body.password||"");const rememberMe=body.rememberMe===true||body.rememberMe==="true"||body.rememberMe===1||body.rememberMe==="1";if(!login||!password)return res.status(400).json({success:false,message:"Please enter your username/email and password."});const user=db.prepare(`SELECT * FROM users WHERE lower(username)=lower(?) OR lower(email)=lower(?) LIMIT 1`).get(login,login);if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({success:false,message:"Incorrect username/email or password."});const token=crypto.randomBytes(32).toString("hex");const maxAge=rememberMe?30*24*60*60*1000:8*60*60*1000;sessions.set(token,{userId:user.id,expiresAt:Date.now()+maxAge});setSessionCookie(res,"jovia_session",token,maxAge);return res.json({success:true,user:publicUser(user)});}catch(error){console.error("LOGIN ERROR:",error);return res.status(500).json({success:false,message:"Unable to sign in right now."});}});
app.get("/api/me",(req,res)=>{
  const admin=getAdminSession(req);
  if(admin) return res.json({success:true,admin:{username:admin.username},user:{username:admin.username}});
  const user=getSessionUser(req);
  if(!user) return res.status(401).json({success:false,message:"Not authenticated"});
  return res.json({success:true,user:publicUser(user)});
});
app.post("/api/logout",(req,res)=>{
  const token=getSessionToken(req,"jovia_session"); if(token) sessions.delete(token);
  const adminToken=getSessionToken(req,"jovia_admin_session"); if(adminToken) adminSessions.delete(adminToken);
  clearSessionCookie(res,"jovia_session");
  clearSessionCookie(res,"jovia_admin_session");
  return res.json({success:true});
});
app.post("/api/payments/initialize",requireUser,async(req,res)=>{try{if(!monnifyConfigured())return res.status(503).json({success:false,message:"Monnify is not configured"});const requestedPackage=packageFromInput(req.body?.package??req.body?.plan);if(!requestedPackage)return res.status(400).json({success:false,message:"Please select Silver or Gold"});if(["active","approved"].includes(req.user.account_status))return res.status(400).json({success:false,message:"Your account is already active"});if(requestedPackage!==req.user.package)return res.status(400).json({success:false,message:"The selected package does not match your registered package."});const expectedAmount=PACKAGES[req.user.package];let payment=db.prepare(`SELECT * FROM payments WHERE user_id=? AND amount=? AND payment_status IN ('PENDING','INITIATED') ORDER BY id DESC LIMIT 1`).get(req.user.id,expectedAmount);if(!payment){const reference=createReference("JOVIA_PAY");const result=db.prepare(`INSERT INTO payments (user_id,amount,package,payment_reference,gateway,payment_status) VALUES (?,?,?,?, 'monnify', 'INITIATED')`).run(req.user.id,expectedAmount,req.user.package,reference);payment=db.prepare("SELECT * FROM payments WHERE id =?").get(result.lastInsertRowid);}const redirectUrl=MONNIFY_REDIRECT_URL||`${req.protocol}://${req.get("host")}/payment-success.html`;const checkout=await initializeMonnifyPayment({amount:payment.amount,package:payment.package,customerName:req.user.full_name,customerEmail:req.user.email,paymentReference:payment.payment_reference,redirectUrl});db.prepare(`UPDATE payments SET transaction_reference=?,gateway_status='INITIATED',payment_status='PENDING',gateway_response=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(checkout.transactionReference||"",safeJson(checkout),payment.id);return res.json({success:true,authorization_url:checkout.checkoutUrl,checkoutUrl:checkout.checkoutUrl,paymentReference:payment.payment_reference,transactionReference:checkout.transactionReference||"",amount:payment.amount,package:payment.package});}catch(error){console.error("PAYMENT INITIALIZE ERROR:",error);return res.status(502).json({success:false,message:error.message||"Unable to initialize payment."});}});
app.post("/api/payments/verify",requireUser,async(req,res)=>{try{const paymentReference=cleanString(req.body?.paymentReference??req.body?.payment_reference,150);if(!paymentReference)return res.status(400).json({success:false,message:"Payment reference is required."});const payment=db.prepare(`SELECT * FROM payments WHERE payment_reference=? AND user_id=? LIMIT 1`).get(paymentReference,req.user.id);if(!payment)return res.status(404).json({success:false,message:"Payment record not found."});if(payment.payment_status!=="PAID"){const verified=await verifyMonnifyPayment(paymentReference);processSuccessfulPayment(paymentReference,verified);}const updatedPayment=db.prepare(`SELECT * FROM payments WHERE payment_reference=? LIMIT 1`).get(paymentReference);const updatedUser=db.prepare("SELECT * FROM users WHERE id =?").get(req.user.id);return res.json({success:true,paid:updatedPayment.payment_status==="PAID",message:updatedPayment.payment_status==="PAID"?"Payment confirmed and account activated.":"Payment has not been confirmed yet.",payment:paymentResultForUser(updatedPayment),user:publicUser(updatedUser)});}catch(error){console.error("PAYMENT VERIFY ERROR:",error);return res.status(502).json({success:false,message:error.message||"Unable to verify payment."});}});
app.get("/api/payments",requireUser,(req,res)=>{const rows=db.prepare(`SELECT * FROM payments WHERE user_id=? ORDER BY id DESC`).all(req.user.id);return res.json({success:true,payments:rows.map(paymentResultForUser)});});
function saveWebhookEvent(eventKey,eventType,payload){try{db.prepare(`INSERT INTO webhook_events (event_key,event_type,payload) VALUES (?,?,?)`).run(eventKey,eventType,safeJson(payload));return true;}catch(error){if(String(error.message).includes("UNIQUE constraint failed"))return false;throw error;}}
function webhookSignatureValid(req){const signature=req.headers["monnify-signature"];if(signature&&MONNIFY_SECRET_KEY&&req.rawBody){const expected=crypto.createHmac("sha512",MONNIFY_SECRET_KEY).update(req.rawBody).digest("hex");const a=Buffer.from(expected.toLowerCase());const b=Buffer.from(String(signature).toLowerCase());return(a.length===b.length&&crypto.timingSafeEqual(a,b));}const isSandbox=String(process.env.MONNIFY_ENV||"sandbox").toLowerCase()!=="live";return(isSandbox&&MONNIFY_ALLOW_UNSIGNED_SANDBOX_WEBHOOKS);}
app.post("/api/webhooks/monnify",async(req,res)=>{try{if(!webhookSignatureValid(req))return res.status(401).json({success:false,message:"Invalid webhook signature."});const payload=req.body||{};const eventType=String(payload.eventType||payload.event||"").toUpperCase();const eventKey=payload.eventId||payload.eventID||payload.id||crypto.createHash("sha256").update(req.rawBody||Buffer.from(safeJson(payload))).digest("hex");if(!saveWebhookEvent(String(eventKey),eventType,payload))return res.status(200).json({success:true,duplicate:true});const eventData=payload.eventData||{};if(eventType==="SUCCESSFUL_TRANSACTION"){const paymentReference=eventData.paymentReference||eventData.payment_reference;if(paymentReference){try{const verified=await verifyMonnifyPayment(paymentReference);processSuccessfulPayment(paymentReference,verified);}catch(error){console.error("WEBHOOK PAYMENT ERROR:",error);}}}return res.status(200).json({success:true,received:true});}catch(error){console.error("WEBHOOK ERROR:",error);return res.status(500).json({success:false,message:"Webhook processing failed."});}});
app.get("/api/jobs", requireActiveUser, (req,res)=>{
  try{
    let jobs;
    try{
      jobs = db.prepare(`SELECT j.*, COALESCE(uj.status,'pending') AS user_status, CASE WHEN ulo.id IS NOT NULL THEN 1 ELSE 0 END AS link_opened FROM jobs j LEFT JOIN user_jobs uj ON uj.job_id=j.id AND uj.user_id=? LEFT JOIN user_job_link_opens ulo ON ulo.job_id=j.id AND ulo.user_id=? WHERE j.status='active' AND (j.deleted_at IS NULL OR j.deleted_at='') ORDER BY j.id DESC`).all(req.user.id, req.user.id);
    }catch{
      jobs = db.prepare(`SELECT j.*, COALESCE(uj.status,'pending') AS user_status, CASE WHEN ulo.id IS NOT NULL THEN 1 ELSE 0 END AS link_opened FROM jobs j LEFT JOIN user_jobs uj ON uj.job_id=j.id AND uj.user_id=? LEFT JOIN user_job_link_opens ulo ON ulo.job_id=j.id AND ulo.user_id=? WHERE j.status='active' ORDER BY j.id DESC`).all(req.user.id, req.user.id);
    }
    return res.json({success:true, jobs:jobs.map((job)=>({
      id:job.id, title:job.title, description:job.description||"", category:job.category||"General", slot:job.slot||"General",
      reward:Number(job.reward||0), link:job.link||"", url:job.link||"", duration:job.duration||"Flexible",
      status:job.status, user_status:job.user_status, link_opened:job.link_opened, linkOpened:Boolean(job.link_opened),
      completed:job.user_status==="completed", started:job.user_status==="started"
    }))});
  }catch(err){
    return res.status(500).json({success:false, message:"Unable to load jobs"});
  }
});
app.post("/api/jobs/:id/open", requireActiveUser, function(req, res){
  try{
    const jobId = toPositiveInteger(req.params.id);
    if(!jobId) return res.status(400).json({success:false, message:"Invalid job."});
    let job;
    try{ job = db.prepare("SELECT * FROM jobs WHERE id=? AND status='active' AND (deleted_at IS NULL OR deleted_at='')").get(jobId); }
    catch{ job = db.prepare("SELECT * FROM jobs WHERE id=? AND status='active'").get(jobId); }
    if(!job) return res.status(404).json({success:false, message:"Job not found"});
    db.prepare("INSERT OR IGNORE INTO user_job_link_opens (user_id,job_id) VALUES (?,?)").run(req.user.id, jobId);
    const existing = db.prepare("SELECT * FROM user_jobs WHERE user_id=? AND job_id=?").get(req.user.id, jobId);
    if(!existing){
      db.prepare("INSERT INTO user_jobs (user_id,job_id,status) VALUES (?,?, 'started')").run(req.user.id, jobId);
    } else if(existing.status === "pending"){
      db.prepare("UPDATE user_jobs SET status='started' WHERE user_id=? AND job_id=?").run(req.user.id, jobId);
    }
    return res.json({success:true, linkOpened:true, url:job.link||"", link:job.link||"", title:job.title, message:"Task opened - now claim"});
  }catch(e){
    return res.status(400).json({success:false, message:e.message});
  }
});
app.post("/api/jobs/:id/complete", requireActiveUser, function(req, res){
  try{
    const jobId = toPositiveInteger(req.params.id);
    if(!jobId) return res.status(400).json({success:false, message:"Invalid job."});
    let job;
    try{ job = db.prepare("SELECT * FROM jobs WHERE id=? AND status='active' AND (deleted_at IS NULL OR deleted_at='')").get(jobId); }
    catch{ job = db.prepare("SELECT * FROM jobs WHERE id=? AND status='active'").get(jobId); }
    if(!job) return res.status(404).json({success:false, message:"Job not found"});
    const opened = db.prepare("SELECT * FROM user_job_link_opens WHERE user_id=? AND job_id=?").get(req.user.id, jobId);
    if(!opened){
      return res.status(400).json({success:false, message:"Open the task first before claiming."});
    }
    const existing = db.prepare("SELECT * FROM user_jobs WHERE user_id=? AND job_id=?").get(req.user.id, jobId);
    if(existing && (existing.status === "completed" || existing.status === "claimed")){
      const wallet = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(req.user.id);
      return res.json({success:true, message:"Already completed", reward:existing.reward_amount, walletBalance:wallet? wallet.wallet_balance : 0});
    }
    const reward = Number(job.reward || 0);
    if(reward <= 0) return res.status(400).json({success:false, message:"Invalid reward"});
    const newBalance = db.transaction(function(){
      db.prepare("UPDATE users SET wallet_balance = wallet_balance +? WHERE id=?").run(reward, req.user.id);
      if(existing){
        db.prepare("UPDATE user_jobs SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE user_id=? AND job_id=?").run(req.user.id, jobId);
      } else {
        db.prepare("INSERT INTO user_jobs (user_id,job_id,status) VALUES (?,?, 'completed')").run(req.user.id, jobId);
      }
      try{
        db.prepare("INSERT INTO wallet_transactions (user_id, amount, type, description, reference) VALUES (?,?,?,?,?)").run(req.user.id, reward, 'job_reward', 'Job completed: ' + job.title, 'JOB_'+jobId);
      }catch(err){}
      const updatedUser = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(req.user.id);
      return updatedUser? updatedUser.wallet_balance : 0;
    })();
    return res.json({success:true, message:"✅ " + reward + " credited!", reward:reward, walletBalance:newBalance, wallet_balance:newBalance});
  }catch(e){
    console.error("complete job error", e);
    return res.status(400).json({success:false, message:e.message});
  }
});
app.get("/api/wallet",requireUser,(req,res)=>{try{const user=db.prepare(`SELECT id,wallet_balance,affiliate_balance,total_earned FROM users WHERE id=?`).get(req.user.id);if(!user)return res.status(404).json({success:false,message:"User not found."});const transactions=db.prepare(`SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC`).all(req.user.id);return res.json({success:true,walletBalance:Number(user.wallet_balance||0),affiliateBalance:Number(user.affiliate_balance||0),totalEarned:Number(user.total_earned||0),transactions:transactions.map((item)=>({id:item.id,type:item.type,amount:Number(item.amount||0),balanceType:item.balance_type,reference:item.reference,description:item.description,createdAt:item.created_at}))});}catch(error){return res.status(500).json({success:false,message:"Unable to load wallet."});}});
app.post("/api/withdrawals",requireActiveUser,async(req,res)=>{
  try{
    const body=req.body||{};
    const type=String(body.type||"regular").toLowerCase()==="affiliate"?"affiliate":"regular";
    const amount=toPositiveInteger(body.amount);
    const bankName=cleanString(body.bankName??body.bank_name,120);
    const accountNumber=cleanString(body.accountNumber??body.account_number,30).replace(/\s+/g,"");
    const accountNameInput=cleanString(body.accountName??body.account_name,150);
    const note=cleanString(body.note,500);
    if(!amount)return res.status(400).json({success:false,message:"Enter a valid withdrawal amount."});
    if(!bankName)return res.status(400).json({success:false,message:"Bank name is required."});
    if(!accountNumber)return res.status(400).json({success:false,message:"Account number is required."});
    if(!/^\d{10}$/.test(accountNumber))return res.status(400).json({success:false,message:"Enter a valid 10-digit account number."});
    if(!accountNameInput)return res.status(400).json({success:false,message:"Account name is required."});
    const minimum=WITHDRAWAL_MINIMUMS[type];if(amount<minimum)return res.status(400).json({success:false,message:`Minimum ${type} withdrawal is ₦${minimum.toLocaleString()}.`});
    const balanceColumn=type==="affiliate"?"affiliate_balance":"wallet_balance";
    const user=db.prepare(`SELECT id,wallet_balance,affiliate_balance FROM users WHERE id=? LIMIT 1`).get(req.user.id);
    if(!user)return res.status(404).json({success:false,message:"User not found."});
    const currentBalance=Number(user[balanceColumn]||0);if(currentBalance<amount)return res.status(400).json({success:false,message:"Insufficient balance."});
    const withdrawal=db.transaction(()=>{
      updateUserBalance(req.user.id,balanceColumn,-amount);
      const result=db.prepare(`INSERT INTO withdrawals (user_id,amount,type,status,bank_name,account_name,account_number,note,gateway) VALUES (?,?,?, 'pending',?,?,?,?, 'manual')`).run(req.user.id,amount,type,bankName,accountNameInput,accountNumber,note);
      const withdrawalId=Number(result.lastInsertRowid);
      recordWalletTransaction(req.user.id,"withdrawal",-amount,type==="affiliate"?"affiliate":"wallet",`WITHDRAWAL_${withdrawalId}`,`Withdrawal request - ${type}`);
      addWithdrawalEvent(withdrawalId,"withdrawal_requested",req.user.username,{amount,type,bankName,accountName:accountNameInput,accountNumber,note});
      return db.prepare(`SELECT * FROM withdrawals WHERE id=? LIMIT 1`).get(withdrawalId);
    })();
    return res.status(201).json({success:true,message:"Withdrawal request submitted successfully.",withdrawal:withdrawalResult(withdrawal)});
  }catch(error){return res.status(500).json({success:false,message:error.message||"Unable to submit withdrawal request."});}
});
async function verifyAdminPassword(password){const configured=String(ADMIN_PASSWORD||"");if(!configured)return false;if(configured.startsWith("$2a$")||configured.startsWith("$2b$")||configured.startsWith("$2y$")){return bcrypt.compare(password,configured);}return password===configured;}
app.post("/api/admin/login",async(req,res)=>{try{const username=cleanString(req.body?.username??req.body?.login,100);const password=String(req.body?.password||"");if(!username||!password)return res.status(400).json({success:false,message:"Username and password are required."});const validUsername=username.toLowerCase()===String(ADMIN_USERNAME||"").toLowerCase();if(!validUsername)return res.status(401).json({success:false,message:"Invalid admin credentials."});const validPassword=await verifyAdminPassword(password);if(!validPassword)return res.status(401).json({success:false,message:"Invalid admin credentials."});const token=crypto.randomBytes(32).toString("hex");const maxAge=8*60*60*1000;adminSessions.set(token,{username:ADMIN_USERNAME,expiresAt:Date.now()+maxAge});setSessionCookie(res,"jovia_admin_session",token,maxAge);return res.json({success:true,username:ADMIN_USERNAME,admin:{username:ADMIN_USERNAME}});}catch(error){return res.status(500).json({success:false,message:"Unable to sign in as admin."});}});
app.post("/api/admin/logout",(req,res)=>{
  const token=getSessionToken(req,"jovia_admin_session"); if(token) adminSessions.delete(token);
  const userToken=getSessionToken(req,"jovia_session"); if(userToken) sessions.delete(userToken);
  clearSessionCookie(res,"jovia_admin_session");
  clearSessionCookie(res,"jovia_session");
  return res.json({success:true});
});
app.get("/api/admin/me",requireAdmin,(req,res)=>{return res.json({success:true,admin:{username:req.admin.username}});});
app.get("/api/admin/dashboard",requireAdmin,(req,res)=>{try{const users=db.prepare(`SELECT COUNT(*) AS count FROM users`).get().count;const activeUsers=db.prepare(`SELECT COUNT(*) AS count FROM users WHERE account_status IN ('active','approved')`).get().count;const pendingUsers=db.prepare(`SELECT COUNT(*) AS count FROM users WHERE account_status='pending'`).get().count;const pendingWithdrawals=db.prepare(`SELECT COUNT(*) AS count FROM withdrawals WHERE status='pending'`).get().count;const totalVideos=db.prepare(`SELECT COUNT(*) AS count FROM videos`).get().count;return res.json({success:true,users,activeUsers,pendingUsers,videos:totalVideos,withdrawals:{pending:pendingWithdrawals}});}catch(error){return res.status(500).json({success:false,message:"Unable to load dashboard."});}});
app.get("/api/admin/users",requireAdmin,(req,res)=>{try{const rows=db.prepare(`SELECT id,full_name,username,email,phone,package,package_amount,wallet_balance,affiliate_balance,total_earned,account_status,created_at,referral_code,referrer_id,referrals FROM users ORDER BY id DESC`).all();return res.json({success:true,users:rows.map((user)=>({id:user.id,fullName:user.full_name,full_name:user.full_name,username:user.username,email:user.email,phone:user.phone,package:user.package,packageAmount:Number(user.package_amount||0),walletBalance:Number(user.wallet_balance||0),wallet_balance:user.wallet_balance,affiliateBalance:Number(user.affiliate_balance||0),affiliate_balance:user.affiliate_balance,totalEarned:Number(user.total_earned||0),total_earned:user.total_earned,accountStatus:user.account_status,account_status:user.account_status,createdAt:user.created_at,created_at:user.created_at,referral_code:user.referral_code,referrer_id:user.referrer_id,referrals:user.referrals}))});}catch(error){return res.status(500).json({success:false,message:"Unable to load users."});}});
app.post("/api/admin/users/:id/status",requireAdmin,(req,res)=>{
  try{
    const id=toPositiveInteger(req.params.id); if(!id) return res.status(400).json({success:false,message:"Invalid user"});
    const statusRaw=String(req.body?.status||"").toLowerCase();
    if(statusRaw==="approved"||statusRaw==="active"||statusRaw==="1"){activateUserAndRewards(id);}
    else if(statusRaw==="suspended"){db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(id);}
    else if(statusRaw==="pending"){db.prepare("UPDATE users SET account_status='pending' WHERE id=?").run(id);}
    return res.json({success:true,message:"Status updated"});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.get("/api/admin/users/:id/status:statusValue",requireAdmin,(req,res)=>{
  try{const id=toPositiveInteger(req.params.id);const raw=String(req.params.statusValue||"").replace(":","").toLowerCase();if(raw==="1"||raw==="approved"||raw==="active")activateUserAndRewards(id);else db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(id);return res.json({success:true});}catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.get("/api/admin/users/:id/status/:statusValue",requireAdmin,(req,res)=>{
  try{const id=toPositiveInteger(req.params.id);const raw=String(req.params.statusValue||"").toLowerCase();if(raw==="1"||raw==="approved"||raw==="active")activateUserAndRewards(id);else db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(id);return res.json({success:true});}catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.post("/api/admin/users/:id/reset-password",requireAdmin,async(req,res)=>{
  try{const id=toPositiveInteger(req.params.id);if(!id) return res.status(400).json({success:false,message:"Invalid user"});const h=await bcrypt.hash(String(req.body?.newPassword||"password123"),12);db.prepare("UPDATE users SET password_hash=? WHERE id=?").run(h,id);return res.json({success:true,message:"Password reset"});}catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.post("/api/admin/users/:id/activate",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid user."});activateUserAndRewards(id);const updated=db.prepare(`SELECT * FROM users WHERE id=?`).get(id);return res.json({success:true,user:publicUser(updated)});}catch(error){return res.status(500).json({success:false,message:error.message||"Unable to activate user."});}});
app.get("/api/admin/withdrawals",requireAdmin,(req,res)=>{try{const status=cleanString(req.query.status,30).toLowerCase();let rows;if(["pending","processing","paid","rejected"].includes(status)){rows=db.prepare(`SELECT w.*, u.full_name, u.username, u.email, u.phone, u.package, u.wallet_balance, u.affiliate_balance FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.status=? ORDER BY w.id DESC`).all(status);}else{rows=db.prepare(`SELECT w.*, u.full_name, u.username, u.email, u.phone, u.package, u.wallet_balance, u.affiliate_balance FROM withdrawals w JOIN users u ON u.id=w.user_id ORDER BY w.id DESC`).all();}return res.json({success:true,withdrawals:rows.map((row)=>({...withdrawalResult(row),username:row.username,full_name:row.full_name,user:{id:row.user_id,fullName:row.full_name,full_name:row.full_name,username:row.username,email:row.email,phone:row.phone,package:row.package,walletBalance:Number(row.wallet_balance||0),affiliateBalance:Number(row.affiliate_balance||0)}}))});}catch(error){return res.status(500).json({success:false,message:"Unable to load withdrawals."});}});
app.get("/api/admin/withdrawals/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid withdrawal."});const row=db.prepare(`SELECT w.*, u.full_name, u.username, u.email, u.phone, u.package, u.wallet_balance, u.affiliate_balance FROM withdrawals w JOIN users u ON u.id=w.user_id WHERE w.id=?`).get(id);if(!row)return res.status(404).json({success:false,message:"Withdrawal not found."});const events=db.prepare(`SELECT * FROM withdrawal_events WHERE withdrawal_id=? ORDER BY id DESC`).all(id);return res.json({success:true,withdrawal:{...withdrawalResult(row),username:row.username,full_name:row.full_name,user:{id:row.user_id,fullName:row.full_name,full_name:row.full_name,username:row.username,email:row.email,phone:row.phone,package:row.package,walletBalance:Number(row.wallet_balance||0),affiliateBalance:Number(row.affiliate_balance||0)},events}});}catch(error){return res.status(500).json({success:false,message:"Unable to load withdrawal."});}});
app.post("/api/admin/withdrawals/:id/approve",requireAdmin,(req,res)=>{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid withdrawal."});try{const transferReference=cleanString(req.body?.transferReference??req.body?.manualTransferReference,150);const withdrawal=db.transaction(()=>{const row=db.prepare(`SELECT * FROM withdrawals WHERE id=?`).get(id);if(!row)throw new Error("Withdrawal not found.");if(row.status!=="pending")throw new Error(`Withdrawal is already ${row.status}.`);db.prepare(`UPDATE withdrawals SET status='paid',gateway='manual',gateway_reference=COALESCE(NULLIF(?, ''), gateway_reference),gateway_status='MANUAL_TRANSFER_COMPLETED',approved_by=?,approved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'`).run(transferReference,req.admin.username,id);addWithdrawalEvent(id,"admin_approved_manual",req.admin.username,{method:"manual_bank_transfer",transferReference:transferReference||null,status:"paid"});return db.prepare(`SELECT * FROM withdrawals WHERE id=?`).get(id);})();return res.json({success:true,message:"Withdrawal approved and marked as paid.",withdrawal:withdrawalResult(withdrawal)});}catch(error){return res.status(400).json({success:false,message:error.message||"Unable to approve withdrawal."});}});
app.post("/api/admin/withdrawals/:id/reject",requireAdmin,(req,res)=>{const id=toPositiveInteger(req.params.id);const reason=cleanString(req.body?.reason,500)||"Withdrawal rejected by admin.";if(!id)return res.status(400).json({success:false,message:"Invalid withdrawal."});try{const row=db.prepare(`SELECT * FROM withdrawals WHERE id=?`).get(id);if(!row)return res.status(404).json({success:false,message:"Withdrawal not found."});if(row.status==="paid")return res.status(409).json({success:false,message:"This withdrawal has already been paid."});if(row.status==="rejected")return res.status(409).json({success:false,message:"This withdrawal is already rejected."});const refunded=refundWithdrawalIfNeeded(id,reason,req.admin.username);return res.json({success:true,message:"Withdrawal rejected and refunded.",withdrawal:withdrawalResult(refunded)});}catch(error){return res.status(400).json({success:false,message:error.message||"Unable to reject withdrawal."});}});
app.get("/api/admin/jobs",requireAdmin,(req,res)=>{try{const jobs=db.prepare(`SELECT * FROM jobs ORDER BY id DESC`).all();return res.json({success:true,jobs:jobs.map(j=>({...j,url:j.link,link:j.link}))});}catch(error){return res.status(500).json({success:false,message:"Unable to load jobs."});}});
app.post("/api/admin/jobs",requireAdmin,(req,res)=>{
  try{
    const title=cleanString(req.body?.title||req.body?.name,150);
    const description=cleanString(req.body?.description,1000);
    const reward=toPositiveInteger(req.body?.reward||req.body?.amount);
    const link=cleanString(req.body?.link||req.body?.url||req.body?.job_url||req.body?.link_url||req.body?.destination_url||req.body?.task_link,1000);
    const slot=cleanString(req.body?.slot||req.body?.job_slot||"1",100);
    const category=cleanString(req.body?.category,100);
    const duration=cleanString(req.body?.duration||"Flexible",100);
    if(!title)return res.status(400).json({success:false,message:"Job title is required."});
    if(reward===null||reward<=0)return res.status(400).json({success:false,message:"Job reward must be a positive number."});
    if(!link)return res.status(400).json({success:false,message:"Job link is required."});
    const result=db.prepare(`INSERT INTO jobs (title,description,reward,link,slot,category,duration,status) VALUES (?,?,?,?,?,?,?, 'active')`).run(title,description,reward,link,slot,category,duration);
    const job=db.prepare(`SELECT * FROM jobs WHERE id=?`).get(result.lastInsertRowid);
    return res.status(201).json({success:true,job:{...job,url:job.link,link:job.link},message:"Job created"});
  }catch(error){return res.status(400).json({success:false,message:error.message||"Unable to create job."});}
});
app.put("/api/admin/jobs/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid job."});const existing=db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id);if(!existing)return res.status(404).json({success:false,message:"Job not found."});const title=cleanString(req.body?.title??existing.title,150);const description=cleanString(req.body?.description??existing.description??"",1000);const reward=toPositiveInteger(req.body?.reward??existing.reward);const link=cleanString(req.body?.link??existing.link??"",1000);const slot=cleanString(req.body?.slot??existing.slot??"",100);const category=cleanString(req.body?.category??existing.category??"",100);const duration=cleanString(req.body?.duration??existing.duration??"",100);const requestedStatus=String(req.body?.status??existing.status??"active").toLowerCase();let status;if(requestedStatus==="active")status="active";else status="inactive";if(!title)return res.status(400).json({success:false,message:"Job title is required."});if(reward===null||reward<=0)return res.status(400).json({success:false,message:"Job reward must be a positive number."});if(!link)return res.status(400).json({success:false,message:"Job link is required."});db.prepare(`UPDATE jobs SET title=?,description=?,reward=?,link=?,slot=?,category=?,duration=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(title,description,reward,link,slot,category,duration,status,id);const job=db.prepare(`SELECT * FROM jobs WHERE id=?`).get(id);return res.json({success:true,job});}catch(error){return res.status(400).json({success:false,message:error.message||"Unable to update job."});}});
app.post("/api/admin/jobs/:id/status",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id) return res.status(400).json({success:false,message:"Invalid job"});const s=String(req.body?.status||"active").toLowerCase();db.prepare("UPDATE jobs SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").run(s==="inactive"?"inactive":"active",id);return res.json({success:true,message:"Status updated"});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.delete("/api/admin/jobs/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);if(!id)return res.status(400).json({success:false,message:"Invalid job."});db.prepare(`UPDATE jobs SET status='inactive',deleted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);return res.json({success:true,message:"Job deleted"});}catch(error){return res.status(500).json({success:false,message:error.message||"Unable to delete job."});}});

app.get("/api/admin/links",requireAdmin,(req,res)=>{try{const links=db.prepare("SELECT * FROM links ORDER BY id DESC").all();return res.json({success:true,links});}catch(e){return res.status(500).json({success:false,message:"Unable to load links"});}});
app.post("/api/admin/links",requireAdmin,(req,res)=>{
  try{
    const name=cleanString(req.body?.name||req.body?.title,150);const url=cleanString(req.body?.url,1000);
    const desc=cleanString(req.body?.description,1000);const cat=cleanString(req.body?.category,100);const st=cleanString(req.body?.status,20)||"active";
    if(!name) return res.status(400).json({success:false,message:"Name required"}); if(!url) return res.status(400).json({success:false,message:"URL required"});
    const r=db.prepare("INSERT INTO links (name,title,url,description,category,status) VALUES (?,?,?,?,?,?)").run(name,name,url,desc,cat||"General",st);
    return res.status(201).json({success:true,message:"Link added",link:db.prepare("SELECT * FROM links WHERE id=?").get(r.lastInsertRowid)});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.put("/api/admin/links/:id",requireAdmin,(req,res)=>{
  try{
    const id=toPositiveInteger(req.params.id);if(!id) return res.status(400).json({success:false,message:"Invalid"});
    const ex=db.prepare("SELECT * FROM links WHERE id=?").get(id);if(!ex) return res.status(404).json({success:false,message:"Not found"});
    const name=cleanString(req.body?.name??ex.name,150);const url=cleanString(req.body?.url??ex.url,1000);
    const desc=cleanString(req.body?.description??ex.description,1000);const cat=cleanString(req.body?.category??ex.category,100);const st=cleanString(req.body?.status??ex.status,20);
    db.prepare("UPDATE links SET name=?,title=?,url=?,description=?,category=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(name,name,url,desc,cat,st,id);
    return res.json({success:true,message:"Updated",link:db.prepare("SELECT * FROM links WHERE id=?").get(id)});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.post("/api/admin/links/:id/status",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);const st=String(req.body?.status||"active").toLowerCase();db.prepare("UPDATE links SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(st==="inactive"?"inactive":"active",id);return res.json({success:true});}catch(e){return res.status(400).json({success:false,message:e.message});}});
app.delete("/api/admin/links/:id",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);db.prepare("DELETE FROM links WHERE id=?").run(id);return res.json({success:true,message:"Deleted"});}catch(e){return res.status(400).json({success:false,message:e.message});}});

app.get("/api/admin/videos",requireAdmin,(req,res)=>{try{return res.json({success:true,videos:db.prepare("SELECT * FROM videos ORDER BY id DESC").all()});}catch(e){return res.status(500).json({success:false,message:"Unable to load videos"});}});

// ===== VIDEO UPLOAD FIXED - FULL URL =====
app.post("/api/admin/videos/upload", requireAdmin, upload.single("video"), (req,res)=>{
  if(!req.file) return res.status(400).json({success:false,message:"No file received"});
  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const url = `${baseUrl}/uploads/videos/${req.file.filename}`;
  return res.json({success:true, url, video_url:url});
});

app.post("/api/admin/videos", requireAdmin, upload.fields([{name:"video",maxCount:1},{name:"thumbnail",maxCount:1}]), (req,res)=>{
  try{
    const t=cleanString(req.body?.title,200);
    const d=cleanString(req.body?.description,2000);
    let vu=cleanString(req.body?.url||req.body?.video_url,1000);
    let th=cleanString(req.body?.thumbnail||req.body?.thumbnail_url,1000);
    const rw=Number(req.body?.reward||0);
    const duration=Number(req.body?.duration||0);
    const st=cleanString(req.body?.status||"active",20);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    if(req.files?.video?.[0]) vu=`${baseUrl}/uploads/videos/${req.files.video[0].filename}`;
    if(req.files?.thumbnail?.[0]) th=`${baseUrl}/uploads/videos/${req.files.thumbnail[0].filename}`;
    if(!t) return res.status(400).json({success:false,message:"Title required"});
    if(!vu) return res.status(400).json({success:false,message:"Video file or URL required"});
    const r=db.prepare("INSERT INTO videos (title,description,video_url,thumbnail_url,reward,duration,status) VALUES (?,?,?,?,?,?,?)").run(t,d,vu,th,rw,duration,st||"active");
    return res.status(201).json({success:true, video: db.prepare("SELECT * FROM videos WHERE id=?").get(r.lastInsertRowid)});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});

app.put("/api/admin/videos/:id", requireAdmin, upload.fields([{name:"video",maxCount:1},{name:"thumbnail",maxCount:1}]), (req,res)=>{
  try{
    const id=toPositiveInteger(req.params.id); if(!id) return res.status(400).json({success:false,message:"Invalid video"});
    const ex=db.prepare("SELECT * FROM videos WHERE id=?").get(id); if(!ex) return res.status(404).json({success:false,message:"Video not found"});
    const t=cleanString(req.body?.title??ex.title,200);
    const d=cleanString(req.body?.description??ex.description,2000);
    let vu=cleanString(req.body?.url??req.body?.video_url??ex.video_url,1000);
    let th=cleanString(req.body?.thumbnail??ex.thumbnail_url??ex.thumbnail_url,1000);
    const rw=Number(req.body?.reward??ex.reward);
    const duration=Number(req.body?.duration??ex.duration);
    const st=cleanString(req.body?.status??ex.status,20);
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    if(req.files?.video?.[0]) vu=`${baseUrl}/uploads/videos/${req.files.video[0].filename}`;
    if(req.files?.thumbnail?.[0]) th=`${baseUrl}/uploads/videos/${req.files.thumbnail[0].filename}`;
    db.prepare("UPDATE videos SET title=?,description=?,video_url=?,thumbnail_url=?,reward=?,duration=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t,d,vu,th,rw,duration,st,id);
    return res.json({success:true, video: db.prepare("SELECT * FROM videos WHERE id=?").get(id)});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});

app.post("/api/admin/videos/:id/status",requireAdmin,(req,res)=>{try{const id=toPositiveInteger(req.params.id);const st=String(req.body?.status||"active").toLowerCase();db.prepare("UPDATE videos SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(st==="inactive"?"inactive":"active",id);return res.json({success:true});}catch(e){return res.status(400).json({success:false,message:e.message});}});

app.delete("/api/admin/videos/:id", requireAdmin, (req,res)=>{
  try{
    const id=toPositiveInteger(req.params.id); if(!id) return res.status(400).json({success:false,message:"Invalid id"});
    const ex=db.prepare("SELECT * FROM videos WHERE id=?").get(id); if(!ex) return res.status(404).json({success:false,message:"Not found"});
    // handle both relative and absolute URLs
    try{
      let filePath = ex.video_url;
      if(filePath.includes("/uploads/")){
        const idx = filePath.indexOf("/uploads/");
        const rel = filePath.slice(idx); // /uploads/videos/...
        const fp = path.join(UPLOAD_ROOT, rel.replace("/uploads/",""));
        if(fs.existsSync(fp)) fs.unlinkSync(fp);
      }
    }catch{}
    db.prepare("DELETE FROM videos WHERE id=?").run(id);
    return res.json({success:true,message:"Video deleted"});
  }catch(e){return res.status(500).json({success:false,message:e.message});}
});

app.get("/api/videos", requireActiveUser, (req,res)=>{
  try{
    const vids=db.prepare(`
      SELECT v.*, COALESCE(uv.status,'pending') as user_status
      FROM videos v
      LEFT JOIN user_videos uv ON uv.video_id=v.id AND uv.user_id=?
      WHERE v.status='active' ORDER BY v.id DESC
    `).all(req.user.id);
    return res.json({success:true, videos: vids.map(v=>({
      id:v.id,title:v.title,description:v.description,video_url:v.video_url,url:v.video_url,thumbnail_url:v.thumbnail_url,
      reward:Number(v.reward||0),duration:Number(v.duration||0),status:v.status,
      user_status:v.user_status,completed:v.user_status==='completed'
    }))});
  }catch(e){return res.status(500).json({success:false,message:"Unable to load videos"});}
});
app.post("/api/videos/:id/open", requireActiveUser, (req,res)=>{
  try{
    const videoId=toPositiveInteger(req.params.id);
    if(!videoId) return res.status(400).json({success:false,message:"Invalid video"});
    const video=db.prepare("SELECT * FROM videos WHERE id=? AND status='active'").get(videoId);
    if(!video) return res.status(404).json({success:false,message:"Video not found"});
    db.prepare("INSERT INTO user_videos (user_id,video_id,status) VALUES (?,?, 'started') ON CONFLICT(user_id, video_id) DO UPDATE SET status='started' WHERE status='pending'").run(req.user.id, videoId);
   return res.json({success:true, message:"Video started"});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.post("/api/videos/:id/complete", requireActiveUser, (req,res)=>{
  try{
    const videoId=toPositiveInteger(req.params.id);
    if(!videoId) return res.status(400).json({success:false,message:"Invalid video"});
    const result=db.transaction(()=>{
      const video=db.prepare("SELECT * FROM videos WHERE id=? AND status='active'").get(videoId);
      if(!video) throw new Error("Video not found");
      const started = db.prepare("SELECT * FROM user_videos WHERE user_id=? AND video_id=?").get(req.user.id, videoId);
      const rewardRef=`VIDEO_REWARD_${req.user.id}_${videoId}`;
      const already=db.prepare("SELECT id FROM wallet_transactions WHERE reference=? LIMIT 1").get(rewardRef);
      if(already || (started && started.status==='completed')){
        return {already:true, reward:0};
      }
      db.prepare("INSERT INTO user_videos (user_id,video_id,status,completed_at) VALUES (?,?, 'completed', CURRENT_TIMESTAMP) ON CONFLICT(user_id, video_id) DO UPDATE SET status='completed', completed_at=CURRENT_TIMESTAMP").run(req.user.id, videoId);
      updateUserBalance(req.user.id,"wallet_balance", Number(video.reward));
      db.prepare("UPDATE users SET total_earned=total_earned+? WHERE id=?").run(Number(video.reward), req.user.id);
      recordWalletTransaction(req.user.id,"video_reward",Number(video.reward),"wallet",rewardRef,`Reward for video: ${video.title}`);
      return {already:false, reward:Number(video.reward)};
    })();
    const userBal = db.prepare("SELECT wallet_balance FROM users WHERE id=?").get(req.user.id);
    return res.json({success:true, message: result.already? "Already completed" : `₦${result.reward} credited`, reward: result.reward, alreadyCompleted: result.already, walletBalance: userBal.wallet_balance});
  }catch(e){return res.status(400).json({success:false,message:e.message});}
});
app.get("/api/history", requireUser, (req,res)=>{
  try{
    const tx = db.prepare("SELECT * FROM wallet_transactions WHERE user_id=? ORDER BY id DESC").all(req.user.id);
    const wd = db.prepare("SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC").all(req.user.id);
    return res.json({success:true, history: tx, transactions: tx, withdrawals: wd, wallet:{transactions: tx}});
  }catch(e){ return res.json({success:true, history:[], transactions:[], withdrawals:[], wallet:{transactions:[]}});}
});
app.get("/api/referrals", requireUser, (req,res)=>{
  try{
    const refs = db.prepare("SELECT u.id, u.username, u.full_name, u.package, u.created_at FROM users u WHERE u.referrer_id=? ORDER BY u.id DESC").all(req.user.id);
    const rewards = db.prepare("SELECT * FROM referral_rewards WHERE referrer_id=? ORDER BY id DESC").all(req.user.id);
    return res.json({success:true, referrals: refs, rewards, totalReferrals: refs.length});
  }catch(e){ return res.json({success:true, referrals:[], rewards:[]});}
});
app.use("/api",(req,res)=>{console.log("MISSING API:",req.method,req.originalUrl); return res.status(404).json({success:false,message:`API endpoint not found: ${req.method} ${req.originalUrl}`});});
app.use((error,req,res,next)=>{
  console.error("SERVER ERROR:",error);
  if(error instanceof multer.MulterError){
    if(error.code==='LIMIT_FILE_SIZE') return res.status(400).json({success:false,message:"Video too large - max 200MB"});
    return res.status(400).json({success:false,message:error.message});
  }
  if(res.headersSent)return next(error);
  return res.status(500).json({success:false,message:error.message||"Internal server error."});
});
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log("");
    console.log("==========================================");
    console.log(" JOVIA NETWORK SERVER - FULLY FIXED");
    console.log(` Server: http://${HOST}:${PORT}`);
    console.log(` DB: ${DB_PATH}`);
    console.log(` Volume: ${VOLUME_PATH || "local (add Volume in Railway!)"}`);
    console.log(` Admin: http://${HOST}:${PORT}/admin.html`);
    console.log(" Referral: Gold->Gold 13k, others 8k, Silver->Gold 0");
    console.log("==========================================");
    console.log("");
  });
}
module.exports = app;
