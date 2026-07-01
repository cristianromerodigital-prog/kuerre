-- Kuerre DB Schema v3
-- Aplicar con: wrangler d1 execute kuerre-db --file=worker/schema.sql --remote

CREATE TABLE IF NOT EXISTS eventos_foto (
  id          TEXT PRIMARY KEY,
  cierre_auto TEXT,
  folder_id   TEXT NOT NULL,
  portada     TEXT,
  estado      TEXT DEFAULT 'activo',
  moderacion  INTEGER DEFAULT 0,
  storage     TEXT DEFAULT 'r2',
  evento_id   INTEGER DEFAULT NULL,
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

CREATE TABLE IF NOT EXISTS solicitudes (
  id              TEXT PRIMARY KEY,
  salon           TEXT,
  direccion       TEXT,
  cliente_nombre  TEXT,
  cliente_tel     TEXT,
  cliente_email   TEXT,
  data_json       TEXT,
  fiesta_id       TEXT,
  invite_slug     TEXT,
  codigo_contrato TEXT,
  drive_cliente_id    TEXT,
  drive_fiesta_id     TEXT,
  drive_entrega_id    TEXT,
  drive_contrato_id   TEXT,
  drive_invitacion_id TEXT,
  evento_id        INTEGER DEFAULT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entrega_configs (
  id        TEXT PRIMARY KEY,
  folder_id TEXT DEFAULT '',
  portada   TEXT DEFAULT '',
  overlay   TEXT DEFAULT 'violeta',
  allow_dl  INTEGER DEFAULT 1,
  evento_id INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contratos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo       TEXT NOT NULL DEFAULT 'digital',
  datos      TEXT NOT NULL DEFAULT '{}',
  firmado    INTEGER NOT NULL DEFAULT 0,
  firmado_at TEXT DEFAULT NULL,
  evento_id  INTEGER DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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
