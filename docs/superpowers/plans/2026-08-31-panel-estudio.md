# Panel del estudio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada estudio revendedor entre con su usuario y contraseña a un panel propio de solo lectura y vea sus clientes asignados, el estado de las tres piezas de cada uno y los links para copiar.

**Architecture:** Tres columnas nuevas en `partners` (usuario, hash de contraseña, contador de intentos). Un login que emite un JWT con `role:'partner'` y el `partner_id` adentro, y dos endpoints de lectura que filtran por ese id **tomado del token, nunca de un parámetro**. Una página nueva `estudio.html`, chica y separada del admin, que solo sabe llamar a esos dos endpoints.

**Tech Stack:** Cloudflare Workers (JS módulos, sin build), D1 (SQLite), WebCrypto (PBKDF2) para el hash, HTML/CSS/JS vanilla inline, `wrangler` CLI, `CORE/build-admin.cjs` para el admin.

## Global Constraints

- Spec de referencia: `WEB KUERRE/docs/superpowers/specs/2026-08-31-panel-estudio-design.md`.
- **El panel es de solo lectura.** No se crea ni se edita nada desde ahí: ni clientes, ni invitaciones, ni QR, ni entregas. Ningún endpoint de partner escribe en `solicitudes`, `eventos`, `eventos_foto`, `entrega_configs` ni en ninguna clave de KV.
- **El `partner_id` sale siempre del JWT.** Ningún endpoint de partner acepta un id de marca por query string, por body ni por header. Aceptarlo es un defecto, aunque "solo se use internamente".
- La contraseña **nunca** se guarda ni se loguea en texto plano. Formato de `pass_hash`: `pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>`. La comparación es en tiempo constante.
- El error de login es **el mismo** para usuario inexistente, contraseña incorrecta y marca desactivada: `Usuario o contraseña incorrectos`.
- El panel **no** muestra contratos, precios, ni ninguna columna de `solicitudes` fuera de la lista explícita de la Task 3.
- Los endpoints de partner **no** usan `SELECT s.*`: listan las columnas una por una.
- Todo CSS y JS va inline. No crear archivos `.css` ni `.js`.
- El admin se edita **solo** en `CORE/src/admin.html` y se rebuildea con `node build-admin.cjs kuerre`. Los `admin.html` de `WEB KUERRE/{Productivo,Desarrollo}` son generados: nunca editarlos a mano.
- **CRP no se deploya.** Todo lo nuevo del admin va dentro del bloque de marcas que los patches de `brands/crp/config.json` eliminan; esos patches matchean texto exacto y **hay que reanclarlos** (ya pasó dos veces). El script de reanclado está en la Task 4.
- Bump de versión del admin: CORE `V1.98` → `V1.99`, patch 0 de `brands/kuerre/config.json` a `">V1.93<"`. No tocar `brands/crp/config.json` salvo el reanclado.
- Antes de `wrangler deploy`: `ls -la worker/node_modules/@crd/` para confirmar que `kuerre-core` es symlink; si es carpeta física, `rm -rf worker/node_modules/@crd && npm install`.
- Entorno Windows con bash (Git Bash). Commits con `git commit -F -` + heredoc. Todo LF, sin CRLF.
- No hay framework de tests: la verificación son comandos `curl` y consultas `wrangler d1 execute`, con la salida real pegada en el reporte.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tareas |
|---|---|---|
| `WEB KUERRE/worker/migrate_partner_login.sql` | **Crear.** Las tres columnas nuevas de `partners` | 1 |
| `WEB KUERRE/worker/schema.sql` | **Modificar.** Reflejar las columnas nuevas | 1 |
| `WEB KUERRE/worker/src/index.js` | **Modificar.** Hash de contraseña, `POST /partner/login`, `isPartner`, contador de intentos (Task 2); `GET /partner/me` y `GET /partner/clientes` (Task 3) | 2, 3 |
| `CORE/src/admin.html` | **Modificar.** Campos de usuario y contraseña en el modal de marca | 4 |
| `CORE/brands/kuerre/config.json` | **Modificar.** Bump de versión | 4 |
| `CORE/brands/crp/config.json` | **Modificar.** Reanclado de los patches 1d y 1e | 4 |
| `WEB KUERRE/Desarrollo/estudio.html` | **Crear.** La página del panel | 5 |
| `WEB KUERRE/Productivo/*`, `.worktrees/gh-pages/*` | **Modificar.** Copias de deploy | 6 |

---

## Task 1: Columnas de acceso en `partners`

**Files:**
- Create: `WEB KUERRE/worker/migrate_partner_login.sql`
- Modify: `WEB KUERRE/worker/schema.sql`

**Interfaces:**
- Produces: `partners.usuario TEXT DEFAULT ''`, `partners.pass_hash TEXT DEFAULT ''`, `partners.login_fails TEXT DEFAULT ''`. Las tareas siguientes leen y escriben esos nombres exactos.

- [ ] **Step 1: Escribir la migración**

Crear `WEB KUERRE/worker/migrate_partner_login.sql`:

```sql
-- Acceso propio de cada marca al panel del estudio (solo lectura).
-- usuario: unico entre marcas con acceso configurado; '' = sin acceso.
-- pass_hash: pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>. Nunca la clave en claro.
-- login_fails: '<intentos>|<timestamp_ms_del_ultimo_fallo>'. Se limpia al entrar bien.
ALTER TABLE partners ADD COLUMN usuario     TEXT DEFAULT '';
ALTER TABLE partners ADD COLUMN pass_hash   TEXT DEFAULT '';
ALTER TABLE partners ADD COLUMN login_fails TEXT DEFAULT '';
```

