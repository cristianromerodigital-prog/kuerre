# Marca blanca (partners) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un estudio revendedor muestre su logo, nombre, slogan, WhatsApp, Instagram y web en lugar de los de Kuerre, en la invitación, el QR de fiestas y la entrega de un cliente marcado con esa marca.

**Architecture:** Tabla `partners` en D1 + una columna `solicitudes.partner_id`. Kuerre es una fila más de `partners`, así que ninguna página tiene rama de marca. Un endpoint público `GET /brand?scope=&id=` sube desde el slug de invitación / id de fiesta / folder de entrega hasta el cliente, lee su `partner_id` y devuelve solo campos públicos; las páginas pintan esos datos en nodos marcados con `data-brand=""`.

**Tech Stack:** Cloudflare Workers (JS módulos, sin build), D1 (SQLite), R2 (`MEDIA`), HTML/CSS/JS vanilla inline, `wrangler` CLI, `CORE/build-admin.cjs` para el admin.

## Global Constraints

- Spec de referencia: `WEB KUERRE/docs/superpowers/specs/2026-08-29-marca-blanca-partners-design.md`.
- El dominio no cambia: los links siguen siendo `kuerre.com.ar/...`. No se agregan custom domains.
- No se tocan colores, tipografías ni estilos de invitación: la marca solo aporta logo, nombre, slogan, WhatsApp, Instagram y web.
- No se agregan botones de contacto donde hoy no existen. Invitación y QR Fiestas siguen sin WhatsApp; Premiere sigue sin Instagram.
- WEB CRP no se deploya en ningún paso de este plan. `CORE/src/admin.html` es compartido, así que todo lo nuevo del admin va detrás de `data-module="partners"`, que en CRP queda en `false`.
- El admin **nunca** se edita en `WEB KUERRE/Productivo/admin.html` ni en `Desarrollo/admin.html`: se edita `CORE/src/admin.html` y se corre `node build-admin.cjs kuerre`.
- Las páginas públicas se editan en `WEB KUERRE/Desarrollo/` y se copian a `Productivo/` y a `.worktrees/gh-pages/`. Hoy los 5 archivos son byte-idénticos entre `Desarrollo/` y `Productivo/`; mantenerlo así.
- Todo CSS y JS va inline dentro del HTML. No crear archivos `.css` ni `.js`.
- Ids de `solicitudes` matchean `[A-Z2-9]{6}`; los ids de partner se generan con `crypto.randomUUID()` salvo la fila semilla `kuerre`.
- Nunca aceptar un `id` de partner mandado por el cliente en un INSERT, ni usar `INSERT OR REPLACE` sobre `partners`.
- El repo tiene `dubious ownership` para el usuario actual. Antes del primer commit correr una vez:
  `git config --global --add safe.directory 'E:/CLAUDE/KUERRE SISTEMA/WEB KUERRE'` y
  `git config --global --add safe.directory 'E:/CLAUDE/KUERRE SISTEMA/CORE'`.
- Antes de cualquier `wrangler deploy` del worker: verificar que `worker/node_modules/@crd/kuerre-core` sea un symlink y no una copia física vieja (`ls -la worker/node_modules/@crd/`). Si es carpeta física: `rm -rf worker/node_modules/@crd && npm install`.
- `wrangler dev` deja procesos `workerd` huérfanos que después bloquean builds y borrados. Al terminar cada sesión de `wrangler dev`: `taskkill //F //IM workerd.exe` (ignorar el error si no hay ninguno).
- La versión visible del admin se bumpea +0.01 en cada cambio que se deploya (regla 15 del CLAUDE.md global). Hoy: CORE interno `V1.90`, Kuerre `V1.84`. CRP queda como está porque no se deploya.

---

## Estructura de archivos

| Archivo | Responsabilidad | Tareas |
|---|---|---|
| `WEB KUERRE/worker/migrate_partners.sql` | **Crear.** Migración: tabla `partners`, columna `solicitudes.partner_id`, semilla `kuerre` | 1 |
| `WEB KUERRE/worker/schema.sql` | **Modificar.** Reflejar el esquema nuevo para que un rebuild desde cero coincida con producción | 1 |
| `WEB KUERRE/worker/src/index.js` | **Modificar.** Helpers `resolvePartnerId`/`partnerPublic`, endpoint público `/brand`, serve del logo, ABM admin de partners, `PATCH /solicitudes/:id/partner`, flag `partners` en `CORE_OPTIONS` | 2, 3, 4 |
| `CORE/src/admin.html` | **Modificar.** Sección "Marcas" (sidebar + página + ABM) y selector de marca en el modal de cliente | 4, 5 |
| `CORE/brands/kuerre/config.json` | **Modificar.** Bump del número de versión visible | 4, 5 |
| `WEB KUERRE/Desarrollo/fiestas.html` | **Modificar.** Nodos `data-brand` + `loadBrand('fiesta', EVENT_ID)` | 6 |
| `WEB KUERRE/Desarrollo/entrega.html` | **Modificar.** Nodos `data-brand` + eliminar número/nombre hardcodeados | 7 |
| `WEB KUERRE/Desarrollo/premiere.html` | **Modificar.** Nodos `data-brand` + eliminar número hardcodeado | 8 |
| `WEB KUERRE/Desarrollo/invite.html`, `invite-social.html` | **Modificar.** Footer con marca resuelta por slug | 9 |
| `WEB KUERRE/Productivo/*`, `.worktrees/gh-pages/*` | **Modificar.** Copias de deploy | 10 |

**Sobre la duplicación del snippet de branding:** `loadBrand()` + `applyBrand()` se repiten en las 5 páginas. Es intencional y sigue la convención del repo (todo inline, sin archivos compartidos, sin build para las páginas públicas). Son ~25 líneas idénticas; **copiarlas literalmente** en cada página, sin variaciones de nombre.

---

## Task 1: Migración D1 — tabla `partners` y `solicitudes.partner_id`

**Files:**
- Create: `WEB KUERRE/worker/migrate_partners.sql`
- Modify: `WEB KUERRE/worker/schema.sql` (agregar el mismo DDL para que un bootstrap desde cero coincida)

**Interfaces:**
- Produces: tabla `partners(id, slug, nombre, slogan, logo_key, whatsapp, instagram, web, activo, created_at)` con la fila `id='kuerre'`, y `solicitudes.partner_id TEXT NOT NULL DEFAULT 'kuerre'`. Todas las tareas siguientes leen y escriben estas columnas con estos nombres exactos.

- [ ] **Step 1: Leer los valores actuales de la marca Kuerre para la semilla**

La fila `kuerre` se siembra con lo que hoy vive en KV. Correr desde `WEB KUERRE/worker/`:

```bash
npx wrangler kv key get --remote --namespace-id d6467ee2136446f48c6bc2527d1e68a4 crd_settings
```

Anotar `waSuffix`, `instagram` (o `entregaIgUrl`) y `entregaWebUrl`. Si la clave no existe o el JSON viene vacío, usar los valores por defecto que ya están hardcodeados en las páginas:
- whatsapp: `5491162557763`
- instagram: `https://www.instagram.com/cristian.romero.digital`
- web: `https://kuerre.com.ar`
- nombre: `KUERRE`
- slogan: `Fotografía & Video de Eventos`

- [ ] **Step 2: Escribir la migración**

Crear `WEB KUERRE/worker/migrate_partners.sql` (reemplazar los tres valores de la semilla por los leídos en el Step 1):

```sql
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
        '5491162557763', 'https://www.instagram.com/cristian.romero.digital',
        'https://kuerre.com.ar');

ALTER TABLE solicitudes ADD COLUMN partner_id TEXT NOT NULL DEFAULT 'kuerre';
```

`INSERT OR IGNORE` (no `INSERT OR REPLACE`) para que re-correr la migración no pise datos ya editados desde el admin.

