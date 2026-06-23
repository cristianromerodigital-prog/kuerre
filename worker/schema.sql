-- Kuerre DB Schema v2
-- Aplicar con: wrangler d1 execute kuerre-db --file=worker/schema.sql --remote

CREATE TABLE IF NOT EXISTS eventos_foto (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL,
  fecha       TEXT NOT NULL,
  cierre_auto TEXT,
  folder_id   TEXT NOT NULL,
  portada     TEXT,
  estado      TEXT DEFAULT 'activo',
  moderacion  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evento_frases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id  TEXT NOT NULL,
  texto      TEXT NOT NULL,
  nombre     TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS foto_likes (
  evento_id  TEXT NOT NULL,
  foto_id    TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (evento_id, foto_id, session_id)
);