- [ ] **Step 2: Aplicar en local y verificar**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/worker"
npx wrangler d1 execute kuerre-db --local --file=migrate_partner_login.sql
npx wrangler d1 execute kuerre-db --local --command="SELECT id, nombre, usuario, pass_hash, login_fails FROM partners;"
```

Esperado: las tres columnas existen y están vacías en todas las filas. Si la base local no tiene la tabla `partners`, correr antes `npx wrangler d1 execute kuerre-db --local --file=schema.sql`.

- [ ] **Step 3: Aplicar en remoto y verificar**

```bash
npx wrangler d1 execute kuerre-db --remote --file=migrate_partner_login.sql
npx wrangler d1 execute kuerre-db --remote --command="SELECT id, nombre, usuario, length(pass_hash) AS len_hash, login_fails FROM partners;"
```

Esperado: las marcas existentes (`kuerre` y la de prueba) con `usuario` vacío, `len_hash = 0` y `login_fails` vacío. Ninguna marca queda con acceso hasta que se le cargue uno.

- [ ] **Step 4: Reflejar en `schema.sql`**

En `WEB KUERRE/worker/schema.sql`, dentro del `CREATE TABLE IF NOT EXISTS partners (...)`, agregar las tres columnas antes de `created_at`:

```sql
  usuario     TEXT DEFAULT '',
  pass_hash   TEXT DEFAULT '',
  login_fails TEXT DEFAULT '',
```

- [ ] **Step 5: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add worker/migrate_partner_login.sql worker/schema.sql
git commit -F - <<'EOF'
feat(panel-estudio): columnas de acceso en partners

usuario, pass_hash (pbkdf2 con salt) y login_fails para el contador de
intentos. Las marcas existentes quedan sin acceso hasta que se les cargue
uno desde el admin.
EOF
```

---

## Task 2: Login del estudio y verificación del token

**Files:**
- Modify: `WEB KUERRE/worker/src/index.js` (helpers junto a `partnerPublic`; ruta junto a las públicas, antes de `/site/config`)

**Interfaces:**
- Consumes: las columnas de la Task 1; `signJWT` y `verifyJWT`, ya exportados por `@crd/kuerre-core` (el import de ese paquete está en la primera línea del archivo — agregarlos ahí).
- Produces:
  - `makePassHash(pass) -> Promise<string>` — genera `pbkdf2$...`. La usa la Task 4 vía el endpoint de guardado.
  - `verifyPassHash(pass, stored) -> Promise<boolean>` — comparación en tiempo constante.
  - `isPartner(request, env) -> Promise<string|null>` — devuelve el `partner_id` del token o `null`. La usan los endpoints de la Task 3.
  - `POST /partner/login` body `{ usuario, pass }` → `{ token }` o error. Lo consume la Task 5.

- [ ] **Step 1: Agregar los helpers de contraseña**

En `WEB KUERRE/worker/src/index.js`, debajo de `partnerPublic`:

```js
// ── Acceso de los estudios (panel de solo lectura) ──────────────────────────
const PBKDF2_ITER      = 100000;
const LOGIN_MAX_FAILS  = 8;
const LOGIN_LOCK_MS    = 15 * 60 * 1000;
const PARTNER_SESSION_HOURS = 8;

function b64enc(bytes) { return btoa(String.fromCharCode(...bytes)); }
function b64dec(s)     { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

async function pbkdf2Bits(pass, salt, iter, bits) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, bits);
  return new Uint8Array(out);
}

// Formato: pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>. La clave nunca se guarda.
async function makePassHash(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2Bits(String(pass), salt, PBKDF2_ITER, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64enc(salt)}$${b64enc(h)}`;
}

async function verifyPassHash(pass, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10);
  if (!iter || iter < 1000) return false;
  let salt, expected;
  try { salt = b64dec(parts[2]); expected = b64dec(parts[3]); } catch { return false; }
  if (!expected.length) return false;
  const got = await pbkdf2Bits(String(pass), salt, iter, expected.length * 8);
  if (got.length !== expected.length) return false;
  // Comparacion en tiempo constante: un === sobre strings filtra cuanto coincide.
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

function parseLoginFails(v) {
  const [n, ts] = String(v || '').split('|');
  return { n: parseInt(n || '0', 10) || 0, ts: parseInt(ts || '0', 10) || 0 };
}

// Un solo UPDATE: leer y despues escribir se puede esquivar mandando intentos en
// paralelo. El CASE tambien reinicia la cuenta si la ventana de bloqueo ya paso.
async function bumpLoginFails(db, pid) {
  const now = Date.now();
  await db.prepare(`
    UPDATE partners
       SET login_fails = CAST(
             CASE WHEN instr(login_fails, '|') > 0
                   AND (? - CAST(substr(login_fails, instr(login_fails, '|') + 1) AS INTEGER)) < ?
                  THEN CAST(substr(login_fails, 1, instr(login_fails, '|') - 1) AS INTEGER) + 1
                  ELSE 1 END AS TEXT) || '|' || CAST(? AS TEXT)
     WHERE id = ?`).bind(now, LOGIN_LOCK_MS, now, pid).run();
}