- [ ] **Step 3: Aplicar en local y verificar que la estructura queda bien**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/worker"
npx wrangler d1 execute kuerre-db --local --file=migrate_partners.sql
npx wrangler d1 execute kuerre-db --local --command="SELECT id, slug, nombre, slogan FROM partners;"
npx wrangler d1 execute kuerre-db --local --command="SELECT partner_id, COUNT(*) AS n FROM solicitudes GROUP BY partner_id;"
```

Esperado: una fila `kuerre | kuerre | KUERRE | Fotografía & Video de Eventos`, y todas las solicitudes locales agrupadas bajo `kuerre`. Si la DB local está vacía la segunda query devuelve 0 filas — está bien, lo que importa es que no tire error de columna.

- [ ] **Step 4: Verificar que la migración es idempotente**

```bash
npx wrangler d1 execute kuerre-db --local --file=migrate_partners.sql
```

Esperado: falla **solo** en el `ALTER TABLE` con `duplicate column name: partner_id`. Eso es correcto y esperado; el `CREATE TABLE IF NOT EXISTS` y el `INSERT OR IGNORE` no deben tirar error ni duplicar la fila. Confirmarlo:

```bash
npx wrangler d1 execute kuerre-db --local --command="SELECT COUNT(*) AS n FROM partners;"
```

Esperado: `n = 1`.

- [ ] **Step 5: Aplicar en remoto**

```bash
npx wrangler d1 execute kuerre-db --remote --file=migrate_partners.sql
npx wrangler d1 execute kuerre-db --remote --command="SELECT id, nombre, whatsapp, instagram, web FROM partners;"
npx wrangler d1 execute kuerre-db --remote --command="SELECT COUNT(*) AS total, SUM(CASE WHEN partner_id='kuerre' THEN 1 ELSE 0 END) AS con_kuerre FROM solicitudes;"
```

Esperado: la fila `kuerre` con los datos reales, y `total = con_kuerre` (ningún cliente existente quedó sin marca).

- [ ] **Step 6: Reflejar el esquema en `schema.sql`**

Agregar al final de `WEB KUERRE/worker/schema.sql` el bloque `CREATE TABLE IF NOT EXISTS partners (...)` idéntico al de la migración (sin el `INSERT` ni el `ALTER`), y agregar la línea `partner_id TEXT NOT NULL DEFAULT 'kuerre',` dentro del `CREATE TABLE IF NOT EXISTS solicitudes (...)`, justo antes de `created_at TEXT NOT NULL`.

- [ ] **Step 7: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add worker/migrate_partners.sql worker/schema.sql
git commit -F - <<'EOF'
feat(marca-blanca): tabla partners y partner_id en solicitudes

Agrega la tabla partners (logo, nombre, slogan, whatsapp, instagram, web)
y la columna solicitudes.partner_id con default 'kuerre'. Kuerre queda
sembrado como una fila más para que las páginas públicas no necesiten
ninguna rama de marca.
EOF
```

---

## Task 2: Endpoint público `GET /brand` + serve del logo

**Files:**
- Modify: `WEB KUERRE/worker/src/index.js` (helpers arriba, junto a los otros `async function` del módulo; rutas junto a `/site/config`, hoy en la línea ~966)

**Interfaces:**
- Consumes: tabla `partners` y `solicitudes.partner_id` (Task 1).
- Produces:
  - `resolvePartnerId(db, scope, id) -> Promise<string>` — devuelve siempre un id de partner, `'kuerre'` si no resuelve.
  - `partnerPublic(db, partnerId, origin) -> Promise<{nombre, slogan, logo_url, whatsapp, instagram, web}>` — solo campos públicos.
  - `GET /brand?scope=invite|fiesta|entrega&id=<x>` → ese mismo objeto JSON. Lo consumen las Tasks 6-9.
  - `GET /api/partners/{slug}/logo` → binario del logo. La URL la arma `partnerPublic`.

- [ ] **Step 1: Agregar los helpers**

En `WEB KUERRE/worker/src/index.js`, antes de `export default`, junto a las otras funciones auxiliares del módulo:

```js
// ── Marca blanca (partners) ─────────────────────────────────────────────────
const PARTNER_DEFAULT = 'kuerre';

// Sube desde una pieza pública hasta el cliente y devuelve su partner_id.
// Nunca falla: sin match, devuelve el partner por defecto.
async function resolvePartnerId(db, scope, id) {
  if (!id) return PARTNER_DEFAULT;
  let row = null;
  try {
    if (scope === 'invite') {
      row = await db.prepare('SELECT partner_id FROM solicitudes WHERE invite_slug = ?').bind(id).first();
    } else if (scope === 'fiesta') {
      row = await db.prepare('SELECT partner_id FROM solicitudes WHERE fiesta_id = ?').bind(id).first();
    } else if (scope === 'entrega') {
      row = await db.prepare(
        'SELECT s.partner_id AS partner_id FROM entrega_configs ec JOIN solicitudes s ON s.id = ec.id WHERE ec.folder_id = ?'
      ).bind(id).first();
    }
  } catch (e) {
    console.log('resolvePartnerId:', e.message);
  }
  return (row && row.partner_id) || PARTNER_DEFAULT;
}

// Solo campos públicos: nunca devolver activo, logo_key ni ids internos.
async function partnerPublic(db, partnerId, origin) {
  const cols = 'slug, nombre, slogan, logo_key, whatsapp, instagram, web';
  let p = await db.prepare(`SELECT ${cols} FROM partners WHERE id = ? AND activo = 1`).bind(partnerId).first();
  if (!p) p = await db.prepare(`SELECT ${cols} FROM partners WHERE id = ?`).bind(PARTNER_DEFAULT).first();
  if (!p) return { nombre: '', slogan: '', logo_url: '', whatsapp: '', instagram: '', web: '' };
  return {
    nombre:    p.nombre    || '',
    slogan:    p.slogan    || '',
    logo_url:  p.logo_key ? `${origin}/api/partners/${encodeURIComponent(p.slug)}/logo` : '',
    whatsapp:  p.whatsapp  || '',
    instagram: p.instagram || '',
    web:       p.web       || ''
  };
}
```

- [ ] **Step 2: Agregar las rutas**

En el `fetch` del worker, justo **antes** del bloque `if (path === '/site/config' && method === 'GET')`:

```js
      // ── Marca pública de una pieza (invitación / fiesta / entrega) ─────────
      if (path === '/brand' && method === 'GET') {
        const bScope = url.searchParams.get('scope') || '';
        const bId    = url.searchParams.get('id')    || '';
        const bPid   = await resolvePartnerId(env.KUERRE_DB, bScope, bId);
        const brand  = await partnerPublic(env.KUERRE_DB, bPid, url.origin);
        return new Response(JSON.stringify(brand), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=300'
          }
        });
      }

      // ── Logo del partner desde R2 ─────────────────────────────────────────
      const partnerLogoMatch = path.match(/^\/api\/partners\/([a-z0-9-]{1,60})\/logo$/);
      if (partnerLogoMatch && method === 'GET') {
        const pRow = await env.KUERRE_DB.prepare('SELECT logo_key FROM partners WHERE slug = ?')
          .bind(partnerLogoMatch[1]).first();
        if (!pRow || !pRow.logo_key) return new Response('Not found', { status: 404 });
        const pObj = await env.MEDIA.get(pRow.logo_key);
        if (!pObj) return new Response('Not found', { status: 404 });
        return new Response(pObj.body, {
          headers: {
            'Content-Type': (pObj.httpMetadata && pObj.httpMetadata.contentType) || 'image/png',
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
            // Un SVG servido desde el origen del worker podría ejecutar script:
            // esta CSP lo neutraliza sin bloquear el render de la imagen.
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
```

- [ ] **Step 3: Levantar el worker en local y verificar los 4 casos**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/worker"
npx wrangler dev --local --port 8787
```

En otra terminal:

```bash
curl -s "http://127.0.0.1:8787/brand?scope=invite&id=no-existe"
curl -s "http://127.0.0.1:8787/brand?scope=fiesta&id="
curl -s "http://127.0.0.1:8787/brand?scope=chamuyo&id=x"
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:8787/api/partners/kuerre/logo"
```

Esperado: las tres primeras devuelven el JSON del partner `kuerre` (`nombre: "KUERRE"`, `logo_url: ""` porque todavía no hay logo cargado); ninguna devuelve 404 ni 500. La cuarta devuelve `404` (sin `logo_key` todavía).

- [ ] **Step 4: Verificar que resuelve un cliente real**

Elegir un cliente que tenga `invite_slug` cargado:

```bash
npx wrangler d1 execute kuerre-db --remote --command="SELECT id, invite_slug, fiesta_id, partner_id FROM solicitudes WHERE invite_slug IS NOT NULL AND invite_slug != '' LIMIT 3;"
```

Deployar y probar contra remoto (verificando antes el symlink del core):

```bash
ls -la node_modules/@crd/
npx wrangler deploy
curl -s "https://kuerre-worker.cristian-romero-digital.workers.dev/brand?scope=invite&id=<invite_slug_real>"
```

Esperado: JSON del partner `kuerre`. (Todavía no hay otro partner con qué contrastar: eso se prueba en la Task 4.)

- [ ] **Step 5: Matar los procesos huérfanos de wrangler dev**

```bash
taskkill //F //IM workerd.exe
```

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add worker/src/index.js
git commit -F - <<'EOF'
feat(marca-blanca): endpoint publico /brand y serve del logo del partner

/brand?scope=invite|fiesta|entrega&id= resuelve la marca subiendo desde la
pieza hasta el cliente. Nunca devuelve 404: sin match cae en el partner
kuerre. El logo se sirve desde R2 con nosniff y CSP para neutralizar SVG
con script.
EOF
```

---

## Task 3: ABM de partners en el worker + asignación al cliente

**Files:**
- Modify: `WEB KUERRE/worker/src/index.js` (rutas nuevas junto a las de `/solicitudes/...`, hoy línea ~1180; flag en `CORE_OPTIONS`, hoy línea ~660)

