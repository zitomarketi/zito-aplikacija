const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("sqlite3");
const { Pool } = require("pg");

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    points: row.points,
    coupons: row.coupons,
    cardNumber: row.card_number,
  };
}

function mapProductPrice(row) {
  if (!row) return null;
  return {
    barcode: row.barcode,
    name: row.name,
    price: row.price,
    currency: row.currency,
    unit: row.unit,
    updatedAt: row.updated_at,
  };
}

function mapVoucher(row) {
  if (!row) return null;
  return {
    id: row.id,
    barcode: row.barcode,
    amount: Number(row.amount),
    currency: row.currency,
    status: row.status,
    sourceFile: row.source_file || row.sourceFile || "",
    importBatchId: row.import_batch_id || row.importBatchId || "",
    createdAt: row.created_at || row.createdAt,
    updatedAt: row.updated_at || row.updatedAt,
  };
}

function mapVoucherAssignmentRow(row) {
  if (!row) return null;
  return {
    id: row.assignment_id || row.id,
    voucherId: row.voucher_id || row.voucherId,
    userId: row.user_id || row.userId || "",
    cardNumber: row.card_number || row.cardNumber || "",
    assignmentType: row.assignment_type || row.assignmentType || "",
    amount: Number(row.amount_snapshot ?? row.amount ?? 0),
    currency: row.currency || "MKD",
    barcode: row.barcode || "",
    voucherStatus: row.voucher_status || row.voucherStatus || "",
    assignedAt: row.assigned_at || row.assignedAt || "",
    validFrom: row.valid_from || row.validFrom || "",
    expiresAt: row.expires_at || row.expiresAt || "",
    usedAt: row.used_at || row.usedAt || "",
    periodKey: row.period_key || row.periodKey || "",
    status: row.assignment_status || row.status || "active",
  };
}

function readMigrationFiles(engine) {
  const dir = path.join(__dirname, "migrations", engine);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({
      version: name.replace(".sql", ""),
      sql: fs.readFileSync(path.join(dir, name), "utf-8"),
    }));
}