// Devuelve el partner_id del token, o null. El id SIEMPRE sale de aca:
// ningun endpoint de partner lo acepta por parametro.
async function isPartner(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const p = await verifyJWT(auth.slice(7), env.ADMIN_JWT_SECRET);
    return (p && p.role === 'partner' && p.pid) ? String(p.pid) : null;
  } catch { return null; }
}
```

- [ ] **Step 2: Importar `signJWT` y `verifyJWT`**

La primera línea del archivo importa de `@crd/kuerre-core`. Agregar `signJWT` y `verifyJWT` a esa lista de imports (ya están exportados por el paquete vía `export * from './auth.js'`). No agregar un import nuevo aparte.

- [ ] **Step 3: Agregar la ruta de login**

Justo antes del bloque `if (path === '/brand' && method === 'GET')`:

```js
      // ── Login del panel del estudio ───────────────────────────────────────
      if (path === '/partner/login' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const usuario = String(body.usuario || '').trim();
        const pass    = String(body.pass || '');
        // Mismo error para usuario inexistente, clave incorrecta y marca
        // desactivada: no se le dice al atacante cual de las tres fallo.
        const generico = () => json({ error: 'Usuario o contraseña incorrectos' }, 401);
        if (!usuario || !pass) return generico();
        const row = await env.KUERRE_DB.prepare(
          "SELECT id, pass_hash, login_fails FROM partners WHERE usuario = ? AND usuario != '' AND activo = 1"
        ).bind(usuario).first();
        if (!row || !row.pass_hash) return generico();
        const f = parseLoginFails(row.login_fails);
        if (f.n >= LOGIN_MAX_FAILS && (Date.now() - f.ts) < LOGIN_LOCK_MS) {
          const mins = Math.ceil((LOGIN_LOCK_MS - (Date.now() - f.ts)) / 60000);
          return json({ error: `Demasiados intentos. Probá de nuevo en ${mins} minuto${mins === 1 ? '' : 's'}.` }, 429);
        }
        if (!await verifyPassHash(pass, row.pass_hash)) {
          await bumpLoginFails(env.KUERRE_DB, row.id);
          return generico();
        }
        await env.KUERRE_DB.prepare("UPDATE partners SET login_fails = '' WHERE id = ?").bind(row.id).run();
        const token = await signJWT(
          { role: 'partner', pid: row.id, exp: Math.floor(Date.now() / 1000) + PARTNER_SESSION_HOURS * 3600 },
          env.ADMIN_JWT_SECRET
        );
        return json({ token });
      }
```

- [ ] **Step 4: Verificar la sintaxis y deployar**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/worker"
node --check src/index.js
ls -la node_modules/@crd/
npx wrangler deploy
```

Esperado: `node --check` sin salida, `kuerre-core` es un symlink, y el deploy imprime `Deployed kuerre-worker`.

- [ ] **Step 5: Verificar el login contra una marca de prueba**

Todavía no hay ninguna marca con acceso (el admin se hace en la Task 4), así que sembrá una a mano para probar. Generá el hash con el mismo algoritmo, en un script temporal **fuera del repo**:

```bash
SP="C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/b6c4dfbd-26db-406d-b2ef-09cb0a58cfc2/scratchpad"
cat > "$SP/mkhash.mjs" <<'EOF'
const ITER = 100000;
const pass = process.argv[2];
const salt = crypto.getRandomValues(new Uint8Array(16));
const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
const bits = new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', salt, iterations: ITER, hash:'SHA-256' }, key, 256));
const b64 = b => Buffer.from(b).toString('base64');
console.log(`pbkdf2$${ITER}$${b64(salt)}$${b64(bits)}`);
EOF
node "$SP/mkhash.mjs" "<CLAVE-DE-PRUEBA>"
```

Con el hash que imprime, sembrá el acceso de la marca de prueba (id `01bf5588-bff8-4fd0-858f-253977b0c2f1`):

```bash
npx wrangler d1 execute kuerre-db --remote --command="UPDATE partners SET usuario='kanaudt', pass_hash='<hash>' WHERE id='01bf5588-bff8-4fd0-858f-253977b0c2f1';"
```

Y probá los casos:

```bash
W=https://kuerre-worker.cristian-romero-digital.workers.dev
curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"<CLAVE-DE-PRUEBA>"}'
curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"incorrecta"}'
curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"noexiste","pass":"x"}'
```

Esperado: el primero devuelve `{"token":"..."}`; el segundo y el tercero devuelven **exactamente el mismo** `{"error":"Usuario o contraseña incorrectos"}` con status 401.

- [ ] **Step 6: Verificar el bloqueo por intentos**

```bash
for i in 1 2 3 4 5 6 7 8 9; do curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"mal"}'; echo; done
```

Esperado: los primeros 8 devuelven el error genérico y a partir del noveno aparece `Demasiados intentos. Probá de nuevo en N minutos.` con status 429. Después, limpiá el contador para no quedar bloqueado:

```bash
npx wrangler d1 execute kuerre-db --remote --command="UPDATE partners SET login_fails='' WHERE id='01bf5588-bff8-4fd0-858f-253977b0c2f1';"
curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"<CLAVE-DE-PRUEBA>"}'
```

Esperado: vuelve a devolver token. Guardá ese token: lo usa la Task 3.

- [ ] **Step 7: Verificar que una marca desactivada no entra**

```bash
npx wrangler d1 execute kuerre-db --remote --command="UPDATE partners SET activo=0 WHERE id='01bf5588-bff8-4fd0-858f-253977b0c2f1';"
curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"<CLAVE-DE-PRUEBA>"}'
npx wrangler d1 execute kuerre-db --remote --command="UPDATE partners SET activo=1 WHERE id='01bf5588-bff8-4fd0-858f-253977b0c2f1';"
```

Esperado: con `activo=0` devuelve el error genérico; al reactivarla vuelve a andar. **Dejala activa al terminar.**

- [ ] **Step 8: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add worker/src/index.js
git commit -F - <<'EOF'
feat(panel-estudio): login por marca con hash pbkdf2 y bloqueo por intentos

POST /partner/login emite un JWT con role:'partner' y el partner_id adentro.
La clave se guarda hasheada con salt propio y se compara en tiempo constante.
El error es el mismo para usuario inexistente, clave incorrecta y marca
desactivada. A los 8 fallos la cuenta queda trabada 15 minutos, con el
contador en una sola sentencia para que no se esquive en paralelo.
EOF
```

---

## Task 3: Endpoints de lectura del panel

**Files:**
- Modify: `WEB KUERRE/worker/src/index.js` (rutas junto a `/partner/login`)

**Interfaces:**
- Consumes: `isPartner(request, env)` y `partnerPublic(db, partnerId, origin)` (ya existe, de la feature de marca blanca).
- Produces:
  - `GET /partner/me` → `{ nombre, slogan, logo_url }`
  - `GET /partner/clientes` → `{ clientes: [...] }` con la forma exacta del Step 2. La consume la Task 5.

- [ ] **Step 1: Agregar `GET /partner/me`**

Debajo de la ruta de login:

```js
      if (path === '/partner/me' && method === 'GET') {
        const pid = await isPartner(request, env);
        if (!pid) return json({ error: 'Unauthorized' }, 401);
        const marca = await partnerPublic(env.KUERRE_DB, pid, url.origin);
        return json(marca);
      }
