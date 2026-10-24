
const crypto = require("crypto");

module.exports = (app, db, requireUser, requireAdmin) => {
  // ============================================================
  // JOVIA CODES PLUGIN
  // SUPER upgrades, withdrawal codes, admin checks and user audit
  // ============================================================

  db.exec(`
    CREATE TABLE IF NOT EXISTS jovia_codes (
      code TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      price INTEGER DEFAULT 0,
      used INTEGER DEFAULT 0,
      used_by TEXT DEFAULT '',
      used_by_name TEXT DEFAULT '',
      used_by_email TEXT DEFAULT '',
      used_by_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      used_at TEXT
    );
  `);

  // ------------------------------------------------------------
  // SAFE SCHEMA CHECKS
  // ------------------------------------------------------------

  const userColumns = () =>
    db.prepare("PRAGMA table_info(users)").all().map(c => c.name);

  const addUserColumnIfMissing = (name, definition) => {
    if (!userColumns().includes(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
    }
  };

  addUserColumnIfMissing("package", "TEXT DEFAULT 'Silver'");
  addUserColumnIfMissing("plan", "TEXT DEFAULT 'Silver'");
  addUserColumnIfMissing("is_super", "INTEGER DEFAULT 0");

  // Optional legacy columns. Check again after every schema change.
  if (!userColumns().includes("account_status")) {
    try {
      addUserColumnIfMissing("account_status", "TEXT DEFAULT 'active'");
    } catch (error) {
      console.error("Could not add account_status:", error.message);
    }
  }

  if (!userColumns().includes("status")) {
    try {
      addUserColumnIfMissing("status", "TEXT DEFAULT 'active'");
    } catch (error) {
      console.error("Could not add status:", error.message);
    }
  }

  if (!userColumns().includes("username")) {
    try {
      addUserColumnIfMissing("username", "TEXT");
    } catch (error) {
      console.error("Could not add username:", error.message);
    }
  }

  if (!userColumns().includes("full_name")) {
    try {
      addUserColumnIfMissing("full_name", "TEXT");
    } catch (error) {
      console.error("Could not add full_name:", error.message);
    }
  }

  // Also migrate existing code tables created by older versions.
  const codeColumns = () =>
    db.prepare("PRAGMA table_info(jovia_codes)").all().map(c => c.name);

  const addCodeColumnIfMissing = (name, definition) => {
    if (!codeColumns().includes(name)) {
      db.exec(`ALTER TABLE jovia_codes ADD COLUMN ${name} ${definition}`);
    }
  };

  addCodeColumnIfMissing("used_by", "TEXT DEFAULT ''");
  addCodeColumnIfMissing("used_by_name", "TEXT DEFAULT ''");
  addCodeColumnIfMissing("used_by_email", "TEXT DEFAULT ''");
  addCodeColumnIfMissing("used_by_id", "INTEGER");
  addCodeColumnIfMissing("created_at", "TEXT");
  addCodeColumnIfMissing("used_at", "TEXT");

  // ------------------------------------------------------------
  // HELPERS
  // ------------------------------------------------------------

  const normalizeCode = value =>
    String(value || "").trim().toUpperCase();

  const randomCode = (length, prefix) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let suffix = "";

    for (let i = 0; i < length; i++) {
      suffix += alphabet[crypto.randomInt(0, alphabet.length)];
    }

    return prefix + suffix;
  };

  const getTotalCodes = () =>
    db.prepare("SELECT COUNT(*) AS total FROM jovia_codes").get().total;

  const ADMIN_PASS = process.env.ADMIN_PASSWORD || "Divine@@1";

  // Derive identity ONLY from the authenticated database user.
  const getSureUser = user => {
    const email = String(user.email || "").trim();
    const username = String(user.username || "").trim();
    const fullName = String(user.full_name || "").trim();
    const id = user.id;

    const sureName =
      fullName ||
      username ||
      (email ? email.split("@")[0] : "") ||
      `User${id}`;

    const sureEmail = email;
    const display = sureEmail
      ? `${sureName} (${sureEmail})`
      : `${sureName} (User ID ${id})`;

    return {
      sureName,
      sureEmail,
      display,
      id
    };
  };

  const userGuard = (req, res, next) => {
    if (typeof requireUser !== "function") {
      return res.status(503).json({
        success: false,
        message: "User authentication is not configured."
      });
    }

    return requireUser(req, res, () => {
      if (!req.user || !req.user.id) {
        return res.status(401).json({
          success: false,
          message: "Please log in to continue."
        });
      }

      next();
    });
  };

  const adminGuard = (req, res, next) => {
    const headerPass =
      req.headers["x-admin-password"] ||
      req.headers["x-admin-pass"];

    const bodyPass = String(
      req.body?.adminPass ||
      req.body?.password ||
      ""
    ).trim();

    if (
      headerPass === ADMIN_PASS ||
      bodyPass === ADMIN_PASS ||
      req.session?.isAdmin === true
    ) {
      return next();
    }

    return res.status(401).json({
      success: false,
      message: "Admin authentication required."
    });
  };

  const safeCodeRecord = row => {
    const used = Number(row.used) === 1;

    return {
      code: row.code,
      type: row.type,
      price: row.price,
      used,
      status: used ? "USED" : "UNUSED",
      used_by: row.used_by || "",
      used_by_name: row.used_by_name || "",
      used_by_email: row.used_by_email || "",
      used_by_id: row.used_by_id ?? null,
      user_details: used
        ? {
            name:
              row.used_by_name ||
              row.used_by ||
              "Name not saved",
            email: row.used_by_email || "",
            user_id: row.used_by_id ?? null
          }
        : null,
      created_at: row.created_at || null,
      used_at: row.used_at || null
    };
  };

  // ------------------------------------------------------------
  // ADMIN LOGIN
  // ------------------------------------------------------------

  const adminLoginHandler = (req, res) => {
    const password = String(req.body?.password || "").trim();
    const username = String(req.body?.username || "admin").trim();

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required."
      });
    }

    if (password !== ADMIN_PASS) {
      return res.status(401).json({
        success: false,
        message: "Wrong password."
      });
    }

    if (req.session) {
      req.session.isAdmin = true;

      return req.session.save(error => {
        if (error) {
          console.error("Admin session save failed:", error);

          return res.status(500).json({
            success: false,
            message: "Could not save the admin session."
          });
        }

        return res.json({ success: true });
      });
    }

    return res.json({
      success: true,
      message: "Password accepted. Session middleware is not configured."
    });
  };

  app.post("/api/admin/codes/login", adminLoginHandler);
  app.post("/api/admin/login", adminLoginHandler);

  // ------------------------------------------------------------
  // GENERATE CODES
  // ------------------------------------------------------------

  app.post("/api/admin/codes/generate", adminGuard, (req, res) => {
    try {
      const requestedType = String(req.body?.type || "").toLowerCase();

      const type =
        requestedType === "gold" ||
        requestedType === "super-gold"
          ? "super-gold"
          : requestedType === "silver" ||
            requestedType === "super-silver"
            ? "super-silver"
            : requestedType === "withdraw"
              ? "withdraw"
              : null;

      if (!type) {
        return res.status(400).json({
          success: false,
          message: "Invalid code type."
        });
      }

      const count = Number(req.body?.count ?? 1);

      if (!Number.isInteger(count) || count < 1 || count > 50) {
        return res.status(400).json({
          success: false,
          message: "Choose a quantity between 1 and 50."
        });
      }

      const price =
        type === "super-gold"
          ? 12000
          : type === "super-silver"
            ? 16000
            : 0;

      const prefix = type === "withdraw" ? "JOVIA-" : "SUPER-";
      const length = type === "withdraw" ? 6 : 8;

      const generateTransaction = db.transaction(() => {
        const generated = [];

        while (generated.length < count) {
          const code = randomCode(length, prefix);

          const result = db.prepare(`
            INSERT OR IGNORE INTO jovia_codes
              (code, type, price, used, used_by, used_by_name,
               used_by_email, used_by_id, created_at, used_at)
            VALUES (?, ?, ?, 0, '', '', '', NULL, datetime('now'), NULL)
          `).run(code, type, price);

          if (result.changes === 1) {
            generated.push({
              code,
              type,
              price,
              used: false,
              status: "UNUSED"
            });
          }
        }

        return generated;
      });

      const codes = generateTransaction();

      return res.json({
        success: true,
        codes,
        total: getTotalCodes()
      });
    } catch (error) {
      console.error("Jovia code generation failed:", error);

      return res.status(500).json({
        success: false,
        message: "Could not generate codes."
      });
    }
  });

  // ------------------------------------------------------------
  // LIST ALL CODES, INCLUDING THE REDEEMING USER
  // ------------------------------------------------------------

  app.get("/api/admin/codes/list", adminGuard, (req, res) => {
    try {
      const rows = db.prepare(`
        SELECT *
        FROM jovia_codes
        ORDER BY created_at DESC, code ASC
      `).all();

      return res.json({
        success: true,
        total: rows.length,
        codes: rows.map(safeCodeRecord)
      });
    } catch (error) {
      console.error("Jovia code list failed:", error);

      return res.status(500).json({
        success: false,
        message: "Could not load codes."
      });
    }
  });

  // ------------------------------------------------------------
  // CHECK ONE CODE
  // ------------------------------------------------------------

  app.get("/api/admin/codes/check/:code", adminGuard, (req, res) => {
    try {
      const code = normalizeCode(req.params.code);

      const row = db.prepare(`
        SELECT *
        FROM jovia_codes
        WHERE code = ?
      `).get(code);

      if (!row) {
        return res.status(404).json({
          success: false,
          exists: false,
          message: "Code not found."
        });
      }

      return res.json({
        success: true,
        exists: true,
        ...safeCodeRecord(row)
      });
    } catch (error) {
      console.error("Jovia code check failed:", error);

      return res.status(500).json({
        success: false,
        message: "Could not check this code."
      });
    }
  });

  // ------------------------------------------------------------
  // APPLY SUPER UPGRADE
  // Save the upgrade and code redemption in one transaction.
  // ------------------------------------------------------------

  app.post("/api/upgrade/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);

    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "Enter a SUPER code."
      });
    }

    try {
      const redeemTransaction = db.transaction(() => {
        const user = db.prepare(
          "SELECT * FROM users WHERE id = ?"
        ).get(req.user.id);

        if (!user) throw new Error("USER_NOT_FOUND");

        const code = db.prepare(
          "SELECT * FROM jovia_codes WHERE code = ?"
        ).get(raw);

        if (!code) throw new Error("INVALID");
        if (Number(code.used) === 1) throw new Error("USED");

        if (
          code.type !== "super-gold" &&
          code.type !== "super-silver"
        ) {
          throw new Error("WRONG");
        }

        const sure = getSureUser(user);

        // Update available plan columns.
        const assignments = ["package = ?", "is_super = ?"];
        const values = ["SUPER", 1];

        if (hasColumn("plan")) {
          assignments.push("plan = ?");
          values.push("SUPER");
        }

        if (hasColumn("account_status")) {
          assignments.push("account_status = ?");
          values.push("active");
        }

        if (hasColumn("status")) {
          assignments.push("status = ?");
          values.push("active");
        }

        values.push(user.id);

        const userUpdate = db.prepare(`
          UPDATE users
          SET ${assignments.join(", ")}
          WHERE id = ?
        `).run(...values);

        if (userUpdate.changes !== 1) {
          throw new Error("USER_UPDATE_FAILED");
        }

        // Claim the code only if it is still unused.
        const codeUpdate = db.prepare(`
          UPDATE jovia_codes
          SET used = 1,
              used_by = ?,
              used_by_name = ?,
              used_by_email = ?,
              used_by_id = ?,
              used_at = datetime('now')
          WHERE code = ? AND used = 0
        `).run(
          sure.display,
          sure.sureName,
          sure.sureEmail,
          sure.id,
          raw
        );

        if (codeUpdate.changes !== 1) {
          throw new Error("CODE_UPDATE_FAILED");
        }

        const savedCode = db.prepare(`
          SELECT *
          FROM jovia_codes
          WHERE code = ?
        `).get(raw);

        const savedUser = db.prepare(`
          SELECT id, full_name, username, email, package, plan, is_super
          FROM users
          WHERE id = ?
        `).get(user.id);

        return {
          sure,
          savedCode,
          savedUser
        };
      });

      const result = redeemTransaction();

      return res.json({
        success: true,
        message: `SUPER upgrade successful for ${result.sure.sureName}!`,
        user: result.savedUser,
        code: safeCodeRecord(result.savedCode)
      });
    } catch (error) {
      const responses = {
        USER_NOT_FOUND: [404, "User not found."],
        INVALID: [404, "Invalid code."],
        USED: [409, "Code already used."],
        WRONG: [400, "This is not a SUPER upgrade code."],
        USER_UPDATE_FAILED: [500, "Account update failed."],
        CODE_UPDATE_FAILED: [409, "Code could not be redeemed. Please try again."]
      };

      if (responses[error.message]) {
        const [status, message] = responses[error.message];

        return res.status(status).json({
          success: false,
          message
        });
      }

      console.error("Jovia SUPER upgrade failed:", error);

      return res.status(500).json({
        success: false,
        message: "Upgrade failed. Please try again."
      });
    }
  });

  // ------------------------------------------------------------
  // APPLY WITHDRAWAL CODE
  // ------------------------------------------------------------

  app.post("/api/withdraw/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);

    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "Enter a withdrawal code."
      });
    }

    try {
      const redeemTransaction = db.transaction(() => {
        const user = db.prepare(
          "SELECT * FROM users WHERE id = ?"
        ).get(req.user.id);

        if (!user) throw new Error("USER_NOT_FOUND");

        const row = db.prepare(
          "SELECT * FROM jovia_codes WHERE code = ?"
        ).get(raw);

        if (!row) throw new Error("INVALID");
        if (row.type !== "withdraw") throw new Error("WRONG");

        if (Number(row.used) === 1) {
          const who =
            row.used_by_name ||
            row.used_by_email ||
            row.used_by ||
            `User ID ${row.used_by_id || "unknown"}`;

          throw new Error(`USED:${who}`);
        }

        const sure = getSureUser(user);

        const update = db.prepare(`
          UPDATE jovia_codes
          SET used = 1,
              used_by = ?,
              used_by_name = ?,
              used_by_email = ?,
              used_by_id = ?,
              used_at = datetime('now')
          WHERE code = ? AND used = 0
        `).run(
          sure.display,
          sure.sureName,
          sure.sureEmail,
          sure.id,
          raw
        );

        if (update.changes !== 1) {
          throw new Error("CODE_UPDATE_FAILED");
        }

        const savedCode = db.prepare(
          "SELECT * FROM jovia_codes WHERE code = ?"
        ).get(raw);

        return { sure, savedCode };
      });

      const result = redeemTransaction();

      return res.json({
        success: true,
        message: `Withdrawal code accepted for ${result.sure.sureName}.`,
        user: result.sure,
        code: safeCodeRecord(result.savedCode)
      });
    } catch (error) {
      if (error.message === "USER_NOT_FOUND") {
        return res.status(404).json({
          success: false,
          message: "User not found."
        });
      }

      if (error.message === "INVALID") {
        return res.status(404).json({
          success: false,
          message: "Invalid withdrawal code."
        });
      }

      if (error.message === "WRONG") {
        return res.status(400).json({
          success: false,
          message: "Wrong code type."
        });
      }

      if (error.message.startsWith("USED:")) {
        return res.status(409).json({
          success: false,
          message: `Code already used by ${error.message.slice(5)}.`
        });
      }

      if (error.message === "CODE_UPDATE_FAILED") {
        return res.status(409).json({
          success: false,
          message: "Code was just used by another request."
        });
      }

      console.error("Jovia withdrawal code failed:", error);

      return res.status(500).json({
        success: false,
        message: "Could not process withdrawal code."
      });
    }
  });

  // ------------------------------------------------------------
  // OPTIONAL: LOOK UP THE USER WHO REDEEMED A CODE BY USER ID
  // ------------------------------------------------------------

  app.get("/api/admin/codes/:code/user", adminGuard, (req, res) => {
    try {
      const code = normalizeCode(req.params.code);

      const row = db.prepare(`
        SELECT *
        FROM jovia_codes
        WHERE code = ?
      `).get(code);

      if (!row) {
        return res.status(404).json({
          success: false,
          message: "Code not found."
        });
      }

      if (Number(row.used) !== 1) {
        return res.json({
          success: true,
          used: false,
          message: "This code has not been used."
        });
      }

      let user = null;

      if (row.used_by_id != null) {
        user = db.prepare(`
          SELECT id, full_name, username, email, phone, package, plan
          FROM users
          WHERE id = ?
        `).get(row.used_by_id) || null;
      }

      return res.json({
        success: true,
        used: true,
        code: safeCodeRecord(row),
        user
      });
    } catch (error) {
      console.error("Redeemer lookup failed:", error);

      return res.status(500).json({
        success: false,
        message: "Could not look up the user."
      });
    }
  });

  console.log("JOVIA Codes plugin loaded successfully.");
};
