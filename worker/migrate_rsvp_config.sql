-- Configuración del panel RSVP por evento (cantidad de mesas). En D1 y no en KV:
-- así el cambio de cantidad y la asignación de mesa se validan en la misma base,
-- en una sola sentencia, sin carreras ni lecturas viejas de KV.
CREATE TABLE IF NOT EXISTS rsvp_config (
  slug  TEXT PRIMARY KEY,
  mesas INTEGER NOT NULL
);