```

- [ ] **Step 2: Agregar `GET /partner/clientes`**

Debajo de `/partner/me`:

```js
      if (path === '/partner/clientes' && method === 'GET') {
        const pid = await isPartner(request, env);
        if (!pid) return json({ error: 'Unauthorized' }, 401);

        // Columnas listadas una por una a proposito: con SELECT s.* cualquier
        // columna que se agregue a solicitudes se filtraria sola a un tercero.
        const { results } = await env.KUERRE_DB.prepare(`
          SELECT s.id, s.salon, s.cliente_nombre, s.cliente_tel, s.cliente_email,
                 s.invite_id, s.fiesta_id,
                 e.nombre AS nombre_display, e.tipo, e.fecha, e.slug AS evento_slug,
                 ef.estado AS fiesta_estado,
                 ec.folder_id AS entrega_folder
            FROM solicitudes s
            LEFT JOIN eventos e        ON e.id  = s.evento_id
            LEFT JOIN eventos_foto ef  ON ef.id = s.fiesta_id
            LEFT JOIN entrega_configs ec ON ec.id = s.id
           WHERE s.partner_id = ?
           ORDER BY s.created_at DESC`).bind(pid).all();

        // El slug publico de la invitacion vive en crd_invites: una sola lectura
        // de KV para todas las filas.
        let invites = [];
        try {
          const raw = await env.KUERRE_KV.get('crd_invites');
          invites = raw ? JSON.parse(raw) : [];
        } catch (e) { console.log('partner/clientes: crd_invites', e.message); }

        const clientes = (results || []).map(r => {
          const inviteOk  = !!(r.invite_id && String(r.invite_id).trim());
          const fiestaOk  = r.fiesta_estado === 'activo';
          const entregaOk = !!(r.entrega_folder && String(r.entrega_folder).trim());

          let linkInvitacion = '';
          if (inviteOk) {
            const ent = invites.find(x => String(x.id).toLowerCase() === String(r.invite_id).toLowerCase());
            if (ent && ent.slug) linkInvitacion = '/invite.html?i=' + encodeURIComponent(ent.slug);
          }
          const slugFiesta = r.evento_slug || r.fiesta_id || '';
          const linkFiesta = fiestaOk && slugFiesta ? '/fiestas.html?e=' + encodeURIComponent(slugFiesta) : '';
          let linkEntrega = '';
          if (entregaOk) {
            const p = new URLSearchParams({
              folder: r.entrega_folder,
              nombres: r.nombre_display || '',
              fecha: r.fecha || '',
              tipo: String(r.tipo || '').toLowerCase()
            });
            linkEntrega = '/entrega.html?' + p.toString();
          }

          return {
            evento:   { nombre: r.nombre_display || '', tipo: r.tipo || '', fecha: r.fecha || '', salon: r.salon || '' },
            contacto: { nombre: r.cliente_nombre || '', tel: r.cliente_tel || '', email: r.cliente_email || '' },
            estados:  { invitacion: inviteOk ? 'lista' : 'pendiente',
                        fiesta:     fiestaOk ? 'activa' : 'pendiente',
                        entrega:    entregaOk ? 'lista' : 'pendiente' },
            links:    { invitacion: linkInvitacion, fiesta: linkFiesta, entrega: linkEntrega }
          };
        });

        return json({ clientes });
      }
```

**Sobre los links:** el worker devuelve **rutas** (`/invite.html?i=...`), no URLs absolutas, y la página les antepone su propio `location.origin`. Así la lógica de slugs queda en un solo lugar, como pide el spec, sin hardcodear el dominio en el worker.

- [ ] **Step 3: Deployar y verificar el aislamiento**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/worker"
node --check src/index.js
npx wrangler deploy
W=https://kuerre-worker.cristian-romero-digital.workers.dev
JWT=<token de partner de la Task 2>
curl -s "$W/partner/me" -H "Authorization: Bearer $JWT"
curl -s "$W/partner/clientes" -H "Authorization: Bearer $JWT"
```

Esperado: `/partner/me` devuelve el nombre y el logo de la marca de prueba. `/partner/clientes` devuelve **solo** los clientes cuyo `partner_id` es esa marca — comparar contra:

```bash
npx wrangler d1 execute kuerre-db --remote --command="SELECT id, partner_id FROM solicitudes;"
```

- [ ] **Step 4: Verificar los tres controles de acceso**

```bash
# sin token
curl -s -o /dev/null -w "sin token: %{http_code}\n" "$W/partner/clientes"
# con el token de admin (rol equivocado)
curl -s -o /dev/null -w "token admin: %{http_code}\n" "$W/partner/clientes" -H "Authorization: Bearer <jwt de admin>"
# intentando forzar otra marca por parametro
curl -s "$W/partner/clientes?partner_id=kuerre&pid=kuerre" -H "Authorization: Bearer $JWT" | head -c 400
```

Esperado: los dos primeros dan `401`. El tercero devuelve **los mismos clientes de siempre**, ignorando los parámetros: el id sale del token.

- [ ] **Step 5: Verificar que no se filtran columnas de más**

```bash
curl -s "$W/partner/clientes" -H "Authorization: Bearer $JWT" | python -c "
import sys,json
d=json.load(sys.stdin)['clientes']
if not d: print('sin clientes asignados — asignale uno a la marca de prueba para probar esto'); raise SystemExit
print('claves de primer nivel:', sorted(d[0].keys()))
print('evento:', sorted(d[0]['evento'].keys()))
print('contacto:', sorted(d[0]['contacto'].keys()))
print('estados:', sorted(d[0]['estados'].keys()))
print('links:', sorted(d[0]['links'].keys()))
"
```