**Interfaces:**
- Consumes: `resolvePartnerId` / `partnerPublic` y la tabla `partners` (Tasks 1-2).
- Produces (los consume la Task 4 y la Task 5):
  - `GET /partners` (admin) → `[{ id, slug, nombre, slogan, logo_key, whatsapp, instagram, web, activo, created_at }]`
  - `POST /partners` (admin) body `{ nombre, slogan?, whatsapp?, instagram?, web? }` → `{ ok: true, id, slug }`
  - `PATCH /partners/{id}` (admin) body con cualquier subconjunto de `{ nombre, slogan, whatsapp, instagram, web, activo }` → `{ ok: true }`
  - `DELETE /partners/{id}` (admin) → `{ ok: true, reasignados: <n> }`; 400 sobre `kuerre`
  - `POST /partners/{id}/logo` (admin) body `{ content_type, data_base64 }` → `{ ok: true, logo_key }`
  - `PATCH /solicitudes/{id}/partner` (admin) body `{ partner_id }` → `{ ok: true }`
  - `CORE_OPTIONS.modules.partners = true`

- [ ] **Step 1: Agregar el helper de slug y el allowlist de logos**

Debajo de `partnerPublic`, en `WEB KUERRE/worker/src/index.js`:

```js
const PARTNER_LOGO_MIME = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg'
};

function partnerSlugify(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'partner';
}

// Devuelve un slug libre agregando -2, -3, ... si hace falta.
async function partnerFreeSlug(db, base) {
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const taken = await db.prepare('SELECT id FROM partners WHERE slug = ?').bind(slug).first();
    if (!taken) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}
```

- [ ] **Step 2: Agregar las rutas del ABM**

Justo antes de `const solicitudProcesadaMatch = ...` (hoy línea ~1181):

```js
      // ── Partners (marca blanca) — ABM admin ───────────────────────────────
      if (path === '/partners' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { results } = await env.KUERRE_DB.prepare(
          'SELECT id, slug, nombre, slogan, logo_key, whatsapp, instagram, web, activo, created_at FROM partners ORDER BY (id = \'kuerre\') DESC, nombre ASC'
        ).all();
        return json(results || []);
      }

      if (path === '/partners' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const nombre = String(b.nombre || '').trim();
        if (!nombre) return json({ error: 'nombre requerido' }, 400);
        const pid  = crypto.randomUUID();
        const slug = await partnerFreeSlug(env.KUERRE_DB, partnerSlugify(nombre));
        await env.KUERRE_DB.prepare(
          'INSERT INTO partners (id, slug, nombre, slogan, whatsapp, instagram, web) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(pid, slug, nombre, String(b.slogan || '').trim(), String(b.whatsapp || '').trim(),
               String(b.instagram || '').trim(), String(b.web || '').trim()).run();
        return json({ ok: true, id: pid, slug });
      }

      const partnerIdMatch = path.match(/^\/partners\/([A-Za-z0-9-]{1,64})$/);
      if (partnerIdMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const sets = [], vals = [];
        for (const col of ['nombre', 'slogan', 'whatsapp', 'instagram', 'web']) {
          if (b[col] !== undefined) { sets.push(`${col} = ?`); vals.push(String(b[col]).trim()); }
        }
        if (b.activo !== undefined) { sets.push('activo = ?'); vals.push(b.activo ? 1 : 0); }
        if (!sets.length) return json({ error: 'nada para actualizar' }, 400);
        vals.push(partnerIdMatch[1]);
        await env.KUERRE_DB.prepare(`UPDATE partners SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
        return json({ ok: true });
      }

      if (partnerIdMatch && method === 'DELETE') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const pid = partnerIdMatch[1];
        if (pid === PARTNER_DEFAULT) return json({ error: 'La marca propia no se puede borrar' }, 400);
        const row = await env.KUERRE_DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(pid).first();
        if (!row) return json({ error: 'Not found' }, 404);
        // Los clientes que apuntaban a este partner vuelven a la marca propia:
        // si quedaran colgados, sus piezas mostrarían una marca inexistente.
        const re = await env.KUERRE_DB.prepare(
          'UPDATE solicitudes SET partner_id = ? WHERE partner_id = ?'
        ).bind(PARTNER_DEFAULT, pid).run();
        await env.KUERRE_DB.prepare('DELETE FROM partners WHERE id = ?').bind(pid).run();
        if (row.logo_key) { try { await env.MEDIA.delete(row.logo_key); } catch (e) { console.log('logo delete:', e.message); } }
        return json({ ok: true, reasignados: (re.meta && re.meta.changes) || 0 });
      }

      const partnerLogoUpMatch = path.match(/^\/partners\/([A-Za-z0-9-]{1,64})\/logo$/);
      if (partnerLogoUpMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const b  = await request.json().catch(() => ({}));
        const ct = String(b.content_type || '').toLowerCase();
        const ext = PARTNER_LOGO_MIME[ct];
        // No se confía en lo que declara el browser: si no está en el allowlist, se rechaza.
        if (!ext) return json({ error: 'Formato no permitido: usar PNG, JPG, WEBP o SVG' }, 400);
        let bytes;
        try {
          bytes = Uint8Array.from(atob(String(b.data_base64 || '')), c => c.charCodeAt(0));
        } catch (e) { return json({ error: 'data_base64 inválido' }, 400); }
        if (!bytes.length || bytes.length > 2 * 1024 * 1024) return json({ error: 'El logo debe pesar menos de 2 MB' }, 400);
        const pid = partnerLogoUpMatch[1];
        const exists = await env.KUERRE_DB.prepare('SELECT id FROM partners WHERE id = ?').bind(pid).first();
        if (!exists) return json({ error: 'Not found' }, 404);
        const key = `partners/${pid}/logo.${ext}`;
        await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: ct } });
        await env.KUERRE_DB.prepare('UPDATE partners SET logo_key = ? WHERE id = ?').bind(key, pid).run();
        return json({ ok: true, logo_key: key });
      }

      const partnerAsignMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/partner$/);
      if (partnerAsignMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { partner_id } = await request.json().catch(() => ({}));
        const pid = String(partner_id || PARTNER_DEFAULT);
        const ok = await env.KUERRE_DB.prepare('SELECT id FROM partners WHERE id = ? AND activo = 1').bind(pid).first();
        if (!ok) return json({ error: 'Marca inexistente o inactiva' }, 400);
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET partner_id = ? WHERE id = ?')
          .bind(pid, partnerAsignMatch[1]).run();
        return json({ ok: true });
      }
```

- [ ] **Step 3: Prender el módulo en `CORE_OPTIONS`**

En el mismo archivo, en el objeto `CORE_OPTIONS` (hoy línea ~660), agregar la línea `partners: true,` después de `contratos: true,`:

```js
        modules: {
          qr_fiestas:   true,
          invitaciones: true,
          premiere:     true,
          contratos:    true,
          partners:     true,
          crclub:       false,
          presupuesto:  false,
          portfolio:    false,
        }
```

- [ ] **Step 4: Verificar que todo el ABM está detrás de auth**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/worker"
ls -la node_modules/@crd/
npx wrangler deploy
W=https://kuerre-worker.cristian-romero-digital.workers.dev
for m in "GET /partners" "POST /partners" "PATCH /partners/kuerre" "DELETE /partners/kuerre" "POST /partners/kuerre/logo"; do
  set -- $m; echo -n "$1 $2 -> "; curl -s -o /dev/null -w "%{http_code}\n" -X "$1" "$W$2"
done
```

Esperado: `401` en las cinco. Si alguna devuelve 200, falta el chequeo de `isAdmin`.

- [ ] **Step 5: Verificar el ciclo completo con un partner de prueba**

Obtener un JWT logueándose en el admin y copiando `localStorage.crd_admin_jwt` desde la consola del navegador. Con eso:

```bash
W=https://kuerre-worker.cristian-romero-digital.workers.dev
JWT=<pegar el token>
# alta
curl -s -X POST "$W/partners" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"nombre":"Estudio Prueba","slogan":"Momentos que quedan","whatsapp":"541100000000","instagram":"@estudioprueba","web":"https://estudioprueba.com.ar"}'
# listar
curl -s "$W/partners" -H "Authorization: Bearer $JWT"
```

Anotar el `id` devuelto. Luego asignarlo a un cliente de prueba y comprobar que `/brand` cambia:

```bash
PID=<id devuelto>
CID=<id de un cliente con invite_slug>
SLUG=<su invite_slug>
curl -s -X PATCH "$W/solicitudes/$CID/partner" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d "{\"partner_id\":\"$PID\"}"
curl -s "$W/brand?scope=invite&id=$SLUG"
```

Esperado: el último devuelve `{"nombre":"Estudio Prueba","slogan":"Momentos que quedan",...}`.

- [ ] **Step 6: Verificar el rechazo de formatos y el borrado seguro**