function splitSqliteStatements(sql) {
  return sql
    .split(/;\s*\n/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function ensurePostgresVoucherSchema(q) {
  await q(`CREATE TABLE IF NOT EXISTS vouchers (
    id TEXT PRIMARY KEY,
    barcode TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'MKD',
    status TEXT NOT NULL DEFAULT 'free',
    source_file TEXT NOT NULL DEFAULT '',
    import_batch_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  await q("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'MKD'");
  await q("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'free'");
  await q("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS source_file TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS import_batch_id TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT ''");
  await q("CREATE UNIQUE INDEX IF NOT EXISTS vouchers_barcode_unique_idx ON vouchers(barcode)");

  await q(`CREATE TABLE IF NOT EXISTS voucher_assignments (
    id TEXT PRIMARY KEY,
    voucher_id TEXT NOT NULL REFERENCES vouchers(id),
    user_id TEXT,
    card_number TEXT,
    assignment_type TEXT NOT NULL,
    amount_snapshot NUMERIC NOT NULL DEFAULT 0,
    assigned_by TEXT NOT NULL DEFAULT 'system',
    assigned_at TEXT NOT NULL DEFAULT '',
    valid_from TEXT,
    expires_at TEXT,
    used_at TEXT,
    used_reference TEXT,
    period_key TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active'
  )`);
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS user_id TEXT");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS card_number TEXT");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS assignment_type TEXT NOT NULL DEFAULT 'manual_admin'");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS amount_snapshot NUMERIC NOT NULL DEFAULT 0");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS assigned_by TEXT NOT NULL DEFAULT 'system'");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS assigned_at TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS valid_from TEXT");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS expires_at TEXT");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS used_at TEXT");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS used_reference TEXT");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS period_key TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE voucher_assignments ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'");
  await q("CREATE UNIQUE INDEX IF NOT EXISTS voucher_assignments_voucher_id_unique_idx ON voucher_assignments(voucher_id)");

  await q(`CREATE TABLE IF NOT EXISTS voucher_rules (
    key TEXT PRIMARY KEY,
    value_text TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
  )`);
  await q("ALTER TABLE voucher_rules ADD COLUMN IF NOT EXISTS value_text TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE voucher_rules ADD COLUMN IF NOT EXISTS updated_at TEXT NOT NULL DEFAULT ''");

  await q(`CREATE TABLE IF NOT EXISTS voucher_events (
    id TEXT PRIMARY KEY,
    voucher_id TEXT NOT NULL REFERENCES vouchers(id),
    assignment_id TEXT,
    event_type TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    meta_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT ''
  )`);
  await q("ALTER TABLE voucher_events ADD COLUMN IF NOT EXISTS assignment_id TEXT");
  await q("ALTER TABLE voucher_events ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE voucher_events ADD COLUMN IF NOT EXISTS actor_type TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE voucher_events ADD COLUMN IF NOT EXISTS actor_id TEXT NOT NULL DEFAULT ''");
  await q("ALTER TABLE voucher_events ADD COLUMN IF NOT EXISTS meta_json TEXT NOT NULL DEFAULT '{}'");
  await q("ALTER TABLE voucher_events ADD COLUMN IF NOT EXISTS created_at TEXT NOT NULL DEFAULT ''");
}

function dbFactory() {
  const pgUrl = process.env.DATABASE_URL;
  if (pgUrl) return createPgStore(pgUrl);
  return createSqliteStore(path.join(__dirname, "zito.db"));
}

function createSqliteStore(filePath) {
  const raw = new sqlite3.Database(filePath);

  const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
      raw.run(sql, params, function onRun(err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
      raw.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
      raw.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

  return {
    type: "sqlite",
    async init() {
      await run("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)");
      const appliedRows = await all("SELECT version FROM schema_migrations");
      const applied = new Set(appliedRows.map((r) => r.version));
      const migrations = readMigrationFiles("sqlite");

      for (const migration of migrations) {
        if (applied.has(migration.version)) continue;
        const statements = splitSqliteStatements(migration.sql);
        for (const stmt of statements) {
          await run(stmt);
        }
        await run("INSERT INTO schema_migrations (version) VALUES (?)", [migration.version]);
      }
    },
    async getUserByEmail(email) {
      const row = await get("SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1", [email]);
      return mapUser(row);
    },
    async getUserById(id) {
      const row = await get("SELECT * FROM users WHERE id = ? LIMIT 1", [id]);
      return mapUser(row);
    },
    async getUserByCardNumber(cardNumber) {
      const row = await get("SELECT * FROM users WHERE card_number = ? LIMIT 1", [cardNumber]);
      return mapUser(row);
    },
    async getFirstUser() {
      const row = await get("SELECT * FROM users ORDER BY id LIMIT 1");
      return mapUser(row);
    },
    async createUser(user) {
      await run(
        "INSERT INTO users (id, name, email, password_hash, points, coupons, card_number) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [user.id, user.name, user.email, user.passwordHash, user.points, user.coupons, user.cardNumber],
      );
      return this.getUserById(user.id);
    },
    async updateUserProfile(id, profile) {
      await run("UPDATE users SET name = ?, email = ? WHERE id = ?", [profile.name, profile.email, id]);
      return this.getUserById(id);
    },
    async updateUserPassword(id, passwordHash) {
      await run("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, id]);
      return this.getUserById(id);
    },
    async updateUserCardNumber(id, cardNumber) {
      await run("UPDATE users SET card_number = ? WHERE id = ?", [cardNumber, id]);
      return this.getUserById(id);
    },
    async listFlyers() {
      return all("SELECT id, title, price, image FROM flyers ORDER BY id DESC");
    },
    async listNotifications() {
      return all(
        "SELECT id, title, body, created_at AS createdAt, kind, media_url AS mediaUrl, thumbnail_url AS thumbnailUrl FROM notifications ORDER BY id DESC",
      );
    },
    async listProductPrices(limit = 500) {
      const safeLimit = Math.max(1, Math.min(2000, Number(limit) || 500));
      return all(
        "SELECT barcode, name, price, currency, unit, updated_at AS updatedAt FROM product_prices ORDER BY updated_at DESC, barcode ASC LIMIT ?",
        [safeLimit],
      );
    },
    async listCmsAssets(groupName) {
      return all(
        "SELECT group_name AS groupName, file_name AS fileName, mime_type AS mimeType, updated_at AS updatedAt FROM cms_assets WHERE group_name = ? ORDER BY file_name ASC",
        [groupName],
      );
    },
    async getCmsAsset(groupName, fileName) {
      const row = await get(
        "SELECT group_name AS groupName, file_name AS fileName, mime_type AS mimeType, data, updated_at AS updatedAt FROM cms_assets WHERE group_name = ? AND file_name = ? LIMIT 1",
        [groupName, fileName],
      );
      if (!row) return null;
      return {
        groupName: row.groupName,
        fileName: row.fileName,
        mimeType: row.mimeType,
        data: row.data,
        updatedAt: row.updatedAt,
      };
    },
    async upsertCmsAsset(asset) {
      await run(
        `INSERT INTO cms_assets (group_name, file_name, mime_type, data, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(group_name, file_name) DO UPDATE SET
           mime_type = excluded.mime_type,
           data = excluded.data,
           updated_at = excluded.updated_at`,
        [asset.groupName, asset.fileName, asset.mimeType, asset.data, asset.updatedAt],
      );
      return this.getCmsAsset(asset.groupName, asset.fileName);
    },
    async deleteCmsAsset(groupName, fileName) {
      const result = await run("DELETE FROM cms_assets WHERE group_name = ? AND file_name = ?", [groupName, fileName]);
      return Number(result?.changes || 0) > 0;
    },
    async addFlyer(flyer) {
      await run("INSERT INTO flyers (id, title, price, image) VALUES (?, ?, ?, ?)", [
        flyer.id,
        flyer.title,
        flyer.price,
        flyer.image,
      ]);
      return flyer;
    },
    async addNotification(notice) {
      await run(
        "INSERT INTO notifications (id, title, body, created_at, kind, media_url, thumbnail_url) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          notice.id,
          notice.title,
          notice.body,
          notice.createdAt,
          notice.kind || "text",
          notice.mediaUrl || "",
          notice.thumbnailUrl || "",
        ],
      );
      return notice;
    },
    async deleteFlyerById(id) {
      const result = await run("DELETE FROM flyers WHERE id = ?", [id]);
      return Number(result?.changes || 0) > 0;
    },
    async deleteNotificationById(id) {
      const result = await run("DELETE FROM notifications WHERE id = ?", [id]);
      return Number(result?.changes || 0) > 0;
    },
    async addPushToken(token) {
      await run("INSERT OR IGNORE INTO push_tokens (token) VALUES (?)", [token]);
    },
    async listPushTokens() {
      const rows = await all("SELECT token FROM push_tokens");
      return rows.map((r) => r.token);
    },
    async getProductPriceByBarcode(barcode) {
      const row = await get("SELECT * FROM product_prices WHERE barcode = ? LIMIT 1", [barcode]);
      return mapProductPrice(row);
    },
    async upsertProductPrice(item) {
      await run(
        `INSERT INTO product_prices (barcode, name, price, currency, unit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(barcode) DO UPDATE SET
           name = excluded.name,
           price = excluded.price,
           currency = excluded.currency,
           unit = excluded.unit,
           updated_at = excluded.updated_at`,
        [item.barcode, item.name, item.price, item.currency, item.unit, item.updatedAt],
      );
      return this.getProductPriceByBarcode(item.barcode);
    },
    async deleteProductPriceByBarcode(barcode) {
      const result = await run("DELETE FROM product_prices WHERE barcode = ?", [barcode]);
      return Number(result?.changes || 0) > 0;
    },
    async getVoucherByBarcode(barcode) {
      const row = await get("SELECT * FROM vouchers WHERE barcode = ? LIMIT 1", [barcode]);
      return mapVoucher(row);
    },
    async createVoucher(voucher) {
      const result = await run(
        `INSERT OR IGNORE INTO vouchers (id, barcode, amount, currency, status, source_file, import_batch_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          voucher.id,
          voucher.barcode,
          voucher.amount,
          voucher.currency,
          voucher.status,
          voucher.sourceFile,
          voucher.importBatchId,
          voucher.createdAt,
          voucher.updatedAt,
        ],
      );
      if (Number(result?.changes || 0) < 1) return null;
      return this.getVoucherByBarcode(voucher.barcode);
    },
    async getVoucherById(id) {
      const row = await get("SELECT * FROM vouchers WHERE id = ? LIMIT 1", [id]);
      return mapVoucher(row);
    },
    async listVouchers({ status = "", limit = 100 } = {}) {
      const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
      const rows = status
        ? await all("SELECT * FROM vouchers WHERE status = ? ORDER BY created_at DESC, barcode ASC LIMIT ?", [status, safeLimit])
        : await all("SELECT * FROM vouchers ORDER BY created_at DESC, barcode ASC LIMIT ?", [safeLimit]);
      return rows.map(mapVoucher);
    },
    async getVoucherSummary() {
      const rows = await all("SELECT status, COUNT(*) AS count FROM vouchers GROUP BY status");
      const summary = { free: 0, assigned: 0, used: 0, expired: 0, void: 0, total: 0 };
      for (const row of rows) {
        const key = String(row.status || "");
        const count = Number(row.count || 0);
        if (Object.prototype.hasOwnProperty.call(summary, key)) summary[key] = count;
        summary.total += count;
      }
      return summary;
    },
    async findFreeVoucher({ barcode = "", amount = null } = {}) {
      const normalizedAmount = Number(amount);
      const hasAmountFilter = Number.isFinite(normalizedAmount) && normalizedAmount > 0;
      const row = barcode
        ? await get("SELECT * FROM vouchers WHERE barcode = ? AND status = 'free' LIMIT 1", [barcode])
        : hasAmountFilter
          ? await get(
            "SELECT * FROM vouchers WHERE status = 'free' AND amount = ? ORDER BY created_at ASC, barcode ASC LIMIT 1",
            [normalizedAmount],
          )
          : await get("SELECT * FROM vouchers WHERE status = 'free' ORDER BY created_at ASC, barcode ASC LIMIT 1");
      return mapVoucher(row);
    },
    async markVoucherAssigned(voucherId, updatedAt) {
      const result = await run("UPDATE vouchers SET status = 'assigned', updated_at = ? WHERE id = ? AND status = 'free'", [updatedAt, voucherId]);
      return Number(result?.changes || 0) > 0;
    },
    async createVoucherAssignment(assignment) {
      await run(
        `INSERT INTO voucher_assignments (
          id, voucher_id, user_id, card_number, assignment_type, amount_snapshot, assigned_by, assigned_at, valid_from, expires_at, used_at, used_reference, period_key, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assignment.id,
          assignment.voucherId,
          assignment.userId || null,
          assignment.cardNumber || null,
          assignment.assignmentType,
          assignment.amountSnapshot,
          assignment.assignedBy,
          assignment.assignedAt,
          assignment.validFrom || null,
          assignment.expiresAt || null,
          assignment.usedAt || null,
          assignment.usedReference || null,
          assignment.periodKey || "",
          assignment.status,
        ],
      );
      return assignment;
    },
    async findVoucherAssignmentByPeriod({ userId = "", cardNumber = "", assignmentType = "", periodKey = "" } = {}) {
      const row = await get(
        `SELECT
           va.id AS assignment_id,
           va.voucher_id,
           va.user_id,
           va.card_number,
           va.assignment_type,
           va.amount_snapshot,
           va.assigned_at,
           va.valid_from,
           va.expires_at,
           va.used_at,
           va.period_key,
           va.status AS assignment_status,
           v.barcode,
           v.status AS voucher_status,
           v.currency
         FROM voucher_assignments va
         INNER JOIN vouchers v ON v.id = va.voucher_id
         WHERE va.assignment_type = ?
           AND va.period_key = ?
           AND (va.user_id = ? OR (va.card_number = ? AND ? <> ''))
         ORDER BY va.assigned_at DESC, va.id DESC
         LIMIT 1`,
        [assignmentType, periodKey, userId || "", cardNumber || "", cardNumber || ""],
      );
      return mapVoucherAssignmentRow(row);
    },
    async getVoucherAssignmentByBarcode(barcode) {
      const row = await get(
        `SELECT
           va.id AS assignment_id,
           va.voucher_id,
           va.user_id,
           va.card_number,
           va.assignment_type,
           va.amount_snapshot,
           va.assigned_at,
           va.valid_from,
           va.expires_at,
           va.used_at,
           va.used_reference,
           va.period_key,
           va.status AS assignment_status,
           v.barcode,
           v.status AS voucher_status,
           v.currency
         FROM voucher_assignments va
         INNER JOIN vouchers v ON v.id = va.voucher_id
         WHERE v.barcode = ?
         ORDER BY va.assigned_at DESC, va.id DESC
         LIMIT 1`,
        [barcode],
      );
      return mapVoucherAssignmentRow(row);
    },
    async redeemVoucherAssignment({ assignmentId, voucherId, usedAt, usedReference }) {
      await run("BEGIN TRANSACTION");
      try {
        const assignmentResult = await run(
          "UPDATE voucher_assignments SET status = 'used', used_at = ?, used_reference = ? WHERE id = ? AND status = 'active' AND (used_at IS NULL OR used_at = '')",
          [usedAt, usedReference || null, assignmentId],
        );
        if (Number(assignmentResult?.changes || 0) < 1) {
          await run("ROLLBACK");
          return false;
        }
        const voucherResult = await run(
          "UPDATE vouchers SET status = 'used', updated_at = ? WHERE id = ? AND status = 'assigned'",
          [usedAt, voucherId],
        );
        if (Number(voucherResult?.changes || 0) < 1) {
          await run("ROLLBACK");
          return false;
        }
        await run("COMMIT");
        return true;
      } catch (error) {
        try {
          await run("ROLLBACK");
        } catch (_rollbackError) {
          // ignore rollback failure
        }
        throw error;
      }
    },
    async listVoucherAssignmentsForUser(userId, cardNumber) {
      const rows = await all(
        `SELECT
           va.id AS assignment_id,
           va.voucher_id,
           va.user_id,
           va.card_number,
           va.assignment_type,
           va.amount_snapshot,
           va.assigned_at,
           va.valid_from,
           va.expires_at,
           va.used_at,
           va.period_key,
           va.status AS assignment_status,
           v.barcode,
           v.status AS voucher_status,
           v.currency
         FROM voucher_assignments va
         INNER JOIN vouchers v ON v.id = va.voucher_id
         WHERE va.user_id = ? OR (va.card_number = ? AND ? <> '')
         ORDER BY va.assigned_at DESC, va.id DESC`,
        [userId, cardNumber || "", cardNumber || ""],
      );
      return rows.map(mapVoucherAssignmentRow);
    },
    async addVoucherEvent(event) {
      await run(
        `INSERT INTO voucher_events (id, voucher_id, assignment_id, event_type, actor_type, actor_id, meta_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.id,
          event.voucherId,
          event.assignmentId || null,
          event.eventType,
          event.actorType,
          event.actorId,
          event.metaJson,
          event.createdAt,
        ],
      );
      return event;
    },
    async listVoucherRules() {
      return all("SELECT key, value_text AS valueText, updated_at AS updatedAt FROM voucher_rules ORDER BY key ASC");
    },
    async upsertVoucherRule(key, valueText, updatedAt) {
      await run(
        `INSERT INTO voucher_rules (key, value_text, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value_text = excluded.value_text, updated_at = excluded.updated_at`,
        [key, valueText, updatedAt],
      );
      return get("SELECT key, value_text AS valueText, updated_at AS updatedAt FROM voucher_rules WHERE key = ? LIMIT 1", [key]);
    },
  };
}

function createPgStore(connectionString) {
  const useSsl =
    String(process.env.PGSSLMODE || "").toLowerCase() === "require" ||
    String(process.env.PGSSL || "").toLowerCase() === "true" ||
    /render\.com/i.test(String(connectionString || ""));
  const pool = new Pool(
    useSsl
      ? {
        connectionString,
        ssl: { rejectUnauthorized: false },
      }
      : { connectionString },
  );
  const q = (text, params = []) => pool.query(text, params);

  return {
    type: "postgres",
    async init() {
      await q("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)");
      await ensurePostgresVoucherSchema(q);
      const appliedRows = await q("SELECT version FROM schema_migrations");
      const applied = new Set(appliedRows.rows.map((r) => r.version));
      const migrations = readMigrationFiles("postgres");

      for (const migration of migrations) {
        if (applied.has(migration.version)) continue;
        await q("BEGIN");
        try {
          await q(migration.sql);
          await q("INSERT INTO schema_migrations (version) VALUES ($1)", [migration.version]);
          await q("COMMIT");
        } catch (error) {
          await q("ROLLBACK");
          throw error;
        }
      }
    },
    async getUserByEmail(email) {
      const r = await q("SELECT * FROM users WHERE lower(email) = lower($1) LIMIT 1", [email]);
      return mapUser(r.rows[0]);
    },
    async getUserById(id) {
      const r = await q("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
      return mapUser(r.rows[0]);
    },
    async getUserByCardNumber(cardNumber) {
      const r = await q("SELECT * FROM users WHERE card_number = $1 LIMIT 1", [cardNumber]);
      return mapUser(r.rows[0]);
    },
    async getFirstUser() {
      const r = await q("SELECT * FROM users ORDER BY id LIMIT 1");
      return mapUser(r.rows[0]);
    },
    async createUser(user) {
      await q(
        "INSERT INTO users (id, name, email, password_hash, points, coupons, card_number) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [user.id, user.name, user.email, user.passwordHash, user.points, user.coupons, user.cardNumber],
      );
      return this.getUserById(user.id);
    },
    async updateUserProfile(id, profile) {
      await q("UPDATE users SET name = $1, email = $2 WHERE id = $3", [profile.name, profile.email, id]);
      return this.getUserById(id);
    },
    async updateUserPassword(id, passwordHash) {
      await q("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, id]);
      return this.getUserById(id);
    },
    async updateUserCardNumber(id, cardNumber) {
      await q("UPDATE users SET card_number = $1 WHERE id = $2", [cardNumber, id]);
      return this.getUserById(id);
    },
    async listFlyers() {
      const r = await q("SELECT id, title, price, image FROM flyers ORDER BY id DESC");
      return r.rows;
    },
    async listNotifications() {
      const r = await q(
        'SELECT id, title, body, created_at AS "createdAt", kind, media_url AS "mediaUrl", thumbnail_url AS "thumbnailUrl" FROM notifications ORDER BY id DESC',
      );
      return r.rows;
    },
    async listProductPrices(limit = 500) {
      const safeLimit = Math.max(1, Math.min(2000, Number(limit) || 500));
      const r = await q(
        "SELECT barcode, name, price, currency, unit, updated_at AS \"updatedAt\" FROM product_prices ORDER BY updated_at DESC, barcode ASC LIMIT $1",
        [safeLimit],
      );
      return r.rows;
    },
    async listCmsAssets(groupName) {
      const r = await q(
        "SELECT group_name AS \"groupName\", file_name AS \"fileName\", mime_type AS \"mimeType\", updated_at AS \"updatedAt\" FROM cms_assets WHERE group_name = $1 ORDER BY file_name ASC",
        [groupName],
      );
      return r.rows;
    },
    async getCmsAsset(groupName, fileName) {
      const r = await q(
        "SELECT group_name AS \"groupName\", file_name AS \"fileName\", mime_type AS \"mimeType\", data, updated_at AS \"updatedAt\" FROM cms_assets WHERE group_name = $1 AND file_name = $2 LIMIT 1",
        [groupName, fileName],
      );
      return r.rows[0] || null;
    },
    async upsertCmsAsset(asset) {
      await q(
        `INSERT INTO cms_assets (group_name, file_name, mime_type, data, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (group_name, file_name) DO UPDATE SET
           mime_type = EXCLUDED.mime_type,
           data = EXCLUDED.data,
           updated_at = EXCLUDED.updated_at`,
        [asset.groupName, asset.fileName, asset.mimeType, asset.data, asset.updatedAt],
      );
      return this.getCmsAsset(asset.groupName, asset.fileName);
    },
    async deleteCmsAsset(groupName, fileName) {
      const r = await q("DELETE FROM cms_assets WHERE group_name = $1 AND file_name = $2", [groupName, fileName]);
      return Number(r.rowCount || 0) > 0;
    },
    async addFlyer(flyer) {
      await q("INSERT INTO flyers (id, title, price, image) VALUES ($1, $2, $3, $4)", [
        flyer.id,
        flyer.title,
        flyer.price,
        flyer.image,
      ]);
      return flyer;
    },
    async addNotification(notice) {
      await q(
        "INSERT INTO notifications (id, title, body, created_at, kind, media_url, thumbnail_url) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          notice.id,
          notice.title,
          notice.body,
          notice.createdAt,
          notice.kind || "text",
          notice.mediaUrl || "",
          notice.thumbnailUrl || "",
        ],
      );
      return notice;
    },
    async deleteFlyerById(id) {
      const r = await q("DELETE FROM flyers WHERE id = $1", [id]);
      return Number(r.rowCount || 0) > 0;
    },
    async deleteNotificationById(id) {
      const r = await q("DELETE FROM notifications WHERE id = $1", [id]);
      return Number(r.rowCount || 0) > 0;
    },
    async addPushToken(token) {
      await q("INSERT INTO push_tokens (token) VALUES ($1) ON CONFLICT (token) DO NOTHING", [token]);
    },
    async listPushTokens() {
      const r = await q("SELECT token FROM push_tokens");
      return r.rows.map((x) => x.token);
    },
    async getProductPriceByBarcode(barcode) {
      const r = await q("SELECT * FROM product_prices WHERE barcode = $1 LIMIT 1", [barcode]);
      return mapProductPrice(r.rows[0]);
    },
    async upsertProductPrice(item) {
      await q(
        `INSERT INTO product_prices (barcode, name, price, currency, unit, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (barcode) DO UPDATE SET
           name = EXCLUDED.name,
           price = EXCLUDED.price,
           currency = EXCLUDED.currency,
           unit = EXCLUDED.unit,
           updated_at = EXCLUDED.updated_at`,
        [item.barcode, item.name, item.price, item.currency, item.unit, item.updatedAt],
      );
      return this.getProductPriceByBarcode(item.barcode);
    },
    async deleteProductPriceByBarcode(barcode) {
      const r = await q("DELETE FROM product_prices WHERE barcode = $1", [barcode]);
      return Number(r.rowCount || 0) > 0;
    },
    async getVoucherByBarcode(barcode) {
      const r = await q("SELECT * FROM vouchers WHERE barcode = $1 LIMIT 1", [barcode]);
      return mapVoucher(r.rows[0]);
    },
    async createVoucher(voucher) {
      const r = await q(
        `INSERT INTO vouchers (id, barcode, amount, currency, status, source_file, import_batch_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (barcode) DO NOTHING
         RETURNING *`,
        [
          voucher.id,
          voucher.barcode,
          voucher.amount,
          voucher.currency,
          voucher.status,
          voucher.sourceFile,
          voucher.importBatchId,
          voucher.createdAt,
          voucher.updatedAt,
        ],
      );
      return mapVoucher(r.rows[0]);
    },
    async getVoucherById(id) {
      const r = await q("SELECT * FROM vouchers WHERE id = $1 LIMIT 1", [id]);
      return mapVoucher(r.rows[0]);
    },
    async listVouchers({ status = "", limit = 100 } = {}) {
      const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
      const r = status
        ? await q("SELECT * FROM vouchers WHERE status = $1 ORDER BY created_at DESC, barcode ASC LIMIT $2", [status, safeLimit])
        : await q("SELECT * FROM vouchers ORDER BY created_at DESC, barcode ASC LIMIT $1", [safeLimit]);
      return r.rows.map(mapVoucher);
    },
    async getVoucherSummary() {
      const r = await q("SELECT status, COUNT(*)::int AS count FROM vouchers GROUP BY status");
      const summary = { free: 0, assigned: 0, used: 0, expired: 0, void: 0, total: 0 };
      for (const row of r.rows) {
        const key = String(row.status || "");
        const count = Number(row.count || 0);
        if (Object.prototype.hasOwnProperty.call(summary, key)) summary[key] = count;
        summary.total += count;
      }
      return summary;
    },
    async findFreeVoucher({ barcode = "", amount = null } = {}) {
      const normalizedAmount = Number(amount);
      const hasAmountFilter = Number.isFinite(normalizedAmount) && normalizedAmount > 0;
      const r = barcode
        ? await q("SELECT * FROM vouchers WHERE barcode = $1 AND status = 'free' LIMIT 1", [barcode])
        : hasAmountFilter
          ? await q(
            "SELECT * FROM vouchers WHERE status = 'free' AND amount = $1 ORDER BY created_at ASC, barcode ASC LIMIT 1",
            [normalizedAmount],
          )
          : await q("SELECT * FROM vouchers WHERE status = 'free' ORDER BY created_at ASC, barcode ASC LIMIT 1");
      return mapVoucher(r.rows[0]);
    },
    async markVoucherAssigned(voucherId, updatedAt) {
      const r = await q("UPDATE vouchers SET status = 'assigned', updated_at = $1 WHERE id = $2 AND status = 'free'", [updatedAt, voucherId]);
      return Number(r.rowCount || 0) > 0;
    },
    async createVoucherAssignment(assignment) {
      await q(
        `INSERT INTO voucher_assignments (
          id, voucher_id, user_id, card_number, assignment_type, amount_snapshot, assigned_by, assigned_at, valid_from, expires_at, used_at, used_reference, period_key, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          assignment.id,
          assignment.voucherId,
          assignment.userId || null,
          assignment.cardNumber || null,
          assignment.assignmentType,
          assignment.amountSnapshot,
          assignment.assignedBy,
          assignment.assignedAt,
          assignment.validFrom || null,
          assignment.expiresAt || null,
          assignment.usedAt || null,
          assignment.usedReference || null,
          assignment.periodKey || "",
          assignment.status,
        ],
      );
      return assignment;
    },
    async findVoucherAssignmentByPeriod({ userId = "", cardNumber = "", assignmentType = "", periodKey = "" } = {}) {
      const r = await q(
        `SELECT
           va.id AS assignment_id,
           va.voucher_id,
           va.user_id,
           va.card_number,
           va.assignment_type,
           va.amount_snapshot,
           va.assigned_at,
           va.valid_from,
           va.expires_at,
           va.used_at,
           va.period_key,
           va.status AS assignment_status,
           v.barcode,
           v.status AS voucher_status,
           v.currency
         FROM voucher_assignments va
         INNER JOIN vouchers v ON v.id = va.voucher_id
         WHERE va.assignment_type = $1
           AND va.period_key = $2
           AND (va.user_id = $3 OR (va.card_number = $4 AND $5 <> ''))
         ORDER BY va.assigned_at DESC, va.id DESC
         LIMIT 1`,
        [assignmentType, periodKey, userId || "", cardNumber || "", cardNumber || ""],
      );
      return mapVoucherAssignmentRow(r.rows[0]);
    },
    async getVoucherAssignmentByBarcode(barcode) {
      const r = await q(
        `SELECT
           va.id AS assignment_id,
           va.voucher_id,
           va.user_id,
           va.card_number,
           va.assignment_type,
           va.amount_snapshot,
           va.assigned_at,
           va.valid_from,
           va.expires_at,
           va.used_at,
           va.used_reference,
           va.period_key,
           va.status AS assignment_status,
           v.barcode,
           v.status AS voucher_status,
           v.currency
         FROM voucher_assignments va
         INNER JOIN vouchers v ON v.id = va.voucher_id
         WHERE v.barcode = $1
         ORDER BY va.assigned_at DESC, va.id DESC
         LIMIT 1`,
        [barcode],
      );
      return mapVoucherAssignmentRow(r.rows[0]);
    },
    async redeemVoucherAssignment({ assignmentId, voucherId, usedAt, usedReference }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const assignmentResult = await client.query(
          "UPDATE voucher_assignments SET status = 'used', used_at = $1, used_reference = $2 WHERE id = $3 AND status = 'active' AND (used_at IS NULL OR used_at = '')",
          [usedAt, usedReference || null, assignmentId],
        );
        if (Number(assignmentResult.rowCount || 0) < 1) {
          await client.query("ROLLBACK");
          return false;
        }
        const voucherResult = await client.query(
          "UPDATE vouchers SET status = 'used', updated_at = $1 WHERE id = $2 AND status = 'assigned'",
          [usedAt, voucherId],
        );
        if (Number(voucherResult.rowCount || 0) < 1) {
          await client.query("ROLLBACK");
          return false;
        }
        await client.query("COMMIT");
        return true;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch (_rollbackError) {
          // ignore rollback failure
        }
        throw error;
      } finally {
        client.release();
      }
    },
    async listVoucherAssignmentsForUser(userId, cardNumber) {
      const r = await q(
        `SELECT
           va.id AS assignment_id,
           va.voucher_id,
           va.user_id,
           va.card_number,
           va.assignment_type,
           va.amount_snapshot,
           va.assigned_at,
           va.valid_from,
           va.expires_at,
           va.used_at,
           va.period_key,
           va.status AS assignment_status,
           v.barcode,
           v.status AS voucher_status,
           v.currency
         FROM voucher_assignments va
         INNER JOIN vouchers v ON v.id = va.voucher_id
         WHERE va.user_id = $1 OR (va.card_number = $2 AND $2 <> '')
         ORDER BY va.assigned_at DESC, va.id DESC`,
        [userId, cardNumber || ""],
      );
      return r.rows.map(mapVoucherAssignmentRow);
    },
    async addVoucherEvent(event) {
      await q(
        `INSERT INTO voucher_events (id, voucher_id, assignment_id, event_type, actor_type, actor_id, meta_json, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          event.id,
          event.voucherId,
          event.assignmentId || null,
          event.eventType,
          event.actorType,
          event.actorId,
          event.metaJson,
          event.createdAt,
        ],
      );
      return event;
    },
    async listVoucherRules() {
      const r = await q("SELECT key, value_text AS \"valueText\", updated_at AS \"updatedAt\" FROM voucher_rules ORDER BY key ASC");
      return r.rows;
    },
    async upsertVoucherRule(key, valueText, updatedAt) {
      const r = await q(
        `INSERT INTO voucher_rules (key, value_text, updated_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = EXCLUDED.updated_at
         RETURNING key, value_text AS "valueText", updated_at AS "updatedAt"`,
        [key, valueText, updatedAt],
      );
      return r.rows[0] || null;
    },
  };
}

module.exports = {
  dbFactory,
};