Esperado exactamente: `['contacto','estados','evento','links']`, `['fecha','nombre','salon','tipo']`, `['email','nombre','tel']`, `['entrega','fiesta','invitacion']`, `['entrega','fiesta','invitacion']`. Ninguna clave más: nada de `codigo_contrato`, `drive_*`, `data_json` ni `partner_id`.

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add worker/src/index.js
git commit -F - <<'EOF'
feat(panel-estudio): endpoints de lectura /partner/me y /partner/clientes

Filtran por el partner_id del token, nunca por parametro. Las columnas van
listadas una por una en vez de SELECT s.*, para que agregar una columna a
solicitudes no la filtre sola al panel de un tercero. Los links salen como
rutas y la pagina les antepone su origin.
EOF
```

---

## Task 4: Campos de acceso en el admin

**Files:**
- Modify: `CORE/src/admin.html`
- Modify: `CORE/brands/kuerre/config.json` (bump), `CORE/brands/crp/config.json` (reanclado)
- Modify: `WEB KUERRE/worker/src/index.js` (aceptar `usuario` y `pass` en el ABM de partners)

**Interfaces:**
- Consumes: `makePassHash(pass)` de la Task 2; el modal de marca y las funciones `partnersEditar` / `partnersGuardar`, que ya existen.
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Aceptar usuario y contraseña en el worker**

En `WEB KUERRE/worker/src/index.js`, en el handler `POST /partners`, después de generar `pid` y `slug` y antes del INSERT:

```js
        const nuevoUser = String(b.usuario || '').trim();
        if (nuevoUser) {
          const taken = await env.KUERRE_DB.prepare(
            "SELECT id FROM partners WHERE usuario = ? AND usuario != ''"
          ).bind(nuevoUser).first();
          if (taken) return json({ error: 'Ese usuario ya lo tiene otra marca' }, 409);
        }
        const nuevoHash = b.pass ? await makePassHash(String(b.pass)) : '';
```

y sumar `usuario` y `pass_hash` a las columnas y a los valores del INSERT existente, bindeando `nuevoUser` y `nuevoHash`.

En `PATCH /partners/{id}`, agregar antes del `if (!sets.length)`:

```js
        if (b.usuario !== undefined) {
          const nuevoUser = String(b.usuario).trim();
          if (nuevoUser) {
            const taken = await env.KUERRE_DB.prepare(
              "SELECT id FROM partners WHERE usuario = ? AND usuario != '' AND id != ?"
            ).bind(nuevoUser, partnerIdMatch[1]).first();
            if (taken) return json({ error: 'Ese usuario ya lo tiene otra marca' }, 409);
          }
          sets.push('usuario = ?'); vals.push(nuevoUser);
        }
        // Vacio = no tocar la clave. Solo se reemplaza si mandan una nueva.
        if (b.pass) {
          sets.push('pass_hash = ?'); vals.push(await makePassHash(String(b.pass)));
          sets.push("login_fails = ?"); vals.push('');
        }
```

En `GET /partners`, agregar `usuario` a las columnas del SELECT y devolver además `tiene_acceso` calculado como `pass_hash != ''` — **nunca** devolver `pass_hash`.

- [ ] **Step 2: Agregar los campos al modal**

En `CORE/src/admin.html`, en el modal de marca, después del bloque del logo y antes del bloque `id="pm-demo-links"`:

```html
            <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;min-width:0">
              <label style="font-size:9px;letter-spacing:1px;color:var(--gray2);display:block;margin-bottom:6px">Acceso al panel del estudio <i class="tip" data-tip="Con estos datos el estudio entra a estudio.html y ve sus clientes, los estados de sus 3 servicios y los links. Es solo lectura: no puede crear ni editar nada.">?</i></label>
              <div style="display:grid;grid-template-columns:minmax(0,1fr);gap:8px">
                <input id="pm-usuario" type="text" placeholder="Usuario (ej: kanaudt)" autocomplete="off" style="width:100%;box-sizing:border-box;background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;border-radius:4px">
                <input id="pm-pass" type="password" placeholder="Contraseña nueva (vacío = no cambiarla)" autocomplete="new-password" style="width:100%;box-sizing:border-box;background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;border-radius:4px">
                <div id="pm-acceso-estado" style="font-size:10px;color:var(--gray2)"></div>
              </div>
            </div>
```

- [ ] **Step 3: Cargar y guardar los campos**

En `partnersNuevo()`, agregar junto a los otros reset:

```js
  document.getElementById('pm-usuario').value = '';
  document.getElementById('pm-pass').value = '';
  document.getElementById('pm-acceso-estado').textContent = 'Al guardar, el estudio podrá entrar con estos datos.';
```

En `partnersEditar(id)`, junto a los otros `value =`:

```js
  document.getElementById('pm-usuario').value = p.usuario || '';
  // Vacio a proposito: solo se guarda el hash, la clave no se puede mostrar.
  document.getElementById('pm-pass').value = '';
  document.getElementById('pm-acceso-estado').textContent = p.tiene_acceso
    ? '✓ Acceso configurado — dejá la contraseña vacía para no cambiarla'
    : 'Todavía sin acceso: cargá usuario y contraseña para habilitarlo';
```

En `partnersGuardar()`, agregar al objeto `body`:

```js
    usuario:   document.getElementById('pm-usuario').value.trim(),
    pass:      document.getElementById('pm-pass').value
```

Y en la lista de `initPartnersPage()`, agregar debajo del slogan de cada fila un indicador del acceso:

```js
        '<div style="font-size:9px;color:var(--gray2);margin-top:2px">' + (p.tiene_acceso ? '🔑 con acceso' : 'sin acceso') + '</div>' +
```

- [ ] **Step 4: Bump de versión y build**

- `CORE/src/admin.html`: cambiar `V1.98` por `V1.99` en el footer del sidebar.
- `CORE/brands/kuerre/config.json`, patch 0: `">V1.93<"`.

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
node build-admin.cjs kuerre
```

- [ ] **Step 5: Reanclar los patches de CRP y verificar**

