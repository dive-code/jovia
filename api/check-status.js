const path = require("path");
const fs = require("fs");
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method==="OPTIONS") return res.status(200).end();
  
  const email = (req.query.email || "").toLowerCase().trim();
  if(!email) return res.json({plan:"Silver", status:"inactive", success:false});
  
  try {
    const Database = require("better-sqlite3");
    const VOLUME_PATH = process.env.RAILWAY_VOLUME_MOUNT_PATH || "/data";
    let DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "jovia", "jovia.db");
    if(!fs.existsSync(DB_PATH)) DB_PATH = path.join(VOLUME_PATH, "jovia.db");
    if(!fs.existsSync(DB_PATH)) DB_PATH = "/data/jovia.db";
    
    const db = new Database(DB_PATH);
    const user = db.prepare("SELECT plan, status, account_status, is_paid, full_name FROM users WHERE LOWER(email)=LOWER(?)").get(email);
    db.close();
    
    if(!user) return res.json({plan:"Silver", status:"inactive", success:false});
    
    return res.json({
      plan: user.plan || "Silver", 
      status: user.status || user.account_status || "inactive", 
      paid: !!user.is_paid,
      name: user.full_name,
      success: true
    });
  } catch(e){
    return res.json({plan:"Silver", status:"inactive", success:false, error: e.message});
  }
};
