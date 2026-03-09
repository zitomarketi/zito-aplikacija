CREATE TABLE IF NOT EXISTS cms_assets (
  group_name TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (group_name, file_name)
);
