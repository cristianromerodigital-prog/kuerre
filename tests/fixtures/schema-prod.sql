-- Esquema de PRODUCCIÓN (D1 kuerre-db), volcado con sqlite_master para los tests.
-- worker/schema.sql está desactualizado respecto de producción: no usarlo como referencia.

CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');
CREATE TABLE contratos (
  numero          INTEGER PRIMARY KEY,
  fecha_gen       TEXT DEFAULT '',
  fecha_evento    TEXT DEFAULT '',
  cliente         TEXT DEFAULT '',
  cliente2        TEXT DEFAULT '',
  lugar           TEXT DEFAULT '',
  precio          INTEGER DEFAULT 0,
  cuotas          INTEGER DEFAULT 1,
  estado          TEXT DEFAULT 'GENERADO',
  doc_url         TEXT DEFAULT '',
  pdf_url         TEXT DEFAULT '',
  notas           TEXT DEFAULT '',
  solicitud_id    TEXT DEFAULT NULL,
  evento_id       INTEGER DEFAULT NULL,
  cliente_dni     TEXT DEFAULT '',
  cliente_tel     TEXT DEFAULT '',
  cliente_email   TEXT DEFAULT '',
  cliente2_nac    TEXT DEFAULT '',
  cliente2_dni    TEXT DEFAULT '',
  cliente2_dom    TEXT DEFAULT '',
  cliente2_tel    TEXT DEFAULT '',
  cliente2_email  TEXT DEFAULT '',
  hora_inicio     TEXT DEFAULT '',
  hora_fin        TEXT DEFAULT '',
  direccion       TEXT DEFAULT '',
  invitados       TEXT DEFAULT '',
  ciudad          TEXT DEFAULT '',
  dia_firma       TEXT DEFAULT '',
  nombre_paquete  TEXT DEFAULT '',
  servicios       TEXT DEFAULT '[]',
  contacto_nombre TEXT DEFAULT '',
  contacto_rel    TEXT DEFAULT '',
  contacto_tel    TEXT DEFAULT '',
  civil_fecha     TEXT DEFAULT '',
  civil_hora      TEXT DEFAULT '',
  civil_dir       TEXT DEFAULT '',
  reli_fecha      TEXT DEFAULT '',
  reli_hora       TEXT DEFAULT '',
  reli_dir        TEXT DEFAULT '',
  formas_pago     TEXT DEFAULT '[]'
);
CREATE TABLE entrega_configs (id TEXT PRIMARY KEY, folder_id TEXT DEFAULT '', portada TEXT DEFAULT '', overlay TEXT DEFAULT 'violeta', allow_dl INTEGER DEFAULT 1, created_at TEXT NOT NULL, evento_id INTEGER DEFAULT NULL);
CREATE TABLE evento_frases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_id  TEXT NOT NULL,
  texto      TEXT NOT NULL,
  nombre     TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE eventos (
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
CREATE TABLE eventos_foto (
  id          TEXT PRIMARY KEY,
  cierre_auto TEXT,
  folder_id   TEXT NOT NULL,
  portada     TEXT,
  estado      TEXT DEFAULT 'activo',
  moderacion  INTEGER DEFAULT 0,
  created_at  TEXT NOT NULL
, storage TEXT DEFAULT 'drive', evento_id INTEGER DEFAULT NULL);
CREATE TABLE foto_likes (
  evento_id  TEXT NOT NULL,
  foto_id    TEXT NOT NULL,
  session_id TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (evento_id, foto_id, session_id)
);
CREATE TABLE fotos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  evento_slug TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  likes       INTEGER NOT NULL DEFAULT 0,
  ganadora    INTEGER NOT NULL DEFAULT 0,
  uploaded_at TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (evento_slug) REFERENCES eventos(slug)
);
CREATE TABLE partners (
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
, mostrar_credito INTEGER NOT NULL DEFAULT 1, usuario     TEXT DEFAULT '', pass_hash   TEXT DEFAULT '', login_fails TEXT DEFAULT '', logo_invertir INTEGER NOT NULL DEFAULT 0);
CREATE TABLE rsvp_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, nombre TEXT NOT NULL, apellido TEXT NOT NULL, asistencia TEXT NOT NULL, restricciones TEXT DEFAULT '', mensaje TEXT DEFAULT '', mesa INTEGER, created_at TEXT DEFAULT (datetime('now')), modificado_at TEXT);
CREATE TABLE servicios (id TEXT PRIMARY KEY, descripcion TEXT NOT NULL, pesos INTEGER NOT NULL DEFAULT 0, activo INTEGER NOT NULL DEFAULT 1, orden INTEGER NOT NULL DEFAULT 0);
CREATE TABLE solicitudes (id TEXT PRIMARY KEY, salon TEXT, direccion TEXT, cliente_nombre TEXT, cliente_tel TEXT, cliente_email TEXT, data_json TEXT, fiesta_id TEXT, invite_slug TEXT, codigo_contrato TEXT, drive_cliente_id TEXT, drive_fiesta_id TEXT, drive_entrega_id TEXT, created_at TEXT NOT NULL, invite_id TEXT DEFAULT '', book_fecha TEXT DEFAULT '', book_hora TEXT DEFAULT '', book_zona TEXT DEFAULT '', contrato_pdf_url TEXT DEFAULT '', drive_contrato_id TEXT DEFAULT '', drive_invitacion_id TEXT DEFAULT '', evento_id INTEGER DEFAULT NULL, cliente2_nombre    TEXT DEFAULT '', hora_inicio        TEXT DEFAULT '', hora_fin           TEXT DEFAULT '', invitados          TEXT DEFAULT '', quinceanera_nombre TEXT DEFAULT '', civil_fecha        TEXT DEFAULT '', civil_hora         TEXT DEFAULT '', civil_lugar        TEXT DEFAULT '', civil_dir          TEXT DEFAULT '', reli_fecha         TEXT DEFAULT '', reli_hora          TEXT DEFAULT '', reli_lugar         TEXT DEFAULT '', reli_dir           TEXT DEFAULT '', procesada          INTEGER DEFAULT 0, cliente_dni TEXT DEFAULT '', cliente2_dni TEXT DEFAULT '', cliente2_dom TEXT DEFAULT '', quinceanera_nac TEXT DEFAULT '', drive_carrusel1_id TEXT DEFAULT '', drive_carrusel2_id TEXT DEFAULT '', cliente2_tel TEXT DEFAULT '', cliente2_email TEXT DEFAULT '', contacto_nombre TEXT DEFAULT '', contacto_rel TEXT DEFAULT '', contacto_tel TEXT DEFAULT '', partner_id TEXT NOT NULL DEFAULT 'kuerre');
CREATE INDEX idx_fotos_evento ON fotos(evento_slug);
CREATE INDEX idx_rsvp_slug ON rsvp_responses(slug);

-- pendiente de aplicar en producción junto con este cambio: worker/migrate_rsvp_config.sql
CREATE TABLE IF NOT EXISTS rsvp_config (slug TEXT PRIMARY KEY, mesas INTEGER NOT NULL);