```bash
# formato no permitido
curl -s -X POST "$W/partners/$PID/logo" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{"content_type":"application/pdf","data_base64":"aGVsbG8="}'
# la marca propia no se borra
curl -s -X DELETE "$W/partners/kuerre" -H "Authorization: Bearer $JWT"
```

Esperado: `{"error":"Formato no permitido: usar PNG, JPG, WEBP o SVG"}` y `{"error":"La marca propia no se puede borrar"}`.

- [ ] **Step 7: Devolver el cliente de prueba a la marca propia**

```bash
curl -s -X PATCH "$W/solicitudes/$CID/partner" -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" -d '{"partner_id":"kuerre"}'
```

Dejar el partner "Estudio Prueba" creado: se usa para verificar las Tasks 4 a 9, y se borra en la Task 10.

- [ ] **Step 8: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add worker/src/index.js
git commit -F - <<'EOF'
feat(marca-blanca): ABM de partners y asignacion de marca al cliente

CRUD de partners detras del JWT de admin, upload de logo a R2 validado
contra allowlist de mime, y PATCH /solicitudes/:id/partner que valida que
la marca exista y este activa. Borrar un partner reasigna sus clientes a
la marca propia para no dejarlos apuntando a una marca inexistente.
EOF
```

---

## Task 4: Sección "Marcas" en el admin

**Files:**
- Modify: `CORE/src/admin.html` (sidebar ~línea 386, páginas, JS del ABM)
- Modify: `CORE/brands/kuerre/config.json` (patch 0: bump de versión)

**Interfaces:**
- Consumes: `GET/POST/PATCH/DELETE /partners`, `POST /partners/{id}/logo` (Task 3).
- Produces: `_partners` (array cacheado en memoria del admin) y `partnersLoad()`, que la Task 5 reutiliza para poblar el selector del modal de cliente.

- [ ] **Step 1: Agregar el ítem del sidebar**

En `CORE/src/admin.html`, después del bloque `CR Club` y **antes** de `<div class="nav-section-label">Sistema</div>`:

```html
      <div class="sidebar-item" data-module="partners" title="Marcas de estudios que revenden el combo: su logo y datos reemplazan a los tuyos en la invitación, el QR y la entrega" onclick="showPage('partners')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z"/></svg>
        Marcas
      </div>
```

- [ ] **Step 2: Agregar la página**

Después del cierre de `<div class="page" id="page-clientes" data-module="crclub">` (o de cualquier otra `.page`, al mismo nivel):

```html
      <div class="page" id="page-partners" data-module="partners">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
          <div style="font-size:11px;letter-spacing:2px;color:var(--gray2);text-transform:uppercase">Marcas <i class="tip" data-tip="Cada marca es un estudio que revende el combo. Asignás la marca a un cliente desde su ficha y sus 3 piezas salen con ese logo y esos datos.">?</i></div>
          <button class="btn-add" onclick="partnersNuevo()">+ Nueva marca</button>
        </div>
        <div id="partners-list" style="display:grid;gap:10px"></div>
      </div>

      <!-- Modal marca -->
      <div id="partner-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:1000;align-items:center;justify-content:center;padding:16px">
        <div style="background:var(--black3);border:1px solid rgba(255,255,255,0.08);max-width:460px;width:100%;max-height:90vh;overflow-y:auto;padding:28px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
            <div id="pm-title" style="font-size:16px;font-weight:500;color:var(--gold)">Nueva marca</div>
            <button onclick="document.getElementById('partner-modal').style.display='none'" style="background:none;border:none;color:var(--gray2);font-size:22px;cursor:pointer;line-height:1;padding:0 4px">×</button>
          </div>
          <div style="display:grid;gap:10px">
            <div><label style="font-size:9px;letter-spacing:1px;color:var(--gray2);display:block;margin-bottom:4px">Nombre</label>
              <input id="pm-nombre" type="text" placeholder="Estudio Lumen" style="width:100%;background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;border-radius:4px"></div>
            <div><label style="font-size:9px;letter-spacing:1px;color:var(--gray2);display:block;margin-bottom:4px">Slogan</label>
              <input id="pm-slogan" type="text" placeholder="Momentos que quedan" style="width:100%;background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;border-radius:4px"></div>
            <div><label style="font-size:9px;letter-spacing:1px;color:var(--gray2);display:block;margin-bottom:4px">WhatsApp</label>
              <input id="pm-whatsapp" type="text" placeholder="5491144445555" style="width:100%;background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;border-radius:4px"></div>
            <div><label style="font-size:9px;letter-spacing:1px;color:var(--gray2);display:block;margin-bottom:4px">Instagram</label>
              <input id="pm-instagram" type="text" placeholder="@estudiolumen" style="width:100%;background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;border-radius:4px"></div>
            <div><label style="font-size:9px;letter-spacing:1px;color:var(--gray2);display:block;margin-bottom:4px">Web</label>
              <input id="pm-web" type="text" placeholder="https://estudiolumen.com.ar" style="width:100%;background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:8px 10px;font-size:12px;font-family:inherit;outline:none;border-radius:4px"></div>
            <div><label style="font-size:9px;letter-spacing:1px;color:var(--gray2);display:block;margin-bottom:4px">Logo (PNG, JPG, WEBP o SVG — máx 2 MB)</label>
              <input id="pm-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" style="font-size:11px;color:var(--gray2)">
              <img id="pm-logo-preview" style="display:none;max-height:48px;margin-top:8px;background:#0006;padding:6px;border-radius:4px"></div>
          </div>
          <div id="pm-error" style="display:none;color:#e57373;font-size:11px;margin-top:10px"></div>
          <div style="display:flex;gap:8px;margin-top:18px">
            <button class="btn-add" onclick="partnersGuardar()">Guardar</button>
            <button class="btn-sm btn-sec" onclick="document.getElementById('partner-modal').style.display='none'">Cancelar</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 3: Agregar el JS del ABM**

Junto a las otras funciones de página del admin (por ejemplo después de `cmSaveContrato`):

