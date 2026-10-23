-- Las piezas aplican filter:invert(1) al logo, un tratamiento pensado para el
-- logo de Kuerre (oscuro sobre transparente). Un logo ya claro se vuelve negro
-- y desaparece sobre el fondo oscuro. El tratamiento pasa a ser por marca.
ALTER TABLE partners ADD COLUMN logo_invertir INTEGER NOT NULL DEFAULT 0;
UPDATE partners SET logo_invertir = 1 WHERE id = 'kuerre';
