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
    async listFlyers() {
      return all("SELECT id, title, price, image FROM flyers ORDER BY id DESC");
    },
    async listNotifications() {
      return all("SELECT id, title, body, created_at AS createdAt FROM notifications ORDER BY id DESC");
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
      await run("INSERT INTO notifications (id, title, body, created_at) VALUES (?, ?, ?, ?)", [
        notice.id,
        notice.title,
        notice.body,
        notice.createdAt,
      ]);
      return notice;
    },
    async addPushToken(token) {
      await run("INSERT OR IGNORE INTO push_tokens (token) VALUES (?)", [token]);
    },
    async listPushTokens() {
      const rows = await all("SELECT token FROM push_tokens");
      return rows.map((r) => r.token);
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
    async listFlyers() {
      const r = await q("SELECT id, title, price, image FROM flyers ORDER BY id DESC");
      return r.rows;
    },
    async listNotifications() {
      const r = await q("SELECT id, title, body, created_at AS \"createdAt\" FROM notifications ORDER BY id DESC");
      return r.rows;
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
      await q("INSERT INTO notifications (id, title, body, created_at) VALUES ($1, $2, $3, $4)", [
        notice.id,
        notice.title,
        notice.body,
        notice.createdAt,
      ]);
      return notice;
    },
    async addPushToken(token) {
      await q("INSERT INTO push_tokens (token) VALUES ($1) ON CONFLICT (token) DO NOTHING", [token]);
    },
    async listPushTokens() {
      const r = await q("SELECT token FROM push_tokens");
      return r.rows.map((x) => x.token);
    },
  };
}

module.exports = {
  dbFactory,
};
