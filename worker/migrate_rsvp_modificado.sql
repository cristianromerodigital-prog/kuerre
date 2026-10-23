-- Fecha en que se cambió la asistencia de una respuesta desde el panel RSVP
-- (Asiste <-> No asiste). NULL si nunca se modificó.
ALTER TABLE rsvp_responses ADD COLUMN modificado_at TEXT;
