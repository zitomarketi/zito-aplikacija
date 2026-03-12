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
    barcode: row.barcode,
    amount: Number(row.amount || 0),
    status: row.status,
    source: row.source,
    assignedUserId: row.assigned_user_id ?? row.assignedUserId ?? "",
    assignedCardNumber: row.assigned_card_number ?? row.assignedCardNumber ?? "",
    assignedAt: row.assigned_at ?? row.assignedAt ?? "",
    expiresAt: row.expires_at ?? row.expiresAt ?? "",
    usedAt: row.used_at ?? row.usedAt ?? "",
    usedByCardNumber: row.used_by_card_number ?? row.usedByCardNumber ?? "",
    createdAt: row.created_at ?? row.createdAt ?? "",
    updatedAt: row.updated_at ?? row.updatedAt ?? "",
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
    async getVoucherRules() {
      const row = await get("SELECT * FROM voucher_rules WHERE id = 1 LIMIT 1");
      if (!row) return null;
      return {
        registerAmount: Number(row.register_amount || 0),
        turnover5000Amount: Number(row.turnover_5000_amount || 0),
        turnover10000Amount: Number(row.turnover_10000_amount || 0),
        expiryDays: Number(row.expiry_days || 30),
        updatedAt: String(row.updated_at || ""),
      };
    },
    async updateVoucherRules(rules) {
      await run(
        `INSERT INTO voucher_rules (id, register_amount, turnover_5000_amount, turnover_10000_amount, expiry_days, updated_at)
         VALUES (1, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           register_amount = excluded.register_amount,
           turnover_5000_amount = excluded.turnover_5000_amount,
           turnover_10000_amount = excluded.turnover_10000_amount,
           expiry_days = excluded.expiry_days,
           updated_at = excluded.updated_at`,
        [
          rules.registerAmount,
          rules.turnover5000Amount,
          rules.turnover10000Amount,
          rules.expiryDays,
          rules.updatedAt,
        ],
      );
      return this.getVoucherRules();
    },
    async insertVoucherIfMissing(voucher) {
      const result = await run(
        `INSERT OR IGNORE INTO vouchers
         (barcode, amount, status, source, created_at, updated_at)
         VALUES (?, ?, 'free', ?, ?, ?)`,
        [voucher.barcode, voucher.amount, voucher.source || "upload", voucher.createdAt, voucher.updatedAt],
      );
      return Number(result?.changes || 0) > 0;
    },
    async getVoucherByBarcode(barcode) {
      const row = await get("SELECT * FROM vouchers WHERE barcode = ? LIMIT 1", [barcode]);
      return mapVoucher(row);
    },
    async listVouchers(limit = 500, status = "") {
      const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const rows = normalizedStatus
        ? await all("SELECT * FROM vouchers WHERE status = ? ORDER BY created_at DESC, barcode ASC LIMIT ?", [normalizedStatus, safeLimit])
        : await all("SELECT * FROM vouchers ORDER BY created_at DESC, barcode ASC LIMIT ?", [safeLimit]);
      return rows.map(mapVoucher);
    },
    async listUserVouchers(userId, cardNumber) {
      const rows = await all(
        `SELECT * FROM vouchers
         WHERE (assigned_user_id = ? OR assigned_card_number = ?)
         ORDER BY
           CASE status WHEN 'active' THEN 0 WHEN 'used' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,
           created_at DESC`,
        [userId, cardNumber],
      );
      return rows.map(mapVoucher);
    },
    async listFreeVoucherCandidates(amount, limit = 40) {
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || 40));
      const amountValue = Number(amount);
      const rows = Number.isFinite(amountValue) && amountValue > 0
        ? await all(
          "SELECT * FROM vouchers WHERE status = 'free' AND abs(amount - ?) < 0.001 ORDER BY created_at ASC, barcode ASC LIMIT ?",
          [amountValue, safeLimit],
        )
        : await all("SELECT * FROM vouchers WHERE status = 'free' ORDER BY created_at ASC, barcode ASC LIMIT ?", [safeLimit]);
      return rows.map(mapVoucher);
    },
    async assignVoucherByBarcodeIfFree(payload) {
      const result = await run(
        `UPDATE vouchers
         SET status = 'active',
             source = ?,
             assigned_user_id = ?,
             assigned_card_number = ?,
             assigned_at = ?,
             expires_at = ?,
             updated_at = ?
         WHERE barcode = ? AND status = 'free'`,
        [
          payload.source || "manual",
          payload.userId || "",
          payload.cardNumber || "",
          payload.assignedAt,
          payload.expiresAt,
          payload.updatedAt,
          payload.barcode,
        ],
      );
      return Number(result?.changes || 0) > 0;
    },
    async markVoucherUsed(barcode, usedAt, cardNumber) {
      const result = await run(
        `UPDATE vouchers
         SET status = 'used',
             used_at = ?,
             used_by_card_number = ?,
             updated_at = ?
         WHERE barcode = ? AND status = 'active'`,
        [usedAt, cardNumber || "", usedAt, barcode],
      );
      return Number(result?.changes || 0) > 0;
    },
    async markExpiredVouchers(nowIso) {
      await run(
        `UPDATE vouchers
         SET status = 'expired', updated_at = ?
         WHERE status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at <> ''
           AND expires_at < ?`,
        [nowIso, nowIso],
      );
    },
    async getVoucherStats() {
      const rows = await all("SELECT status, COUNT(*) AS cnt FROM vouchers GROUP BY status");
      const stats = { free: 0, active: 0, used: 0, expired: 0, total: 0 };
      for (const row of rows) {
        const key = String(row.status || "").toLowerCase();
        const count = Number(row.cnt || 0);
        if (key in stats) stats[key] = count;
        stats.total += count;
      }
      return stats;
    },
    async addVoucherAudit(entry) {
      await run(
        `INSERT INTO voucher_audit (barcode, action, user_id, card_number, amount, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.barcode || "",
          entry.action || "",
          entry.userId || "",
          entry.cardNumber || "",
          Number.isFinite(Number(entry.amount)) ? Number(entry.amount) : null,
          entry.note || "",
          entry.createdAt,
        ],
      );
    },
    async hasVoucherAutoAward(userId, periodYm, ruleKey) {
      const row = await get(
        "SELECT id FROM voucher_auto_awards WHERE user_id = ? AND period_ym = ? AND rule_key = ? LIMIT 1",
        [userId, periodYm, ruleKey],
      );
      return Boolean(row);
    },
    async createVoucherAutoAward(row) {
      await run(
        `INSERT OR IGNORE INTO voucher_auto_awards (user_id, card_number, period_ym, rule_key, barcode, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [row.userId, row.cardNumber, row.periodYm, row.ruleKey, row.barcode || "", row.createdAt],
      );
    },
  };
}