El bloque nuevo cae dentro de los patches 1d y 1e de `brands/crp/config.json`, que matchean texto exacto. Reanclarlos con este script (ya se usó dos veces en esta feature):

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
python - <<'PY'
import json,io
core=io.open('src/admin.html',encoding='utf-8').read().replace('\r\n','\n')
p='brands/crp/config.json'; c=json.load(io.open(p,encoding='utf-8')); n=0
for i,pt in enumerate(c['patches']):
    f=pt.get('find')
    if not f or f in core: continue
    ini,fin=f[:70],f[-70:]
    a,b=core.find(ini),core.find(fin)
    if a==-1 or b==-1 or core.count(ini)!=1 or core.count(fin)!=1:
        print(i,'NO reanclable:',pt.get('_comment','')[:50]); continue
    pt['find']=core[a:b+len(fin)]; n+=1
    print(i,'reanclado:',pt.get('_comment','')[:50])
if n: io.open(p,'w',encoding='utf-8',newline='\n').write(json.dumps(c,ensure_ascii=False,indent=2))
PY
node build-admin.cjs crp && echo "PATCHES CRP OK"
grep -c "pm-usuario" "../WEB CRP/Productivo/admin.html"
cd "../WEB CRP" && git checkout -- Productivo/admin.html 2>/dev/null; git checkout -- Desarrollo/admin.html 2>/dev/null; git status --short
```

Esperado: el build de CRP corre, el `grep` da **0** (el admin de CRP no tiene los campos), y después del checkout `git status` no muestra los dos `admin.html` (los otros archivos sucios de WEB CRP son preexistentes: `Productivo` como submódulo, `worker/src/index.js` y dos untracked — no tocarlos).

- [ ] **Step 6: Verificar contra el worker**

Con el JWT de admin, comprobar que el guardado funciona y que el hash nunca sale:

```bash
W=https://kuerre-worker.cristian-romero-digital.workers.dev
JWT=<jwt de admin>
curl -s -X PATCH "$W/partners/01bf5588-bff8-4fd0-858f-253977b0c2f1" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"<CLAVE-NUEVA>"}'
curl -s "$W/partners" -H "Authorization: Bearer $JWT" | python -c "
import sys,json
for p in json.load(sys.stdin):
    print(p['nombre'], '| usuario:', p.get('usuario'), '| tiene_acceso:', p.get('tiene_acceso'), '| pass_hash presente:', 'pass_hash' in p)
"
curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"<CLAVE-NUEVA>"}' | head -c 60
```

Esperado: el PATCH devuelve `{"ok":true}`; el listado muestra `tiene_acceso: True` y **`pass_hash presente: False`**; el login con la clave nueva devuelve token.

La verificación en el navegador (que los campos carguen, que la contraseña aparezca vacía al editar) la hace el dueño del repo: reportala como pendiente, no la simules.

- [ ] **Step 7: Commit en los dos repos**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
git add src/admin.html brands/kuerre/config.json brands/crp/config.json
git commit -F - <<'EOF'
feat(panel-estudio): campos de acceso en la ficha de la marca (V1.99 / Kuerre V1.93)

Usuario y contraseña en el modal de Marcas. La contraseña aparece vacia al
editar porque solo se guarda el hash: vacia significa no cambiarla. Reancla
los patches 1d y 1e de CRP.
EOF
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add worker/src/index.js Desarrollo/admin.html Productivo/admin.html
git commit -F - <<'EOF'
feat(panel-estudio): el ABM de marcas guarda usuario y contrasena

El PATCH valida que el usuario no lo tenga otra marca y solo reemplaza la
clave si mandan una nueva. GET /partners devuelve tiene_acceso calculado,
nunca el hash.
EOF
```

---

## Task 5: La página `estudio.html`

**Files:**
- Create: `WEB KUERRE/Desarrollo/estudio.html`

**Interfaces:**
- Consumes: `POST /partner/login`, `GET /partner/me`, `GET /partner/clientes` (Tasks 2 y 3).

- [ ] **Step 1: Crear la página**

Crear `WEB KUERRE/Desarrollo/estudio.html`. Estructura obligatoria, con el CSS y el JS inline:

- Un `<div id="login-view">` con: título, input de usuario, input de contraseña (`type="password"`), botón "Entrar", y un `<div id="login-error">` oculto.
- Un `<div id="panel-view">` oculto con: cabecera (logo `<img id="marca-logo">`, `<span id="marca-nombre">`, botón "Salir"), un input de búsqueda `#buscador`, y `<div id="lista">`.
- Un `<div id="vacio">` oculto con el texto: `Todavía no tenés eventos asignados. Cuando Kuerre te asigne uno, aparece acá.`

El JS:

