-- Marca blanca: tabla de partners + dueño de marca por cliente.
CREATE TABLE IF NOT EXISTS partners (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  slogan     TEXT DEFAULT '',
  logo_key   TEXT DEFAULT '',
  whatsapp   TEXT DEFAULT '',
  instagram  TEXT DEFAULT '',
  web        TEXT DEFAULT '',
  activo     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO partners (id, slug, nombre, slogan, whatsapp, instagram, web)
VALUES ('kuerre', 'kuerre', 'KUERRE', 'Fotografía & Video de Eventos',
        '541125931727', 'https://instagram.com/kuerre.digital',
        'https://kuerre.com.ar');

ALTER TABLE solicitudes ADD COLUMN partner_id TEXT NOT NULL DEFAULT 'kuerre';