function createPgStore(connectionString) {
  const pool = new Pool({ connectionString });
  const q = (text, params = []) => pool.query(text, params);

  return {
    type: "postgres",
    async init() {
      await q("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY)");
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
    async getVoucherRules() {
      const r = await q("SELECT * FROM voucher_rules WHERE id = 1 LIMIT 1");
      const row = r.rows[0];
      if (!row) return null;
      return {
        registerAmount: Number(row.register_amount || 0),
        turnover5000Amount: Number(row.turnover_5000_amount || 0),
        turnover10000Amount: Number(row.turnover_10000_amount || 0),
        expiryDays: Number(row.expiry_days || 30),
        updatedAt: String(row.updated_at || ""),
      };
    },
    async updateVoucherRules(rules) {
      await q(
        `INSERT INTO voucher_rules (id, register_amount, turnover_5000_amount, turnover_10000_amount, expiry_days, updated_at)
         VALUES (1, $1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           register_amount = EXCLUDED.register_amount,
           turnover_5000_amount = EXCLUDED.turnover_5000_amount,
           turnover_10000_amount = EXCLUDED.turnover_10000_amount,
           expiry_days = EXCLUDED.expiry_days,
           updated_at = EXCLUDED.updated_at`,
        [
          rules.registerAmount,
          rules.turnover5000Amount,
          rules.turnover10000Amount,
          rules.expiryDays,
          rules.updatedAt,
        ],
      );
      return this.getVoucherRules();
    },
    async insertVoucherIfMissing(voucher) {
      const r = await q(
        `INSERT INTO vouchers (barcode, amount, status, source, created_at, updated_at)
         VALUES ($1, $2, 'free', $3, $4, $5)
         ON CONFLICT (barcode) DO NOTHING`,
        [voucher.barcode, voucher.amount, voucher.source || "upload", voucher.createdAt, voucher.updatedAt],
      );
      return Number(r.rowCount || 0) > 0;
    },
    async getVoucherByBarcode(barcode) {
      const r = await q("SELECT * FROM vouchers WHERE barcode = $1 LIMIT 1", [barcode]);
      return mapVoucher(r.rows[0]);
    },
    async listVouchers(limit = 500, status = "") {
      const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
      const normalizedStatus = String(status || "").trim().toLowerCase();
      const r = normalizedStatus
        ? await q("SELECT * FROM vouchers WHERE status = $1 ORDER BY created_at DESC, barcode ASC LIMIT $2", [normalizedStatus, safeLimit])
        : await q("SELECT * FROM vouchers ORDER BY created_at DESC, barcode ASC LIMIT $1", [safeLimit]);
      return r.rows.map(mapVoucher);
    },
    async listUserVouchers(userId, cardNumber) {
      const r = await q(
        `SELECT * FROM vouchers
         WHERE (assigned_user_id = $1 OR assigned_card_number = $2)
         ORDER BY
           CASE status WHEN 'active' THEN 0 WHEN 'used' THEN 1 WHEN 'expired' THEN 2 ELSE 3 END,
           created_at DESC`,
        [userId, cardNumber],
      );
      return r.rows.map(mapVoucher);
    },
    async listFreeVoucherCandidates(amount, limit = 40) {
      const safeLimit = Math.max(1, Math.min(500, Number(limit) || 40));
      const amountValue = Number(amount);
      const r = Number.isFinite(amountValue) && amountValue > 0
        ? await q(
          "SELECT * FROM vouchers WHERE status = 'free' AND abs(amount - $1) < 0.001 ORDER BY created_at ASC, barcode ASC LIMIT $2",
          [amountValue, safeLimit],
        )
        : await q("SELECT * FROM vouchers WHERE status = 'free' ORDER BY created_at ASC, barcode ASC LIMIT $1", [safeLimit]);
      return r.rows.map(mapVoucher);
    },
    async assignVoucherByBarcodeIfFree(payload) {
      const r = await q(
        `UPDATE vouchers
         SET status = 'active',
             source = $1,
             assigned_user_id = $2,
             assigned_card_number = $3,
             assigned_at = $4,
             expires_at = $5,
             updated_at = $6
         WHERE barcode = $7 AND status = 'free'`,
        [
          payload.source || "manual",
          payload.userId || "",
          payload.cardNumber || "",
          payload.assignedAt,
          payload.expiresAt,
          payload.updatedAt,
          payload.barcode,
        ],
      );
      return Number(r.rowCount || 0) > 0;
    },
    async markVoucherUsed(barcode, usedAt, cardNumber) {
      const r = await q(
        `UPDATE vouchers
         SET status = 'used',
             used_at = $1,
             used_by_card_number = $2,
             updated_at = $3
         WHERE barcode = $4 AND status = 'active'`,
        [usedAt, cardNumber || "", usedAt, barcode],
      );
      return Number(r.rowCount || 0) > 0;
    },
    async markExpiredVouchers(nowIso) {
      await q(
        `UPDATE vouchers
         SET status = 'expired', updated_at = $1
         WHERE status = 'active'
           AND expires_at IS NOT NULL
           AND expires_at <> ''
           AND expires_at < $2`,
        [nowIso, nowIso],
      );
    },
    async getVoucherStats() {
      const r = await q("SELECT status, COUNT(*)::int AS cnt FROM vouchers GROUP BY status");
      const stats = { free: 0, active: 0, used: 0, expired: 0, total: 0 };
      for (const row of r.rows) {
        const key = String(row.status || "").toLowerCase();
        const count = Number(row.cnt || 0);
        if (key in stats) stats[key] = count;
        stats.total += count;
      }
      return stats;
    },
    async addVoucherAudit(entry) {
      await q(
        `INSERT INTO voucher_audit (barcode, action, user_id, card_number, amount, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          entry.barcode || "",
          entry.action || "",
          entry.userId || "",
          entry.cardNumber || "",
          Number.isFinite(Number(entry.amount)) ? Number(entry.amount) : null,
          entry.note || "",
          entry.createdAt,
        ],
      );
    },
    async hasVoucherAutoAward(userId, periodYm, ruleKey) {
      const r = await q(
        "SELECT id FROM voucher_auto_awards WHERE user_id = $1 AND period_ym = $2 AND rule_key = $3 LIMIT 1",
        [userId, periodYm, ruleKey],
      );
      return Boolean(r.rows[0]);
    },
    async createVoucherAutoAward(row) {
      await q(
        `INSERT INTO voucher_auto_awards (user_id, card_number, period_ym, rule_key, barcode, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, period_ym, rule_key) DO NOTHING`,
        [row.userId, row.cardNumber, row.periodYm, row.ruleKey, row.barcode || "", row.createdAt],
      );
    },
  };
}

module.exports = {
  dbFactory,
};