```js
const WORKER = 'https://kuerre-worker.cristian-romero-digital.workers.dev';
const JWT_KEY = 'kuerre_estudio_jwt';   // clave propia: no comparte sesion con el admin
let _clientes = [];

function getJwt()  { try { return localStorage.getItem(JWT_KEY) || ''; } catch(e) { return ''; } }
function setJwt(t) { try { t ? localStorage.setItem(JWT_KEY, t) : localStorage.removeItem(JWT_KEY); } catch(e) {} }

function esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fechaFmt(f) { return f ? String(f).replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1') : '—'; }

async function api(path) {
  const r = await fetch(WORKER + path, { headers: { 'Authorization': 'Bearer ' + getJwt() } });
  if (r.status === 401) { setJwt(''); mostrarLogin('Tu sesión expiró. Entrá de nuevo.'); return null; }
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}

function mostrarLogin(msg) {
  document.getElementById('panel-view').style.display = 'none';
  document.getElementById('login-view').style.display = 'block';
  const e = document.getElementById('login-error');
  if (msg) { e.textContent = msg; e.style.display = 'block'; } else { e.style.display = 'none'; }
}

async function entrar() {
  const usuario = document.getElementById('in-usuario').value.trim();
  const pass    = document.getElementById('in-pass').value;
  const err     = document.getElementById('login-error');
  err.style.display = 'none';
  try {
    const r = await fetch(WORKER + '/partner/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, pass })
    });
    const d = await r.json();
    if (!d.token) { err.textContent = d.error || 'No se pudo entrar'; err.style.display = 'block'; return; }
    setJwt(d.token);
    document.getElementById('in-pass').value = '';
    await abrirPanel();
  } catch(e) {
    err.textContent = 'No se pudo conectar. Probá de nuevo.'; err.style.display = 'block';
  }
}

function salir() { setJwt(''); mostrarLogin(''); }

async function abrirPanel() {
  const marca = await api('/partner/me');
  if (!marca) return;
  document.getElementById('marca-nombre').textContent = marca.nombre || '';
  const logo = document.getElementById('marca-logo');
  if (marca.logo_url) { logo.src = marca.logo_url; logo.style.display = 'block'; }
  else logo.style.display = 'none';
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('panel-view').style.display = 'block';
  const d = await api('/partner/clientes');
  if (!d) return;
  _clientes = d.clientes || [];
  render();
}

function chip(texto, listo) {
  const bg = listo ? 'rgba(37,211,102,0.15)' : 'rgba(0,0,0,0.06)';
  const co = listo ? '#1a9e4b' : '#8a8a92';
  return '<span style="background:' + bg + ';color:' + co + ';font-size:10px;padding:3px 10px;border-radius:12px">' + esc(texto) + '</span>';
}

function render() {
  const q = document.getElementById('buscador').value.trim().toLowerCase();
  const list = _clientes.filter(function(c) {
    if (!q) return true;
    return (c.evento.nombre + ' ' + c.contacto.nombre).toLowerCase().indexOf(q) !== -1;
  });
  document.getElementById('vacio').style.display = _clientes.length ? 'none' : 'block';
  document.getElementById('lista').innerHTML = list.map(function(c, i) {
    const contacto = [c.contacto.nombre, c.contacto.tel, c.contacto.email].filter(Boolean).map(esc).join(' · ');
    const links = [
      c.links.invitacion ? '<button onclick="copiar(' + i + ',\'invitacion\')">Invitación</button>' : '',
      c.links.fiesta     ? '<button onclick="copiar(' + i + ',\'fiesta\')">QR Fiestas</button>' : '',
      c.links.entrega    ? '<button onclick="copiar(' + i + ',\'entrega\')">Entrega</button>' : ''
    ].filter(Boolean).join(' ');
    return '<div class="fila">' +
      '<div class="fila-top"><strong>' + esc(c.evento.nombre) + '</strong>' +
        '<span class="fila-meta">' + esc(c.evento.tipo) + ' · ' + fechaFmt(c.evento.fecha) + (c.evento.salon ? ' · ' + esc(c.evento.salon) : '') + '</span></div>' +
      (contacto ? '<div class="fila-contacto">' + contacto + '</div>' : '') +
      '<div class="fila-chips">' +
        chip(c.estados.invitacion === 'lista' ? 'Invitación lista' : 'Invitación pendiente', c.estados.invitacion === 'lista') +
        chip(c.estados.fiesta === 'activa' ? 'QR activo' : 'QR pendiente', c.estados.fiesta === 'activa') +
        chip(c.estados.entrega === 'lista' ? 'Entrega lista' : 'Entrega pendiente', c.estados.entrega === 'lista') +
      '</div>' +
      (links ? '<div class="fila-links">Copiar link: ' + links + '</div>' : '') +
    '</div>';
  }).join('');
}

// El worker devuelve rutas; el dominio lo pone la pagina.
function copiar(i, cual) {
  const path = _clientes[i] && _clientes[i].links[cual];
  if (!path) return;
  navigator.clipboard.writeText(location.origin + path)
    .then(function(){ toast('Link copiado ✓'); })
    .catch(function(){ toast('No se pudo copiar'); });
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.display = 'block';
  clearTimeout(window._tt); window._tt = setTimeout(function(){ t.style.display = 'none'; }, 2000);
}

document.getElementById('buscador').addEventListener('input', render);
document.getElementById('in-pass').addEventListener('keydown', function(e){ if (e.key === 'Enter') entrar(); });
if (getJwt()) abrirPanel().catch(function(){ mostrarLogin(''); });
else mostrarLogin('');
```

El CSS: seguí la paleta del admin de Kuerre (tema claro, acentos morados `#9060b8`). Las clases `.fila`, `.fila-top`, `.fila-meta`, `.fila-contacto`, `.fila-chips`, `.fila-links` y `#toast` las definís vos con ese criterio. El `<title>` es `Panel del estudio`. La página debe verse bien en celular: el estudio la va a abrir desde el teléfono.

- [ ] **Step 2: Verificar la sintaxis**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/Desarrollo"
SP="C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/b6c4dfbd-26db-406d-b2ef-09cb0a58cfc2/scratchpad"
python - <<'PY'
import io,re
s=io.open('estudio.html',encoding='utf-8').read()
js='\n'.join(re.findall(r'<script>(.*?)</script>', s, re.S))
io.open(r'C:/Users/crist/AppData/Local/Temp/claude/e--CLAUDE/b6c4dfbd-26db-406d-b2ef-09cb0a58cfc2/scratchpad/chk_estudio.js','w',encoding='utf-8',newline='\n').write(js)
print('js extraido:', len(js), 'chars')
PY
node --check "$SP/chk_estudio.js" && echo "JS ok"
grep -c $'\r' estudio.html
```

Esperado: `JS ok` y `0` CRLF.

- [ ] **Step 3: Verificar que no filtra nada por HTML**

```bash
grep -in "codigo_contrato\|drive_\|data_json\|partner_id\|pass_hash" estudio.html
```

Esperado: sin resultados. La página no debe nombrar ninguna columna interna.

- [ ] **Step 4: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Desarrollo/estudio.html
git commit -F - <<'EOF'
feat(panel-estudio): pagina estudio.html

Login y panel de solo lectura: los clientes de la marca, los estados de las
3 piezas y los links para copiar. Sesion propia en localStorage, separada de
la del admin. Solo llama a los endpoints /partner/*.
EOF
```