```js
// ── MARCAS (partners) ────────────────────────────────────────────────────────
let _partners = [];
let _partnerEdit = null;

// [COMPARTIDA] La usa también el selector de marca del modal de cliente.
async function partnersLoad() {
  try {
    const r = await fetch(CLIENTES_WORKER + '/partners', { headers: { 'Authorization': 'Bearer ' + getAdminJWT() } });
    _partners = r.ok ? await r.json() : [];
  } catch(e) { _partners = []; }
  return _partners;
}

async function initPartnersPage() {
  await partnersLoad();
  const cont = document.getElementById('partners-list');
  if (!_partners.length) { cont.innerHTML = '<div style="color:var(--gray2);font-size:11px">Sin marcas cargadas.</div>'; return; }
  cont.innerHTML = _partners.map(function(p){
    const propia = p.id === 'kuerre';
    const logo = p.logo_key ? '<img src="' + CLIENTES_WORKER + '/api/partners/' + encodeURIComponent(p.slug) + '/logo?t=' + Date.now() + '" style="max-height:32px;max-width:90px;object-fit:contain">' : '<span style="font-size:10px;color:var(--gray2)">sin logo</span>';
    return '<div style="border:1px solid rgba(255,255,255,0.07);padding:14px 16px;display:flex;align-items:center;gap:14px">' +
      '<div style="width:90px;text-align:center">' + logo + '</div>' +
      '<div style="flex:1">' +
        '<div style="font-size:13px;color:var(--white)">' + escHtml(p.nombre) + (propia ? ' <span style="font-size:9px;color:var(--gold);letter-spacing:1px">· MARCA PROPIA</span>' : '') + '</div>' +
        '<div style="font-size:10px;color:var(--gray2);margin-top:3px">' + escHtml(p.slogan || '—') + '</div>' +
      '</div>' +
      '<button class="btn-sm btn-edit" onclick="partnersEditar(\'' + p.id + '\')">Editar</button>' +
      (propia ? '' : '<button class="btn-sm btn-danger" onclick="partnersBorrar(\'' + p.id + '\')">Borrar</button>') +
    '</div>';
  }).join('');
}

function partnersNuevo() {
  _partnerEdit = null;
  document.getElementById('pm-title').textContent = 'Nueva marca';
  ['nombre','slogan','whatsapp','instagram','web'].forEach(function(k){ document.getElementById('pm-' + k).value = ''; });
  document.getElementById('pm-logo-file').value = '';
  document.getElementById('pm-logo-preview').style.display = 'none';
  document.getElementById('pm-error').style.display = 'none';
  document.getElementById('partner-modal').style.display = 'flex';
}

function partnersEditar(id) {
  const p = _partners.find(function(x){ return x.id === id; });
  if (!p) return;
  _partnerEdit = p;
  document.getElementById('pm-title').textContent = p.nombre;
  document.getElementById('pm-nombre').value    = p.nombre    || '';
  document.getElementById('pm-slogan').value    = p.slogan    || '';
  document.getElementById('pm-whatsapp').value  = p.whatsapp  || '';
  document.getElementById('pm-instagram').value = p.instagram || '';
  document.getElementById('pm-web').value       = p.web       || '';
  document.getElementById('pm-logo-file').value = '';
  const prev = document.getElementById('pm-logo-preview');
  if (p.logo_key) { prev.src = CLIENTES_WORKER + '/api/partners/' + encodeURIComponent(p.slug) + '/logo?t=' + Date.now(); prev.style.display = 'block'; }
  else prev.style.display = 'none';
  document.getElementById('pm-error').style.display = 'none';
  document.getElementById('partner-modal').style.display = 'flex';
}

async function partnersGuardar() {
  const err = document.getElementById('pm-error');
  err.style.display = 'none';
  const body = {
    nombre:    document.getElementById('pm-nombre').value.trim(),
    slogan:    document.getElementById('pm-slogan').value.trim(),
    whatsapp:  document.getElementById('pm-whatsapp').value.trim(),
    instagram: document.getElementById('pm-instagram').value.trim(),
    web:       document.getElementById('pm-web').value.trim()
  };
  if (!body.nombre) { err.textContent = 'El nombre es obligatorio'; err.style.display = 'block'; return; }
  const hdrs = { 'Authorization': 'Bearer ' + getAdminJWT(), 'Content-Type': 'application/json' };
  let id = _partnerEdit ? _partnerEdit.id : '';
  try {
    if (id) {
      await fetch(CLIENTES_WORKER + '/partners/' + id, { method: 'PATCH', headers: hdrs, body: JSON.stringify(body) });
    } else {
      const r = await fetch(CLIENTES_WORKER + '/partners', { method: 'POST', headers: hdrs, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.ok) { err.textContent = d.error || 'No se pudo crear'; err.style.display = 'block'; return; }
      id = d.id;
    }
    const file = document.getElementById('pm-logo-file').files[0];
    if (file) {
      const dataUri = await new Promise(function(res, rej){
        const fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(file);
      });
      const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUri);
      if (!m) { err.textContent = 'No se pudo leer el archivo'; err.style.display = 'block'; return; }
      const lr = await fetch(CLIENTES_WORKER + '/partners/' + id + '/logo', {
        method: 'POST', headers: hdrs, body: JSON.stringify({ content_type: m[1], data_base64: m[2] })
      });
      const ld = await lr.json();
      if (!ld.ok) { err.textContent = ld.error || 'No se pudo subir el logo'; err.style.display = 'block'; return; }
    }
  } catch(e) { err.textContent = 'Error de conexión'; err.style.display = 'block'; return; }
  document.getElementById('partner-modal').style.display = 'none';
  toast('Marca guardada');
  initPartnersPage();
}

async function partnersBorrar(id) {
  const p = _partners.find(function(x){ return x.id === id; });
  if (!p) return;
  if (!confirm('¿Borrar la marca "' + p.nombre + '"? Los clientes que la tengan asignada vuelven a tu marca propia.')) return;
  try {
    const r = await fetch(CLIENTES_WORKER + '/partners/' + id, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + getAdminJWT() } });
    const d = await r.json();
    if (!d.ok) { toast(d.error || 'No se pudo borrar'); return; }
    toast(d.reasignados ? d.reasignados + ' cliente(s) volvieron a tu marca' : 'Marca borrada');
  } catch(e) { toast('Error de conexión'); return; }
  initPartnersPage();
}
```

Helpers ya verificados en el CORE: `escHtml(s)` (línea ~6806), `toast(msg, type)` (~3897) y `CLIENTES_WORKER` (~3906, lo completa el patch de marca). **`escAttr` no existe en este admin** — por eso los `id` van sin escapar: son UUID o `kuerre`, charset `[A-Za-z0-9-]` generado server-side. No escribir `escAttr(...)` en ningún lado.

- [ ] **Step 4: Enganchar la carga al abrir la página**

`showPage(id)` está en `CORE/src/admin.html` línea ~4446. Dos cambios adentro:

1. En el objeto `titles`, agregar `partners:'Marcas'` (si no, el topbar muestra el id crudo).
2. Junto a las otras líneas `if (id === '...')`, agregar:

```js
  if (id === 'partners') initPartnersPage();
```

- [ ] **Step 5: Bump de versión y build**

- En `CORE/src/admin.html`, cambiar el `V1.90` del footer del sidebar por `V1.91`.
- En `CORE/brands/kuerre/config.json`, patch 0: `"replace": ">V1.85<"`.
- No tocar `CORE/brands/crp/config.json`: CRP no se deploya en este plan.

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
node build-admin.cjs kuerre
```

Esperado: build sin errores. Si tira `Patch not found`, es porque un patch de marca matcheaba HTML que se movió: regenerar ese `find` desde el CORE actual antes de seguir.

- [ ] **Step 6: Verificar que los patches de CRP siguen aplicando (sin deployar CRP)**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
node build-admin.cjs crp && echo "PATCHES CRP OK"
cd "e:/CLAUDE/KUERRE SISTEMA/WEB CRP" && git checkout -- Productivo/admin.html Desarrollo/admin.html 2>/dev/null; git status --short
```

Esperado: `PATCHES CRP OK` y, después del `checkout`, `git status` limpio en WEB CRP. Si el build de CRP falla, arreglar el patch antes de continuar: el CORE es compartido y no se puede dejar roto.

- [ ] **Step 7: Verificar la sección en el navegador**

Abrir `WEB KUERRE/Productivo/admin.html` (o la URL del admin ya deployado tras la Task 10), loguearse y comprobar:
1. Aparece "Marcas" en el sidebar y lista la marca propia KUERRE más "Estudio Prueba" (creado en la Task 3).
2. "+ Nueva marca" abre el modal; guardar con nombre vacío muestra "El nombre es obligatorio".
3. Editar "Estudio Prueba", subir un PNG y guardar: al reabrir, se ve el logo en la lista.
4. En la consola del navegador no hay errores rojos.

- [ ] **Step 8: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
git add src/admin.html brands/kuerre/config.json
git commit -F - <<'EOF'
feat(marca-blanca): seccion Marcas en el admin (CORE V1.91 / Kuerre V1.85)

ABM de marcas de estudios revendedores con upload de logo. Va detras de
data-module="partners", que solo esta prendido en el worker de Kuerre:
el admin de CRP no la muestra.
EOF
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Productivo/admin.html Desarrollo/admin.html
git commit -F - <<'EOF'
build(admin): rebuild con la seccion Marcas (V1.85)
EOF
```

---

## Task 5: Selector de marca en el modal de cliente

**Files:**
- Modify: `CORE/src/admin.html` (header del modal de cliente ~línea 2734, `cmOpen` ~línea 4053, funciones nuevas)
- Modify: `CORE/brands/kuerre/config.json` (patch 0: bump)

**Interfaces:**
- Consumes: `partnersLoad()` y `_partners` (Task 4); `PATCH /solicitudes/{id}/partner` (Task 3); `_clienteActual` y `_clientes`, que ya existen en el admin.
- Produces: nada que consuman tareas posteriores.

- [ ] **Step 1: Agregar el selector al header del modal**

En `CORE/src/admin.html`, dentro del `<div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">` que contiene `cm-codigo-contrato`, agregar como último hijo (después del `<span>` de "Guardar al salir del campo"):

```html
              <select id="cm-partner" data-module="partners" title="Marca que ven los invitados en la invitación, el QR y la entrega de este cliente"
                style="background:var(--black2);border:1px solid rgba(255,255,255,0.08);color:var(--white);padding:6px 10px;font-size:11px;outline:none;font-family:inherit;border-radius:4px"
                onchange="cmSavePartner()"></select>
```

- [ ] **Step 2: Poblar el selector al abrir el modal**

En `cmOpen` (donde hoy está `document.getElementById('cm-codigo-contrato').value = s.codigo_contrato || '';`), agregar inmediatamente después:

```js
  cmRenderPartners(s.partner_id || 'kuerre');
```

Y agregar las dos funciones junto a `cmSaveContrato`:

```js
async function cmRenderPartners(seleccionado) {
  const sel = document.getElementById('cm-partner');
  if (!sel) return;
  const list = _partners.length ? _partners : await partnersLoad();
  sel.innerHTML = list.filter(function(p){ return p.activo !== 0 || p.id === seleccionado; })
    .map(function(p){
      return '<option value="' + p.id + '"' + (p.id === seleccionado ? ' selected' : '') + '>' + escHtml(p.nombre) + '</option>';
    }).join('');
}

function cmSavePartner() {
  if (!_clienteActual) return;
  const pid = document.getElementById('cm-partner').value;
  if (pid === (_clienteActual.partner_id || 'kuerre')) return;
  fetch(CLIENTES_WORKER + '/solicitudes/' + _clienteActual.id + '/partner', {
    method: 'PATCH',
    headers: { 'Authorization': 'Bearer ' + getAdminJWT(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ partner_id: pid })
  }).then(function(r){ return r.json(); }).then(function(d){
    if (!d.ok) { toast(d.error || 'No se pudo cambiar la marca'); cmRenderPartners(_clienteActual.partner_id || 'kuerre'); return; }
    _clienteActual.partner_id = pid;
    const idx = _clientes.findIndex(function(x){ return x.id === _clienteActual.id; });
    if (idx !== -1) _clientes[idx].partner_id = pid;
    toast('Marca actualizada');
  }).catch(function(){ toast('Error de conexión'); });
}
```

