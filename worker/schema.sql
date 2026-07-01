-- Kuerre DB Schema v3
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
  storage     TEXT DEFAULT 'drive',
  evento_slug TEXT DEFAULT NULL,
  created_at  TEXT NOT NULL
);

-- Migración: storage backend por evento ('drive' | 'r2')
-- ALTER TABLE eventos_foto ADD COLUMN storage TEXT DEFAULT 'drive';

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

CREATE TABLE IF NOT EXISTS solicitudes (
  id              TEXT PRIMARY KEY,
  tipo            TEXT NOT NULL,
  nombre_display  TEXT NOT NULL,
  fecha           TEXT NOT NULL,
  salon           TEXT,
  direccion       TEXT,
  cliente_nombre  TEXT,
  cliente_tel     TEXT,
  cliente_email   TEXT,
  data_json       TEXT,
  fiesta_id       TEXT,
  invite_slug     TEXT,
  codigo_contrato TEXT,
  drive_cliente_id TEXT,
  drive_fiesta_id  TEXT,
  drive_entrega_id TEXT,
  evento_slug      TEXT DEFAULT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entrega_configs (
  id         TEXT PRIMARY KEY,
  nombres    TEXT,
  fecha      TEXT,
  tipo       TEXT,
  folder_id  TEXT DEFAULT '',
  portada    TEXT DEFAULT '',
  overlay    TEXT DEFAULT 'violeta',
  allow_dl    INTEGER DEFAULT 1,
  evento_slug TEXT DEFAULT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rsvp_responses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT NOT NULL,
  nombre      TEXT NOT NULL,
  apellido    TEXT NOT NULL,
  asistencia  TEXT NOT NULL,
  restricciones TEXT DEFAULT '',
  mensaje     TEXT DEFAULT '',
  mesa        INTEGER,
  created_at  TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_rsvp_slug ON rsvp_responses(slug);
