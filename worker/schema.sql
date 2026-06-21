-- kuerre DB Schema
-- Aplicar con: wrangler d1 execute kuerre-db --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS eventos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT    NOT NULL UNIQUE,
  nombre     TEXT    NOT NULL,
  fecha      TEXT    NOT NULL,
  tipo       TEXT    NOT NULL DEFAULT 'casamiento',
  qr         INTEGER NOT NULL DEFAULT 0,
  pm         INTEGER NOT NULL DEFAULT 0,
  inv        INTEGER NOT NULL DEFAULT 0,
  notas      TEXT    DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fotos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_slug TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  likes       INTEGER NOT NULL DEFAULT 0,
  ganadora    INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (evento_slug) REFERENCES eventos(slug)
);

CREATE INDEX IF NOT EXISTS idx_fotos_evento ON fotos(evento_slug);

CREATE TABLE IF NOT EXISTS contratos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_slug TEXT    NOT NULL,
  tipo        TEXT    NOT NULL DEFAULT 'digital',
  datos       TEXT    NOT NULL DEFAULT '{}',
  firmado     INTEGER NOT NULL DEFAULT 0,
  firmado_at  TEXT    DEFAULT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