`partner_id` ya llega solo al admin: `handleSolicitudesList` hace `SELECT s.*` y el GET individual devuelve todas las columnas sin whitelist. No hay que tocar el worker.

- [ ] **Step 3: Bump de versión y build**

- `CORE/src/admin.html`: `V1.91` → `V1.92`.
- `CORE/brands/kuerre/config.json` patch 0: `">V1.86<"`.

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
node build-admin.cjs kuerre
node build-admin.cjs crp && echo "PATCHES CRP OK"
cd "e:/CLAUDE/KUERRE SISTEMA/WEB CRP" && git checkout -- Productivo/admin.html Desarrollo/admin.html 2>/dev/null; git status --short
```

- [ ] **Step 4: Verificar en el navegador**

Abrir el admin, sección Clientes, abrir un cliente:
1. El selector muestra "KUERRE" seleccionado.
2. Cambiarlo a "Estudio Prueba" → toast "Marca actualizada".
3. Cerrar y reabrir el cliente → sigue en "Estudio Prueba".
4. Verificar desde afuera que quedó guardado:

```bash
curl -s "https://kuerre-worker.cristian-romero-digital.workers.dev/brand?scope=invite&id=<invite_slug_de_ese_cliente>"
```

Esperado: `{"nombre":"Estudio Prueba",...}`. **Dejarlo asignado**: las Tasks 6-9 lo usan para verificar las páginas.

- [ ] **Step 5: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/CORE"
git add src/admin.html brands/kuerre/config.json
git commit -F - <<'EOF'
feat(marca-blanca): selector de marca en el modal de cliente (V1.86)

Un solo clic por cliente asigna la marca; las 3 piezas la heredan sin
regenerar links.
EOF
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Productivo/admin.html Desarrollo/admin.html
git commit -F - <<'EOF'
build(admin): rebuild con el selector de marca (V1.86)
EOF
```

---

## Task 6: Branding dinámico en `fiestas.html` (QR Fiestas)

**Files:**
- Modify: `WEB KUERRE/Desarrollo/fiestas.html`

**Interfaces:**
- Consumes: `GET /brand?scope=fiesta&id=<EVENT_ID>` (Task 2).
- Produces: el snippet `loadBrand()` + `applyBrand()` que las Tasks 7, 8 y 9 copian **literalmente**.

- [ ] **Step 1: Marcar los nodos de marca**

En `WEB KUERRE/Desarrollo/fiestas.html`, reemplazar el texto hardcodeado por nodos marcados:

| Línea (aprox.) | Antes | Después |
|---|---|---|
| 204 | `<div class="msg-sub">KUERRE</div>` | `<div class="msg-sub" data-brand="nombre">KUERRE</div>` |
| 207 | `<div id="top-brand">KUERRE</div>` | `<div id="top-brand" data-brand="nombre">KUERRE</div>` |
| 216 | `<div class="hero-brand">KUERRE</div>` | `<div class="hero-brand" data-brand="nombre">KUERRE</div>` |
| 247 | `...>KUERRE</div>` (línea itálica del bloque `tv-brand`) | agregar `data-brand="nombre"` al `<div>` |
| 248 | `...>KUERRE</div>` (línea con `letter-spacing:.4em`) | agregar `data-brand="slogan"` al `<div>` |
| 283 | `<a id="logo-float" class="sfloat-btn" href="https://cristianromeroKUERRE.com.ar" target="_blank">` | `<a id="logo-float" class="sfloat-btn" href="#" target="_blank" rel="noopener">` — **sin** `data-brand`: su visibilidad depende del logo, no de la web; el `href` se setea en el Step 3 |
| 286 | `<a id="ig-float" class="sfloat-btn" href="https://www.instagram.com/cristian.romero.KUERRE" target="_blank">` | `<a id="ig-float" class="sfloat-btn" href="#" data-brand="ig" target="_blank" rel="noopener">` |

La línea 283 tenía un dominio roto (`cristianromeroKUERRE.com.ar`, artefacto del rename CRD→KUERRE); queda resuelto al pasar a `data-brand="web"`.

También agregar `data-brand="logo"` a las dos `<img>` de logo: `id="tv-logo"` (línea ~246) e `id="logo-float-img"` (dentro del `<a id="logo-float">`).

- [ ] **Step 2: Agregar el snippet de marca**

Después de la línea `const EVENT_ID = params.get('e') || '';` (línea ~356):

```js
// ── Marca (white-label) ─────────────────────────────────────────────────────
// Copiado igual en invite.html, invite-social.html, entrega.html y premiere.html.
function brandIgUrl(v) { return /^https?:/.test(v) ? v : 'https://www.instagram.com/' + String(v).replace(/^@/, ''); }

async function loadBrand(scope, id) {
  const fallback = { nombre: 'KUERRE', slogan: '', logo_url: '', whatsapp: '', instagram: '', web: 'https://kuerre.com.ar' };
  try {
    const r = await fetch(WORKER_URL + '/brand?scope=' + scope + '&id=' + encodeURIComponent(id || ''));
    if (!r.ok) throw new Error('brand ' + r.status);
    return Object.assign(fallback, await r.json());
  } catch (e) { return fallback; }
}

function applyBrand(b) {
  document.querySelectorAll('[data-brand]').forEach(function (el) {
    const k = el.getAttribute('data-brand');
    if (k === 'nombre') { el.textContent = b.nombre; return; }
    if (k === 'slogan') { if (b.slogan) el.textContent = b.slogan; else el.style.display = 'none'; return; }
    if (k === 'logo')   { if (b.logo_url) { el.src = b.logo_url; el.style.display = ''; } else el.style.display = 'none'; return; }
    // Ojo: varios de estos anchors arrancan con display:none inline, así que
    // cuando el dato existe hay que mostrarlos explícitamente.
    if (k === 'web')    { if (b.web) { el.href = b.web; el.style.display = ''; } else el.style.display = 'none'; return; }
    if (k === 'ig')     { if (b.instagram) { el.href = brandIgUrl(b.instagram); el.style.display = ''; } else el.style.display = 'none'; return; }
    if (k === 'wa')     { if (b.whatsapp) { el.href = 'https://wa.me/' + b.whatsapp.replace(/\D/g, ''); el.style.display = ''; } else el.style.display = 'none'; return; }
  });
}
```

- [ ] **Step 3: Reemplazar la carga de branding vieja**

Borrar la línea ~363 completa (el `fetch(... '/site/config' ...).then(...).then(function(d){ settings = ... applyBranding(); })`) y la función `applyBranding()` (líneas ~413-427), y en su lugar, al final del `init()` de la página (o inmediatamente después de definir `EVENT_ID` si `init` no existe con ese nombre), agregar:

```js
loadBrand('fiesta', EVENT_ID).then(function (b) {
  applyBrand(b);
  const tvb = document.getElementById('tv-brand');
  const lf  = document.getElementById('logo-float');
  if (b.logo_url) {
    if (tvb) tvb.style.display = 'block';
    if (lf)  { lf.href = b.web || '#'; lf.style.display = 'flex'; }
  } else if (lf) {
    lf.style.display = 'none';
  }
});
```

`#tv-brand` y `#logo-float` arrancan ocultos por CSS inline y sólo se muestran si hay logo — ese comportamiento no cambia.

- [ ] **Step 4: Verificar que no quedó marca hardcodeada visible**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/Desarrollo"
grep -n "cristianromero\|>KUERRE<\|instagram.com/cristian" fiestas.html
```

Esperado: sólo aparecen `>KUERRE<` como contenido inicial de nodos que ya tienen `data-brand="nombre"` (queda como fallback si el fetch falla). Ninguna URL con `cristianromero`.

- [ ] **Step 5: Probar en el navegador**

Servir la carpeta y abrir la galería del cliente de prueba (el que quedó con "Estudio Prueba" en la Task 5):

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/Desarrollo" && npx serve -l 5000 .
```

Abrir `http://localhost:5000/fiestas.html?e=<fiesta_id_del_cliente_de_prueba>`:
1. El hero y el top muestran "Estudio Prueba".
2. El botón de Instagram flotante apunta a `instagram.com/estudioprueba`.
3. Abrir un evento de un cliente **sin** marca asignada: dice "KUERRE" y apunta a los datos propios.
4. En modo TV (`&tv=1`) la segunda línea del bloque de marca muestra el slogan del partner.
5. Consola sin errores.

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Desarrollo/fiestas.html
git commit -F - <<'EOF'
feat(marca-blanca): QR Fiestas toma la marca del cliente

