
const crypto = require("crypto");

module.exports = (app, db, requireUser, requireAdmin) => {
  // --------------------------------------------------
  // JOVIA CODES PLUGIN — CORRECTED SUPER HANDLING
  // --------------------------------------------------

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

  const userColumns = () =>
    db.prepare("PRAGMA table_info(users)").all().map(c => c.name);

  let columns = userColumns();

  if (!columns.includes("is_super")) {
    db.exec("ALTER TABLE users ADD COLUMN is_super INTEGER NOT NULL DEFAULT 0");
  }

  columns = userColumns();

  if (!columns.includes("plan")) {
    db.exec("ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'Silver'");
  }

  const hasColumn = name => userColumns().includes(name);

  const randomCode = (length, prefix) => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let suffix = "";

    for (let i = 0; i < length; i++) {
      suffix += alphabet[crypto.randomInt(0, alphabet.length)];
    }

    return prefix + suffix;
  };

  const normalizeCode = value =>
    String(value || "").trim().toUpperCase();

  const getTotalCodes = () =>
    Number(db.prepare("SELECT COUNT(*) AS total FROM jovia_codes").get().total);

  const userGuard = (req, res, next) => {
    if (typeof requireUser !== "function") {
      return res.status(503).json({
        success: false,
        message: "User authentication middleware is not configured."
      });
    }

    return requireUser(req, res, () => {
      if (!req.user?.id) {
        return res.status(401).json({
          success: false,
          message: "Please log in to continue."
        });
      }
      next();
    });
  };

  const adminGuard = (req, res, next) => {
    if (typeof requireAdmin !== "function") {
      return res.status(503).json({
        success: false,
        message: "Admin authentication middleware is not configured."
      });
    }

    return requireAdmin(req, res, next);
  };

  // --------------------------------------------------
  // GENERATE CODES — ADMIN ONLY
  // --------------------------------------------------

  app.post("/api/admin/codes/generate", adminGuard, (req, res) => {
    try {
      const requestedType = String(req.body?.type || "").toLowerCase();

      const type =
        requestedType === "gold" || requestedType === "super-gold"
          ? "super-gold"
          : requestedType === "silver" || requestedType === "super-silver"
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

      const count = Number(req.body?.count);

      if (!Number.isInteger(count) || count < 1 || count > 50) {
        return res.status(400).json({
          success: false,
          message: "Choose a quantity between 1 and 50."
        });
      }

      const price =
        type === "super-gold" ? 12000 :
        type === "super-silver" ? 16000 : 0;

      const prefix = type === "withdraw" ? "JOVIA-" : "SUPER-";
      const length = type === "withdraw" ? 6 : 8;

      const generateTransaction = db.transaction(() => {
        const generated = [];

        while (generated.length < count) {
          const code = randomCode(length, prefix);

          const result = db.prepare(`
            INSERT OR IGNORE INTO jovia_codes
              (code, type, price, used, created_at)
            VALUES (?, ?, ?, 0, datetime('now'))
          `).run(code, type, price);

          if (result.changes === 1) {
            generated.push({ code, type, price, used: 0 });
          }
        }

        return generated;
      });

      const generated = generateTransaction();

      return res.json({
        success: true,
        codes: generated,
        total: getTotalCodes()
      });
    } catch (error) {
      console.error("JOVIA code generation failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Could not generate codes."
      });
    }
  });

  // --------------------------------------------------
  // APPLY SUPER CODE — AUTHENTICATED MEMBER ONLY
  // IMPORTANT: package remains Silver/Gold due to DB constraint.
  // is_super is the authoritative SUPER access flag.
  // --------------------------------------------------

  app.post("/api/upgrade/apply", userGuard, (req, res) => {
    const raw = normalizeCode(req.body?.code);

    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "Enter a SUPER code."
      });
    }

    try {
      const upgradeTransaction = db.transaction(() => {
        const user = db.prepare(
          "SELECT * FROM users WHERE id = ?"
        ).get(req.user.id);

        if (!user) throw new Error("USER_NOT_FOUND");

        if (Number(user.is_super) === 1) {
          return {
            alreadySuper: true,
            user: db.prepare(`
              SELECT id, username, email, package, is_super
              FROM users WHERE id = ?
            `).get(user.id)
          };
        }

        const code = db.prepare(
          "SELECT * FROM jovia_codes WHERE code = ?"
        ).get(raw);

        if (!code) throw new Error("INVALID_CODE");

        if (!["super-gold", "super-silver"].includes(code.type)) {
          throw new Error("WRONG_CODE_TYPE");
        }

        if (Number(code.used) === 1) {
          throw new Error("CODE_ALREADY_USED");
        }

        // Do NOT set package = 'SUPER'.
        // The users.package CHECK constraint permits only Silver/Gold.
        const assignments = ["is_super = 1"];
        const values = [];

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

        const update = db.prepare(`
          UPDATE users
          SET ${assignments.join(", ")}
          WHERE id = ?
        `).run(...values);

        if (update.changes !== 1) {
          throw new Error("USER_UPDATE_FAILED");
        }

        const email = String(user.email || "");
        const username = String(
          user.username || email.split("@")[0] || "User"
        );
        const displayName = `${username} (${email})`;

        const markCode = db.prepare(`
          UPDATE jovia_codes
          SET used = 1,
              used_by = ?,
              used_by_name = ?,
              used_by_email = ?,
              used_by_id = ?,
              used_at = datetime('now')
          WHERE code = ? AND used = 0
        `).run(displayName, username, email, user.id, raw);

        if (markCode.changes !== 1) {
          throw new Error("CODE_REDEMPTION_FAILED");
        }

        const updatedUser = db.prepare(`
          SELECT id, full_name, username, email,
                 package, is_super
          FROM users
          WHERE id = ?
        `).get(user.id);

        return { alreadySuper: false, user: updatedUser };
      });

      const result = upgradeTransaction();

      return res.json({
        success: true,
        message: result.alreadySuper
          ? "This account is already SUPER."
          : "SUPER upgrade successful.",
        user: {
          ...result.user,
          is_super: Number(result.user.is_super) === 1,
          package: Number(result.user.is_super) === 1
            ? "SUPER"
            : result.user.package
        }
      });
    } catch (error) {
      const messages = {
        USER_NOT_FOUND: "Your account could not be found. Please log in again.",
        INVALID_CODE: "Invalid SUPER code.",
        WRONG_CODE_TYPE: "This code cannot be used for a SUPER upgrade.",
        CODE_ALREADY_USED: "This code has already been used.",
        USER_UPDATE_FAILED: "The account update failed. No upgrade was completed.",
        CODE_REDEMPTION_FAILED: "The code could not be redeemed. Please try again."
      };

      if (messages[error.message]) {
        const status =
          error.message === "INVALID_CODE" ? 404 :
          error.message === "CODE_ALREADY_USED" ? 409 : 400;

        return res.status(status).json({
          success: false,
          message: messages[error.message]
        });
      }

      console.error("JOVIA SUPER upgrade failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Upgrade failed. Please try again."
      });
    }
  });

  // --------------------------------------------------
  // CHECK A CODE — ADMIN ONLY
  // --------------------------------------------------

  app.get("/api/admin/codes/check/:code", adminGuard, (req, res) => {
    try {
      const code = normalizeCode(req.params.code);
      const row = db.prepare(
        "SELECT * FROM jovia_codes WHERE code = ?"
      ).get(code);

      if (!row) {
        return res.json({
          success: true,
          exists: false,
          total: getTotalCodes()
        });
      }

      return res.json({
        success: true,
        exists: true,
        code: row.code,
        type: row.type,
        price: row.price,
        used: row.used,
        used_by: row.used_by,
        used_by_name: row.used_by_name,
        used_by_email: row.used_by_email,
        created_at: row.created_at,
        used_at: row.used_at
      });
    } catch (error) {
      console.error("JOVIA code check failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Could not check this code."
      });
    }
  });

  // --------------------------------------------------
  // LIST ALL CODES — ADMIN ONLY
  // --------------------------------------------------

  app.get("/api/admin/codes/list", adminGuard, (req, res) => {
    try {
      const codes = db.prepare(`
        SELECT code, type, price, used, used_by,
               used_by_name, used_by_email, used_by_id,
               created_at, used_at
        FROM jovia_codes
        ORDER BY created_at DESC
      `).all();

      return res.json({
        success: true,
        total: codes.length,
        codes
      });
    } catch (error) {
      console.error("JOVIA code list failed:", error.message);
      return res.status(500).json({
        success: false,
        message: "Could not load code history."
      });
    }
  });

  console.log("JOVIA Codes plugin loaded — corrected SUPER handling.");
};