---

## Task 6: Deploy y verificación en producción

**Files:**
- Modify: `WEB KUERRE/Productivo/estudio.html` y `admin.html` (copias), `.worktrees/gh-pages/` (copias)

- [ ] **Step 1: Copiar a Productivo y a gh-pages**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
cp Desarrollo/estudio.html Productivo/estudio.html
cmp -s Desarrollo/estudio.html Productivo/estudio.html && echo "identicos ok"
cp Productivo/estudio.html .worktrees/gh-pages/estudio.html
cp Productivo/admin.html   .worktrees/gh-pages/admin.html
```

- [ ] **Step 2: Commit y push de las dos ramas y de CORE**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Productivo/estudio.html
git commit -F - <<'EOF'
build: copia de estudio.html a Productivo
EOF
git push origin main
git log origin/main --oneline -1
cd .worktrees/gh-pages
git add estudio.html admin.html
git commit -F - <<'EOF'
deploy: panel del estudio (estudio.html) y admin V1.93
EOF
git push origin gh-pages
git log origin/gh-pages --oneline -1
cd "e:/CLAUDE/KUERRE SISTEMA/CORE" && git push origin main && git log origin/main --oneline -1
```

- [ ] **Step 3: Esperar la propagación y verificar en vivo**

GitHub Pages tarda; este repo además falla de forma intermitente (~20%) por razones ajenas al contenido. Si no propaga en unos minutos, no toques el código: es el pipeline.

```bash
until curl -s "https://kuerre.com.ar/estudio.html" | grep -q 'partner/login'; do sleep 10; done
echo "PROPAGADO"
curl -s -o /dev/null -w "estudio.html: %{http_code}\n" "https://kuerre.com.ar/estudio.html"
curl -s "https://kuerre.com.ar/admin.html" | grep -o "V1\.[0-9]*" | head -1
```

Esperado: `200` y `V1.93`.

- [ ] **Step 4: Verificar el aislamiento con dos marcas**

Creá una segunda marca de prueba con acceso y asignale un cliente distinto, para confirmar el aislamiento con datos reales:

```bash
W=https://kuerre-worker.cristian-romero-digital.workers.dev
JWT=<jwt de admin>
curl -s -X POST "$W/partners" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"nombre":"Estudio Aislamiento","usuario":"aislamiento","pass":"<CLAVE-DE-PRUEBA-2>"}'
```

Anotá el `id` devuelto, asignale **un** cliente distinto al de la primera marca con `PATCH /solicitudes/{id}/partner`, y después:

```bash
T1=$(curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"kanaudt","pass":"<CLAVE-NUEVA>"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
T2=$(curl -s -X POST "$W/partner/login" -H "Content-Type: application/json" -d '{"usuario":"aislamiento","pass":"<CLAVE-DE-PRUEBA-2>"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s "$W/partner/clientes" -H "Authorization: Bearer $T1" | python -c "import sys,json;print('marca 1:',[c['evento']['nombre'] for c in json.load(sys.stdin)['clientes']])"
curl -s "$W/partner/clientes" -H "Authorization: Bearer $T2" | python -c "import sys,json;print('marca 2:',[c['evento']['nombre'] for c in json.load(sys.stdin)['clientes']])"
```

Esperado: dos listas **disjuntas**. Ninguna marca ve el cliente de la otra.

- [ ] **Step 5: Limpiar los datos de prueba**

Devolvé el cliente que asignaste a la segunda marca a `partner_id='kuerre'`, y borrá la marca "Estudio Aislamiento" con `DELETE /partners/{id}`. **No borres** la marca Kanaudt ni le saques el acceso: el dueño la está usando.

```bash
npx wrangler d1 execute kuerre-db --remote --command="SELECT id, nombre, usuario FROM partners;"
npx wrangler d1 execute kuerre-db --remote --command="SELECT partner_id, COUNT(*) FROM solicitudes GROUP BY partner_id;"
```

Esperado: queda `kuerre` sin usuario y Kanaudt con el suyo; los clientes reales, todos donde estaban antes de esta tarea.

- [ ] **Step 6: Listar lo que queda pendiente de verificación visual**

En el reporte, dejá anotado explícitamente lo que no se puede verificar sin navegador y tiene que probar el dueño:
- Que el modal de marca muestre los campos y que la contraseña aparezca vacía al editar.
- Que `estudio.html` entre con usuario y clave, muestre el logo de la marca y liste sus clientes.
- Que los tres botones de copiar den links que abren la pieza correcta.
- Que se vea bien en celular.

---

## Verificación cruzada con el spec

| Requisito del spec | Task |
|---|---|
| Tres columnas nuevas en `partners`, sin tabla nueva | 1 |
| `pass_hash` con formato `pbkdf2$iter$salt$hash` | 2 |
| Comparación en tiempo constante | 2 |
| Error genérico para los tres casos de fallo | 2 |
| Marca desactivada no entra | 2 |
| Bloqueo de 8 intentos / 15 minutos, contador atómico | 2 |
| JWT con `role:'partner'` y `pid`, 8 horas | 2 |
| `partner_id` siempre del token, nunca por parámetro | 2, 3 |
| `GET /partner/clientes` con campos explícitos | 3 |
| `GET /partner/me` con la identidad de la marca | 3 |
| Links armados server-side | 3 |
| Campos de acceso en la ficha de la marca | 4 |
| Contraseña vacía al editar = no cambiarla | 4 |
| Indicador de acceso configurado | 4 |
| Usuario único entre marcas | 4 |
| El hash nunca sale del worker | 4 |
| Página `estudio.html` con login y panel | 5 |
| Sesión propia en localStorage | 5 |
| Estado vacío explicando que no hay eventos | 5 |
| Chips de estado y botones de copiar | 5 |
| CRP sin los campos nuevos | 4, 6 |
| Aislamiento verificado con dos marcas | 6 |