Reemplaza el fetch a /site/config por /brand?scope=fiesta y pinta nombre,
slogan, logo, web e Instagram del partner. De paso arregla el link roto
cristianromeroKUERRE.com.ar que habia quedado del rename CRD->KUERRE.
EOF
```

---

## Task 7: Branding dinámico en `entrega.html`

**Files:**
- Modify: `WEB KUERRE/Desarrollo/entrega.html`

**Interfaces:**
- Consumes: `GET /brand?scope=entrega&id=<EVENT_FOLDER>` (Task 2); el snippet de la Task 6.

- [ ] **Step 1: Marcar los nodos**

| Línea (aprox.) | Cambio |
|---|---|
| 251 | `<div id="hero-brand" class="hero-brand">KUERRE · Fotografía</div>` → `<div id="hero-brand" class="hero-brand"><span data-brand="nombre">KUERRE</span><span id="hero-brand-sep"> · </span><span data-brand="slogan">Fotografía</span></div>` |
| 373 | `<div id="footer-brand" class="footer-brand">KUERRE</div>` → agregar `data-brand="nombre"` |
| 374 | `<div class="footer-tagline">Fotografía & Video de Eventos</div>` → agregar `data-brand="slogan"` |
| 375 | `<a id="footer-wsp" ...>` → agregar `data-brand="wa"` |
| 389 | `<a id="wsp-float" ...>` → agregar `data-brand="wa"` |
| 383, 386 | `<a id="web-float">` → agregar `data-brand="web"`; `<a id="ig-float">` → agregar `data-brand="ig"` (`#web-float` arranca con `display:none` inline: `applyBrand` lo muestra cuando hay web) |
| 258 | La `<img id="hero-logo">` **no** se marca con `data-brand`: el logo del hero lo pinta `applyLogo(src, filter)` (línea ~526), que además maneja el `#hero-logo-seal`. Se llama desde el callback del Step 3 |

- [ ] **Step 2: Eliminar el número y el nombre hardcodeados**

- Línea ~365: el botón de pedido de álbum. Reemplazar el `<a href="https://wa.me/5491162557763?text=...">` por un `<a id="album-wsp" ...>` **sin** `href` fijo, y armar el href en JS con el número y el nombre del partner:

```js
function applyAlbumWsp(b) {
  const a = document.getElementById('album-wsp');
  if (!a) return;
  if (!b.whatsapp) { a.style.display = 'none'; return; }
  const texto = 'Hola ' + b.nombre + ', quiero consultar sobre mi pedido de álbum';
  a.href = 'https://wa.me/' + b.whatsapp.replace(/\D/g, '') + '?text=' + encodeURIComponent(texto);
}
```

- Línea ~406: borrar `WSP_NUM: '5491162557763',` de `CONFIG` y la línea ~412 `const WSP_NUM = CONFIG.WSP_NUM;`. Buscar todos los usos y reemplazarlos por el dato del partner:

```bash
grep -n "WSP_NUM" Desarrollo/entrega.html
```

No debe quedar ninguno.

- [ ] **Step 3: Agregar el snippet y la llamada**

Copiar **literalmente** el bloque `brandIgUrl` / `loadBrand` / `applyBrand` de la Task 6, usando `CF_URL` como base en vez de `WORKER_URL` (en esta página la constante se llama así — verificar con `grep -n "CF_URL:" Desarrollo/entrega.html`).

Dentro de `init()`, reemplazar el bloque `fetchSett.then(raw => { ... })` (líneas ~588-605) por:

```js
  loadBrand('entrega', CFG.folderId).then(function (b) {
    applyBrand(b);
    applyAlbumWsp(b);
    if (b.logo_url) applyLogo(b.logo_url, '');
    const sep = document.getElementById('hero-brand-sep');
    if (sep) sep.style.display = b.slogan ? '' : 'none';
    document.getElementById('page-title').textContent = CFG.nombres + ' — ' + b.nombre;
    document.getElementById('footer-copy').textContent = '© ' + new Date().getFullYear() + ' ' + b.nombre + ' · Todos los derechos reservados';
  });
```

Y borrar de `applyConfig()` las dos líneas que hoy hardcodean lo mismo (línea ~636 `document.getElementById('page-title').textContent = CFG.nombres + ' — KUERRE';` y línea ~644 el `footer-copy` con `KUERRE`), para que no pisen lo anterior.

- [ ] **Step 4: Verificar que no quedó nada hardcodeado**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/Desarrollo"
grep -n "5491162557763\|WSP_NUM\|Hola Cristian" entrega.html
```

Esperado: sin resultados.

- [ ] **Step 5: Probar en el navegador**

Con `npx serve -l 5000 .` abrir `http://localhost:5000/entrega.html?folder=<folder_del_cliente_de_prueba>&nombres=Test`:
1. Hero: "Estudio Prueba · Momentos que quedan".
2. Título de la pestaña: "Test — Estudio Prueba".
3. Footer, WhatsApp flotante y botón de álbum apuntan al número del partner, con el texto "Hola Estudio Prueba, ...".
4. Editar el partner desde el admin dejando el slogan vacío y recargar: el hero muestra sólo "Estudio Prueba", sin el `·` colgando. Volver a poner el slogan.
5. Con un folder de un cliente sin marca: todo dice KUERRE, igual que antes.

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Desarrollo/entrega.html
git commit -F - <<'EOF'
feat(marca-blanca): entrega toma la marca del cliente

Titulo, hero, footer, logo y los tres botones de contacto salen del
partner. Elimina el numero de Cristian hardcodeado (CONFIG.WSP_NUM y el
boton de pedido de album, que ademas llevaba su nombre en el mensaje).
EOF
```

---

## Task 8: Branding dinámico en `premiere.html`

**Files:**
- Modify: `WEB KUERRE/Desarrollo/premiere.html`

**Interfaces:**
- Consumes: `GET /brand?scope=entrega&id=<folder>` (Task 2) — Premiere es la misma pieza que la entrega, así que usa el mismo scope; el snippet de la Task 6.

- [ ] **Step 1: Marcar los nodos**

| Línea (aprox.) | Cambio |
|---|---|
| 413 | `<span class="nav-logo">KUERRE</span>` → agregar `data-brand="nombre"` |
| 445 | `<a class="sfloat-btn" id="pm-logo-btn" href="https://KUERRE.com.ar" ...>` → `href="#"` + `data-brand="web"`; la `<img id="hero-logo-img">` interna → `data-brand="logo"` |
| 449 | `<a class="sfloat-btn" id="wsp-float" href="https://wa.me/5491162557763" ...>` → `href="#"` + `data-brand="wa"` |
| 459 | `<p class="footer-title">KUERRE</p>` → agregar `data-brand="nombre"` |
| 460 | `<p class="footer-tagline">Fotografía &amp; Video de Eventos · Buenos Aires</p>` → agregar `data-brand="slogan"` |
| 461 | `<a id="footer-wsp" href="https://wa.me/5491162557763" ...>` → `href="#"` + `data-brand="wa"` |
| 471 | `<span class="welcome-brand">KUERRE</span>` → agregar `data-brand="nombre"` |
| 565 | `<div class="vm-meta" id="vm-meta">Video · KUERRE</div>` → dejar el nodo y setear su texto en JS con `'Video · ' + b.nombre` |

- [ ] **Step 2: Eliminar el número hardcodeado**

Borrar `WSP_NUM: '5491162557763',` de `CONFIG` (línea ~584) y el bloque de las líneas ~913-915 que arma `wspUrl` con `CONFIG.WSP_NUM`. Verificar:

```bash
grep -n "5491162557763\|WSP_NUM" Desarrollo/premiere.html
```

Esperado: sin resultados.

- [ ] **Step 3: Agregar el snippet y la llamada**

Copiar **literalmente** el bloque `brandIgUrl` / `loadBrand` / `applyBrand` de la Task 6 (base: `CONFIG.CF_URL`). Reemplazar el bloque que hoy lee `s.waSuffix` (líneas ~786-790) por:

```js
  loadBrand('entrega', CFG.folderId).then(function (b) {
    applyBrand(b);
    const vm = document.getElementById('vm-meta');
    if (vm) vm.textContent = 'Video · ' + b.nombre;
    document.getElementById('page-title').textContent = (CFG.nombres || 'Premiere') + ' — ' + b.nombre;
    const fc = document.getElementById('footer-copy');
    if (fc) fc.textContent = '© ' + new Date().getFullYear() + ' ' + b.nombre;
  });
```

Borrar las líneas ~882 y ~919 que hoy hardcodean el `page-title` y el `footer-copy` con `KUERRE`.

- [ ] **Step 4: Probar en el navegador**

`http://localhost:5000/premiere.html?folder=<folder_del_cliente_de_prueba>&nombres=Test`:
1. Nav, footer, welcome y título de pestaña dicen "Estudio Prueba".
2. El tagline del footer muestra el slogan del partner.
3. Los dos botones de WhatsApp apuntan al número del partner.
4. Premiere no tiene botón de Instagram y **no se le agrega** (constraint del spec).
5. Consola sin errores.

