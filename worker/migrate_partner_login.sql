-- Acceso propio de cada marca al panel del estudio (solo lectura).
-- usuario: unico entre marcas con acceso configurado; '' = sin acceso.
-- pass_hash: pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>. Nunca la clave en claro.
-- login_fails: '<intentos>|<timestamp_ms_del_ultimo_fallo>'. Se limpia al entrar bien.
ALTER TABLE partners ADD COLUMN usuario     TEXT DEFAULT '';
ALTER TABLE partners ADD COLUMN pass_hash   TEXT DEFAULT '';
ALTER TABLE partners ADD COLUMN login_fails TEXT DEFAULT '';
