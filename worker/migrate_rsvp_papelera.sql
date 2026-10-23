-- Papelera del RSVP: borrar desde el panel marca la fila (borrado_at) en vez de
-- eliminarla; se puede restaurar y la tarea diaria la borra de verdad a los 30 días.
ALTER TABLE rsvp_responses ADD COLUMN borrado_at TEXT;
