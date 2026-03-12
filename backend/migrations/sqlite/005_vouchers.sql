CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'free',
  source TEXT NOT NULL DEFAULT 'upload',
  assigned_user_id TEXT,
  assigned_card_number TEXT,
  assigned_at TEXT,
  expires_at TEXT,
  used_at TEXT,
  used_by_card_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_vouchers_status ON vouchers(status);
CREATE INDEX IF NOT EXISTS idx_vouchers_assigned_user ON vouchers(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_assigned_card ON vouchers(assigned_card_number);

CREATE TABLE IF NOT EXISTS voucher_rules (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  register_amount REAL NOT NULL DEFAULT 0,
  turnover_5000_amount REAL NOT NULL DEFAULT 0,
  turnover_10000_amount REAL NOT NULL DEFAULT 0,
  expiry_days INTEGER NOT NULL DEFAULT 30,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO voucher_rules (id, register_amount, turnover_5000_amount, turnover_10000_amount, expiry_days, updated_at)
VALUES (1, 0, 0, 0, 30, datetime('now'));

CREATE TABLE IF NOT EXISTS voucher_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode TEXT NOT NULL,
  action TEXT NOT NULL,
  user_id TEXT,
  card_number TEXT,
  amount REAL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_voucher_audit_barcode ON voucher_audit(barcode);

CREATE TABLE IF NOT EXISTS voucher_auto_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  card_number TEXT NOT NULL,
  period_ym TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  barcode TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, period_ym, rule_key)
);
