-- Crédito de plataforma ("Plataforma por Kuerre") activable/desactivable por marca.
-- Encendido por defecto en cada marca nueva; la marca propia (kuerre) arranca apagada.
ALTER TABLE partners ADD COLUMN mostrar_credito INTEGER NOT NULL DEFAULT 1;

UPDATE partners SET mostrar_credito = 0 WHERE id = 'kuerre';