- [ ] **Step 5: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Desarrollo/premiere.html
git commit -F - <<'EOF'
feat(marca-blanca): premiere toma la marca del cliente

Nav, hero, footer, welcome, logo y los dos botones de WhatsApp salen del
partner. Elimina wa.me/5491162557763 hardcodeado en el HTML y CONFIG.
EOF
```

---

## Task 9: Branding dinámico en `invite.html` e `invite-social.html`

**Files:**
- Modify: `WEB KUERRE/Desarrollo/invite.html`, `WEB KUERRE/Desarrollo/invite-social.html`

**Interfaces:**
- Consumes: `GET /brand?scope=invite&id=<slug>` (Task 2); el snippet de la Task 6.

- [ ] **Step 1: `invite.html` — marcar el footer**

Línea ~468: reemplazar el `<small>` por:

```html
  <small>Invitación digital · <a id="invite-footer-web" data-brand="web" href="#" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;text-underline-offset:3px"><span data-brand="nombre">KUERRE</span></a> · <a id="invite-footer-ig" data-brand="ig" href="#" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;text-underline-offset:3px">@KUERRE.com.ar</a></small>
```

El texto visible del link de Instagram lo setea el JS (paso 3), porque `applyBrand` sólo toca el `href` de los nodos `ig`.

- [ ] **Step 2: `invite.html` — logo del footer**

Línea ~1409: `const logoSrc = cfg.logo_dark || localStorage.getItem('KUERRE_site_logo');`. El logo de la invitación puede venir del diseño de la invitación (`cfg.logo_dark`), que tiene prioridad. Dejarlo, pero cambiar el fallback: en vez de leer `localStorage`, usar el logo de la marca.

- [ ] **Step 3: `invite.html` — reemplazar la carga de branding**

Copiar **literalmente** el bloque `brandIgUrl` / `loadBrand` / `applyBrand` de la Task 6 (base: `CF_URL_INV`, verificar el nombre con `grep -n "CF_URL_INV" Desarrollo/invite.html`). Reemplazar el bloque `try { const sRes = await fetch(CF_URL_INV + '/KUERRE_settings...' ) ... } catch(e) {}` (líneas ~1421-1437) por:

```js
  const _brand = await loadBrand('invite', new URLSearchParams(location.search).get('i') || '');
  applyBrand(_brand);
  const _igEl = document.getElementById('invite-footer-ig');
  if (_igEl && _brand.instagram) {
    _igEl.textContent = '@' + brandIgUrl(_brand.instagram)
      .replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
  }
  if (!logoSrc && _brand.logo_url) {
    const _le = document.getElementById('footer-logo');
    if (_le) { _le.src = _brand.logo_url; _le.style.display = 'block'; }
  }
```

- [ ] **Step 4: `invite-social.html` — mismo tratamiento**

Esta página no tiene footer de marca hoy (`grep -n "KUERRE" Desarrollo/invite-social.html` sólo devuelve URLs del worker). Verificarlo:

```bash
grep -in "kuerre\|instagram\|footer-logo" Desarrollo/invite-social.html
```

Si sólo aparecen las dos URLs del worker (líneas ~382 y ~684), **no hay nada que cambiar**: dejar el archivo intacto y anotarlo en el commit. Si aparece algún nodo de marca visible, aplicarle el mismo tratamiento que a `invite.html` con `scope=invite`.

- [ ] **Step 5: Probar en el navegador**

`http://localhost:5000/invite.html?i=<slug_del_cliente_de_prueba>`:
1. El footer dice "Invitación digital · Estudio Prueba · @estudioprueba".
2. Los dos links abren la web y el IG del partner.
3. Con el slug de un cliente sin marca: dice KUERRE y los links propios.
4. Consola sin errores.

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Desarrollo/invite.html Desarrollo/invite-social.html
git commit -F - <<'EOF'
feat(marca-blanca): invitacion toma la marca del cliente

El footer resuelve nombre, web e Instagram por /brand?scope=invite en vez
de leer crd_settings. El logo del diseno de la invitacion sigue teniendo
prioridad sobre el de la marca.
EOF
```

---

## Task 10: Deploy y verificación en producción

**Files:**
- Modify: `WEB KUERRE/Productivo/*.html` (copias), `WEB KUERRE/.worktrees/gh-pages/*.html` (copias)

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Copiar Desarrollo → Productivo**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
for f in invite.html invite-social.html fiestas.html entrega.html premiere.html; do cp "Desarrollo/$f" "Productivo/$f"; done
for f in invite.html invite-social.html fiestas.html entrega.html premiere.html; do cmp -s "Desarrollo/$f" "Productivo/$f" && echo "$f OK" || echo "$f DIFIERE"; done
```

Esperado: los 5 en `OK`.

- [ ] **Step 2: Copiar a la worktree de gh-pages**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
for f in admin.html invite.html invite-social.html fiestas.html entrega.html premiere.html; do cp "Productivo/$f" ".worktrees/gh-pages/$f"; done
```

- [ ] **Step 3: Commit y push de las dos ramas**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE"
git add Productivo
git commit -F - <<'EOF'
build: copia a Productivo de las paginas con marca blanca
EOF
git push origin main
cd .worktrees/gh-pages
git add .
git commit -F - <<'EOF'
deploy: marca blanca por partner en admin, invitacion, QR y entrega
EOF
git push origin gh-pages
```

- [ ] **Step 4: Verificar en producción con el cliente de prueba**

Con el cliente todavía asignado a "Estudio Prueba":

```bash
W=https://kuerre-worker.cristian-romero-digital.workers.dev
curl -s "$W/brand?scope=invite&id=<slug>"
curl -s "$W/brand?scope=fiesta&id=<fiesta_id>"
curl -s "$W/brand?scope=entrega&id=<folder_id>"
curl -s "$W/brand?scope=invite&id=no-existe"
```

Esperado: las tres primeras devuelven "Estudio Prueba"; la cuarta, "KUERRE".

Y en el navegador, sobre `kuerre.com.ar`: abrir la invitación, la galería del QR y la entrega del cliente de prueba y confirmar que las tres muestran la marca del estudio.

- [ ] **Step 5: Verificar la no-regresión de los clientes propios**

Abrir la invitación, el QR y la entrega de **dos clientes reales sin marca asignada** y confirmar que se ven exactamente igual que antes: logo Kuerre, "KUERRE", WhatsApp `5491162557763`, Instagram e Instagram/web propios.

```bash
grep -rn "5491162557763" "e:/CLAUDE/KUERRE SISTEMA/WEB KUERRE/Productivo/"*.html
```

Esperado: sin resultados — el número ahora vive sólo en la fila `kuerre` de D1.

- [ ] **Step 6: Verificar que el admin de CRP no cambió**

```bash
cd "e:/CLAUDE/KUERRE SISTEMA/WEB CRP" && git status --short
```

Esperado: limpio. Si aparecen `Productivo/admin.html` o `Desarrollo/admin.html` modificados, hacer `git checkout --` sobre ellos: CRP no entra en este deploy.

- [ ] **Step 7: Limpiar el partner de prueba**

Desde el admin, sección Marcas → Borrar "Estudio Prueba". Confirmar que el toast dice que el cliente volvió a la marca propia y que su invitación vuelve a mostrar KUERRE.

- [ ] **Step 8: Verificación final del deploy**

```bash
curl -s "https://kuerre.com.ar/admin.html" | grep -o "V1\.[0-9]*" | head -1
```

Esperado: `V1.86`. Si devuelve una versión vieja, el push de `gh-pages` no propagó todavía: reintentar en un minuto antes de dar por cerrado.

---

## Notas de verificación cruzada con el spec

| Requisito del spec | Task |
|---|---|
| Tabla `partners` con los 5 campos + slogan | 1 |
| `solicitudes.partner_id` default `kuerre` | 1 |
| Kuerre sembrado como partner | 1 |
| `schema.sql` refleja el esquema | 1 |
| `GET /brand` con los 3 scopes y fallback sin 404 | 2 |
| Logo en R2 servido con nosniff y cache | 2 |
| ABM detrás del JWT, id server-side, sin `INSERT OR REPLACE` | 3 |
| Allowlist de mime en el upload | 3 |
| `PATCH /solicitudes/:id/partner` valida existencia y actividad | 3 |
| Sección Marcas detrás de `data-module="partners"` | 4 |
| Fila `kuerre` no borrable | 3 (worker) + 4 (UI) |
| Selector en el modal de cliente | 5 |
| Branding dinámico en las 5 páginas | 6, 7, 8, 9 |
| Slots de slogan en entrega, premiere y QR | 6, 7, 8 |
| Eliminación de los fallbacks hardcodeados | 7, 8 |
| Link roto `cristianromeroKUERRE.com.ar` | 6 |
| Cobertura de botones sin agregar nuevos | 6, 7, 8, 9 |
| CRP sin cambios | 4, 5, 10 |
| Verificación de no-regresión | 10 |
