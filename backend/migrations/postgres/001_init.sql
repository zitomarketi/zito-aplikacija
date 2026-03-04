CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  coupons INTEGER NOT NULL DEFAULT 0,
  card_number TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flyers (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price TEXT NOT NULL,
  image TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY
);

INSERT INTO users (id, name, email, password_hash, points, coupons, card_number)
VALUES ('u1', 'Zito Korisnik', 'korisnik@zito.mk', '$2b$10$ZGJREfXDkJt7VJ/0EuglW.2qr43NpoQPOXrE.3nZT9v9RwnThLn2e', 1280, 4, '6899512')
ON CONFLICT (id) DO NOTHING;

INSERT INTO flyers (id, title, price, image) VALUES ('f1', 'Ovosje i zelencuk', '49 den.', 'flyers_grid.png') ON CONFLICT (id) DO NOTHING;
INSERT INTO flyers (id, title, price, image) VALUES ('f2', 'Pijaloci', '99 den.', 'flyers_grid.png') ON CONFLICT (id) DO NOTHING;
INSERT INTO flyers (id, title, price, image) VALUES ('f3', 'Mlecni proizvodi', '119 den.', 'flyers_grid.png') ON CONFLICT (id) DO NOTHING;
INSERT INTO flyers (id, title, price, image) VALUES ('f4', 'Slatki i gricki', '79 den.', 'flyers_grid.png') ON CONFLICT (id) DO NOTHING;

INSERT INTO notifications (id, title, body, created_at) VALUES ('n1', 'Zito', 'Nov Zito letok e objaven.', 'pred 5 minuti') ON CONFLICT (id) DO NOTHING;
INSERT INTO notifications (id, title, body, created_at) VALUES ('n2', 'Specijalna ponuda', '20% popust za lojalni korisnici.', 'denes') ON CONFLICT (id) DO NOTHING;
