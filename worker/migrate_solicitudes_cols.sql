-- KUERRE: agregar columnas individuales que tiene CRP pero faltan en KUERRE
-- Mantiene data_json (no lo elimina — otros endpoints lo usan)

ALTER TABLE solicitudes ADD COLUMN cliente2_nombre    TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN hora_inicio        TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN hora_fin           TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN invitados          TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN quinceanera_nombre TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_fecha        TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_hora         TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_lugar        TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_dir          TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_fecha         TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_hora          TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_lugar         TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_dir           TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN procesada          INTEGER DEFAULT 0;

-- Migrar fila(s) existentes desde data_json a columnas individuales
UPDATE solicitudes SET
  hora_inicio        = COALESCE(json_extract(data_json,'$.fiesta.horaInicio'), json_extract(data_json,'$.evento.horaInicio'), ''),
  hora_fin           = COALESCE(json_extract(data_json,'$.fiesta.horaFin'),    json_extract(data_json,'$.evento.horaFin'),    ''),
  invitados          = COALESCE(json_extract(data_json,'$.fiesta.invitados'),  json_extract(data_json,'$.evento.invitados'),  ''),
  cliente2_nombre    = COALESCE(json_extract(data_json,'$.novio.nombre'),      json_extract(data_json,'$.quinceanera.nombre'), ''),
  quinceanera_nombre = COALESCE(json_extract(data_json,'$.quinceanera.nombre'), ''),
  civil_fecha        = COALESCE(json_extract(data_json,'$.civil.fecha'),        ''),
  civil_hora         = COALESCE(json_extract(data_json,'$.civil.horario'),      ''),
  civil_dir          = COALESCE(json_extract(data_json,'$.civil.direccion'),    ''),
  reli_fecha         = COALESCE(json_extract(data_json,'$.religiosa.fecha'),    ''),
  reli_hora          = COALESCE(json_extract(data_json,'$.religiosa.horario'),  ''),
  reli_dir           = COALESCE(json_extract(data_json,'$.religiosa.direccion'),'')
WHERE data_json IS NOT NULL AND data_json != '{}';
