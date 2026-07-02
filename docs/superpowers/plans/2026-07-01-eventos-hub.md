# Eventos Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una tabla `eventos` central en CRP y conectar las tablas existentes (`solicitudes`, `contratos`, `entrega_configs`, `eventos_foto`) mediante una columna `evento_slug` nullable, exponiendo CRUD + vista agregada en el worker y un panel hub en el admin CORE.

**Architecture:** Todos los cambios son **aditivos** — cero modificaciones a rutas/columnas/lógica existente. `evento_slug TEXT` se agrega como columna nullable con `ALTER TABLE`; los records existentes la tienen NULL y siguen funcionando igual. El hub expone 4 rutas nuevas bajo `/hub/*` en ambos workers. El admin CORE recibe una sección nueva "Eventos" con sidebar item, page div y JS propio.

**Tech Stack:** Cloudflare D1 (SQL), Cloudflare Workers (JS), Vanilla HTML/JS inline (CORE admin), wrangler CLI, Node.js (`build-admin.cjs`).

## Global Constraints

- NUNCA modificar rutas existentes ni columnas existentes — solo agregar.
- `evento_slug` es siempre nullable; la ausencia de valor no es un error.
- CRP usa `env.CRCLUB_DB`; Kuerre usa `env.KUERRE_DB` — no intercambiar.
- CORE admin: JS inline en el HTML, sin archivos `.js` separados.
- Autenticación admin: `getAdminJWT()` → header `Authorization: Bearer <token>`.
- Versión del admin: bump `V1.70` → `V1.71` en `config.json` de ambos brands (find+replace).
- Build CORE: `node e:\CLAUDE\CORE\build-admin.cjs` desde cualquier directorio.
- Deploy CRP worker: `npx wrangler deploy` desde `e:\CLAUDE\WEB CRP\worker\`.
- Deploy Kuerre worker: `npx wrangler deploy` desde `e:\CLAUDE\WEB KUERRE\worker\`.

---

### Task 1: DB Migrations

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\worker\schema.sql`
- Modify: `e:\CLAUDE\WEB KUERRE\worker\schema.sql`
- Live: ejecutar comandos contra `crclub-db` y `kuerre-db` vía wrangler

**Interfaces:**
- Produces: tabla `eventos` en `crclub-db` con misma estructura que la ya existente en `kuerre-db`; columna `evento_slug TEXT` en `solicitudes`, `contratos`, `entrega_configs`, `eventos_foto` en ambas DBs

---

- [ ] **Step 1: Agregar `evento_slug` a las CREATE TABLE en CRP `schema.sql`**

En `e:\CLAUDE\WEB CRP\worker\schema.sql`, agregar `evento_slug TEXT DEFAULT NULL` a cada tabla. Cambios exactos:

En `CREATE TABLE IF NOT EXISTS eventos_foto`, después de `moderacion  INTEGER DEFAULT 0,` → agregar:
```sql
  evento_slug TEXT DEFAULT NULL,
```

En `CREATE TABLE IF NOT EXISTS solicitudes`, después de `drive_invitacion_id TEXT DEFAULT '',` → agregar:
```sql
  evento_slug TEXT DEFAULT NULL,
```

En `CREATE TABLE IF NOT EXISTS entrega_configs`, después de `allow_dl   INTEGER DEFAULT 1,` → agregar:
```sql
  evento_slug TEXT DEFAULT NULL,
```

En `CREATE TABLE IF NOT EXISTS contratos`, después de `notas     TEXT DEFAULT '',` → agregar:
```sql
  evento_slug TEXT DEFAULT NULL,
```

Agregar el bloque de `eventos` al final del archivo (antes del EOF):
```sql

CREATE TABLE IF NOT EXISTS eventos (
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
```

- [ ] **Step 2: Agregar `evento_slug` a las CREATE TABLE en Kuerre `schema.sql`**

En `e:\CLAUDE\WEB KUERRE\worker\schema.sql`, `eventos` ya existe — no tocar. Solo agregar la columna `evento_slug` a las otras 4 tablas con el mismo patrón que en Step 1:

En `CREATE TABLE IF NOT EXISTS eventos_foto`, después de `moderacion  INTEGER DEFAULT 0,`:
```sql
  evento_slug TEXT DEFAULT NULL,
```

En `CREATE TABLE IF NOT EXISTS solicitudes`, después de `drive_entrega_id TEXT DEFAULT '',`:
```sql
  evento_slug TEXT DEFAULT NULL,
```

En `CREATE TABLE IF NOT EXISTS entrega_configs`, después de `allow_dl   INTEGER DEFAULT 1,`:
```sql
  evento_slug TEXT DEFAULT NULL,
```

Kuerre no tiene tabla `contratos` en su `schema.sql` (está manejada por `kuerre-db` pero sin definición en el archivo). No agregar nada para contratos en Kuerre por ahora.

- [ ] **Step 3: Ejecutar ALTER TABLE en `crclub-db` (CRP)**

Desde `e:\CLAUDE\WEB CRP\worker\`:
```powershell
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE solicitudes ADD COLUMN evento_slug TEXT"
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE contratos ADD COLUMN evento_slug TEXT"
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE entrega_configs ADD COLUMN evento_slug TEXT"
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE eventos_foto ADD COLUMN evento_slug TEXT"
npx wrangler d1 execute crclub-db --remote --command "CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, fecha TEXT NOT NULL, tipo TEXT NOT NULL DEFAULT 'casamiento', qr INTEGER NOT NULL DEFAULT 0, pm INTEGER NOT NULL DEFAULT 0, inv INTEGER NOT NULL DEFAULT 0, notas TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')))"
```

Verificar:
```powershell
npx wrangler d1 execute crclub-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```
Expected: aparece `eventos` en la lista.

- [ ] **Step 4: Ejecutar ALTER TABLE en `kuerre-db` (Kuerre)**

Desde `e:\CLAUDE\WEB KUERRE\worker\`:
```powershell
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE solicitudes ADD COLUMN evento_slug TEXT"
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE entrega_configs ADD COLUMN evento_slug TEXT"
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE eventos_foto ADD COLUMN evento_slug TEXT"
```

Verificar:
```powershell
npx wrangler d1 execute kuerre-db --remote --command "PRAGMA table_info(solicitudes)"
```
Expected: aparece columna `evento_slug` al final.

- [ ] **Step 5: Commit schema**

```powershell
git -C "e:\CLAUDE\WEB CRP" add worker/schema.sql
git -C "e:\CLAUDE\WEB CRP" commit -m "feat: add eventos hub table + evento_slug column to linked tables"
git -C "e:\CLAUDE\WEB KUERRE" add worker/schema.sql
git -C "e:\CLAUDE\WEB KUERRE" commit -m "feat: add evento_slug column to linked tables for eventos hub"
```

---

### Task 2: CRP Worker — Endpoints `/hub/*`

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\worker\src\index.js`

**Interfaces:**
- Consumes: `env.CRCLUB_DB` (D1), `isAdmin(request, env)` (from kuerre-core)
- Produces:
  - `GET /hub` → `[{id, slug, nombre, fecha, tipo, qr, pm, inv, notas, created_at}]`
  - `POST /hub` body `{slug, nombre, fecha, tipo?, qr?, pm?, inv?, notas?}` → `{ok:true}`
  - `GET /hub/:slug` → `{...evento, solicitudes:[], contratos:[], entregas:[], qr_eventos:[]}`
  - `POST /hub/:slug/link` body `{table, id}` → `{ok:true}`

---

- [ ] **Step 1: Agregar funciones handler en CRP worker**

En `e:\CLAUDE\WEB CRP\worker\src\index.js`, localizar el comentario `// ── Contratos ──` (línea ~1583) y agregar el bloque de handlers justo ANTES de ese comentario. El string de anclaje es la función `handleContratosList` que ya existe — agregar antes de `async function handleContratosList`:

```javascript
// ── Eventos Hub ──

async function handleHubList(env) {
  const { results } = await env.CRCLUB_DB.prepare('SELECT * FROM eventos ORDER BY fecha DESC').all();
  return json(results || []);
}

async function handleHubUpsert(request, env) {
  const d = await request.json();
  if (!d.slug || !d.nombre || !d.fecha) return json({ error: 'slug, nombre y fecha son requeridos' }, 400);
  await env.CRCLUB_DB.prepare(`
    INSERT INTO eventos (slug, nombre, fecha, tipo, qr, pm, inv, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      nombre=excluded.nombre, fecha=excluded.fecha, tipo=excluded.tipo,
      qr=excluded.qr, pm=excluded.pm, inv=excluded.inv, notas=excluded.notas
  `).bind(d.slug, d.nombre, d.fecha, d.tipo || 'casamiento', d.qr ? 1 : 0, d.pm ? 1 : 0, d.inv ? 1 : 0, d.notas || '').run();
  return json({ ok: true });
}

async function handleHubView(slug, env) {
  const evento = await env.CRCLUB_DB.prepare('SELECT * FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'not found' }, 404);
  const [sols, cts, ents, qrs] = await Promise.all([
    env.CRCLUB_DB.prepare('SELECT id, nombre_display, fecha, tipo FROM solicitudes WHERE evento_slug=?').bind(slug).all(),
    env.CRCLUB_DB.prepare('SELECT numero, tipo, cliente, fecha_ev, precio FROM contratos WHERE evento_slug=?').bind(slug).all(),
    env.CRCLUB_DB.prepare('SELECT id, nombres, fecha FROM entrega_configs WHERE evento_slug=?').bind(slug).all(),
    env.CRCLUB_DB.prepare('SELECT id, nombre, fecha FROM eventos_foto WHERE evento_slug=?').bind(slug).all(),
  ]);
  return json({ ...evento, solicitudes: sols.results || [], contratos: cts.results || [], entregas: ents.results || [], qr_eventos: qrs.results || [] });
}

async function handleHubLink(slug, request, env) {
  const { table, id } = await request.json();
  const pkCol = { solicitudes: 'id', contratos: 'numero', entrega_configs: 'id', eventos_foto: 'id' };
  if (!pkCol[table]) return json({ error: 'tabla inválida: usar solicitudes|contratos|entrega_configs|eventos_foto' }, 400);
  await env.CRCLUB_DB.prepare(`UPDATE ${table} SET evento_slug=? WHERE ${pkCol[table]}=?`).bind(slug, id).run();
  return json({ ok: true });
}

```

- [ ] **Step 2: Agregar rutas `/hub/*` en el fetch handler de CRP**

Localizar el bloque `// ── Contratos ──` que empieza con:
```javascript
      // ── Contratos ──
      if (path === '/contratos' && method === 'GET') {
```

Agregar inmediatamente DESPUÉS del cierre del bloque contratos (después de la línea `if (contratosDelMatch && method === 'DELETE') {` ... `}`) y ANTES del comentario `// ── Solicitudes`:

```javascript

      // ── Eventos Hub ──
      if (path === '/hub' && method === 'GET') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubList(env);
      }
      if (path === '/hub' && method === 'POST') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubUpsert(request, env);
      }
      const hubViewMatch = path.match(/^\/hub\/([a-z0-9-]+)$/);
      if (hubViewMatch && method === 'GET') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubView(hubViewMatch[1], env);
      }
      const hubLinkMatch = path.match(/^\/hub\/([a-z0-9-]+)\/link$/);
      if (hubLinkMatch && method === 'POST') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubLink(hubLinkMatch[1], request, env);
      }

```

- [ ] **Step 3: Deploy CRP worker**

```powershell
cd "e:\CLAUDE\WEB CRP\worker"
npx wrangler deploy
```

Expected: `✅ Deployed ... crclub-worker`

- [ ] **Step 4: Verificar endpoints**

```powershell
# Obtener JWT del admin (usar el token guardado en localStorage o hacer login)
# Test GET /hub — debe retornar []
curl -s -H "Authorization: Bearer TOKEN" https://crclub-worker.cristian-romero-digital.workers.dev/hub

# Test POST /hub
curl -s -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" `
  -d '{"slug":"test-2026-12-01","nombre":"Test Evento","fecha":"2026-12-01","tipo":"casamiento","qr":1}' `
  https://crclub-worker.cristian-romero-digital.workers.dev/hub

# Test GET /hub/test-2026-12-01
curl -s -H "Authorization: Bearer TOKEN" https://crclub-worker.cristian-romero-digital.workers.dev/hub/test-2026-12-01

# Limpiar dato de test
curl -s -X POST -H "Authorization: Bearer TOKEN" -H "Content-Type: application/json" `
  -d '{}' https://crclub-worker.cristian-romero-digital.workers.dev/hub/test-2026-12-01/link
```

Expected: GET /hub devuelve el evento creado; GET /hub/test-2026-12-01 devuelve el evento con arrays vacíos de linked records.

- [ ] **Step 5: Commit CRP worker**

```powershell
git -C "e:\CLAUDE\WEB CRP" add worker/src/index.js
git -C "e:\CLAUDE\WEB CRP" commit -m "feat: add /hub/* endpoints for eventos hub (CRP)"
```

---

### Task 3: Kuerre Worker — Endpoints `/hub/*`

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js`

**Interfaces:**
- Consumes: `env.KUERRE_DB` (D1), `isAdmin(request, coreEnv)` (via normalized coreEnv)
- Produces: mismos 4 endpoints que Task 2 pero contra `kuerre-db`

---

- [ ] **Step 1: Agregar funciones handler en Kuerre worker**

En `e:\CLAUDE\WEB KUERRE\worker\src\index.js`, localizar la función `resolveEventId` al inicio del archivo y agregar el bloque de handlers antes de ella (o en cualquier punto antes del `export default`). Usar como ancla la línea `export default {`:

Agregar ANTES de `export default {`:

```javascript
// ── Eventos Hub ──

async function handleHubList(db) {
  const { results } = await db.prepare('SELECT * FROM eventos ORDER BY fecha DESC').all();
  return json(results || []);
}

async function handleHubUpsert(request, db) {
  const d = await request.json();
  if (!d.slug || !d.nombre || !d.fecha) return json({ error: 'slug, nombre y fecha son requeridos' }, 400);
  await db.prepare(`
    INSERT INTO eventos (slug, nombre, fecha, tipo, qr, pm, inv, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      nombre=excluded.nombre, fecha=excluded.fecha, tipo=excluded.tipo,
      qr=excluded.qr, pm=excluded.pm, inv=excluded.inv, notas=excluded.notas
  `).bind(d.slug, d.nombre, d.fecha, d.tipo || 'casamiento', d.qr ? 1 : 0, d.pm ? 1 : 0, d.inv ? 1 : 0, d.notas || '').run();
  return json({ ok: true });
}

async function handleHubView(slug, db) {
  const evento = await db.prepare('SELECT * FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'not found' }, 404);
  const [sols, cts, ents, qrs] = await Promise.all([
    db.prepare('SELECT id, nombre_display, fecha, tipo FROM solicitudes WHERE evento_slug=?').bind(slug).all(),
    db.prepare('SELECT numero, tipo, cliente, fecha_ev, precio FROM contratos WHERE evento_slug=?').bind(slug).all(),
    db.prepare('SELECT id, nombres, fecha FROM entrega_configs WHERE evento_slug=?').bind(slug).all(),
    db.prepare('SELECT id, nombre, fecha FROM eventos_foto WHERE evento_slug=?').bind(slug).all(),
  ]);
  return json({ ...evento, solicitudes: sols.results || [], contratos: cts.results || [], entregas: ents.results || [], qr_eventos: qrs.results || [] });
}

async function handleHubLink(slug, request, db) {
  const { table, id } = await request.json();
  const pkCol = { solicitudes: 'id', contratos: 'numero', entrega_configs: 'id', eventos_foto: 'id' };
  if (!pkCol[table]) return json({ error: 'tabla inválida: usar solicitudes|contratos|entrega_configs|eventos_foto' }, 400);
  await db.prepare(`UPDATE ${table} SET evento_slug=? WHERE ${pkCol[table]}=?`).bind(slug, id).run();
  return json({ ok: true });
}

```

- [ ] **Step 2: Agregar rutas `/hub/*` en el fetch handler de Kuerre**

Localizar la línea final del handler (línea ~742):
```javascript
      return json({ error: 'Not found' }, 404);
```

Agregar ANTES de esa línea:

```javascript

      // ── Eventos Hub ──
      if (path === '/hub' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubList(env.KUERRE_DB);
      }
      if (path === '/hub' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubUpsert(request, env.KUERRE_DB);
      }
      const hubViewMatch = path.match(/^\/hub\/([a-z0-9-]+)$/);
      if (hubViewMatch && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubView(hubViewMatch[1], env.KUERRE_DB);
      }
      const hubLinkMatch = path.match(/^\/hub\/([a-z0-9-]+)\/link$/);
      if (hubLinkMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubLink(hubLinkMatch[1], request, env.KUERRE_DB);
      }

```

- [ ] **Step 3: Deploy Kuerre worker**

```powershell
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler deploy
```

Expected: `✅ Deployed ... KUERRE-worker`

- [ ] **Step 4: Verificar endpoint básico**

```powershell
curl -s -H "Authorization: Bearer TOKEN" https://KUERRE-worker.cristian-romero-digital.workers.dev/hub
```

Expected: `[]` (array vacío, no error 404 ni 500).

- [ ] **Step 5: Commit Kuerre worker**

```powershell
git -C "e:\CLAUDE\WEB KUERRE" add worker/src/index.js
git -C "e:\CLAUDE\WEB KUERRE" commit -m "feat: add /hub/* endpoints for eventos hub (Kuerre)"
```

---

### Task 4: CORE Admin — Sidebar + Page + JS

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html`
- Modify: `e:\CLAUDE\CORE\brands\crp\config.json` (bump versión V1.70 → V1.71)
- Modify: `e:\CLAUDE\CORE\brands\kuerre\config.json` (bump versión V1.70 → V1.71)

**Interfaces:**
- Consumes: `CLIENTES_WORKER` (string URL, ya definida en admin), `getAdminJWT()` (función ya existente), `toast(msg, type?)` (función ya existente)
- Produces: sidebar item `showPage('eventos')`, page `#page-eventos`, funciones `evHub_load()` / `evHub_showNew()` / `evHub_create()` / `evHub_view(slug)` / `evHub_link(slug)`

---

- [ ] **Step 1: Agregar sidebar item "Eventos Hub"**

En `e:\CLAUDE\CORE\src\admin.html`, localizar exactamente:
```html
      <div class="sidebar-item" data-module="contratos" title="Generá contratos digitales para clientes con datos del evento y precio" onclick="showPage('contratos')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Contratos
      </div>
      <div class="sidebar-item" data-module="presupuesto"
```

Reemplazar con (agrega el item Eventos Hub entre Contratos y Presupuesto PDF):
```html
      <div class="sidebar-item" data-module="contratos" title="Generá contratos digitales para clientes con datos del evento y precio" onclick="showPage('contratos')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
        Contratos
      </div>
      <div class="sidebar-item" title="Hub central: conecta solicitudes, contratos, entregas y QR por evento" onclick="showPage('eventos')">
        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
        Eventos
      </div>
      <div class="sidebar-item" data-module="presupuesto"
```

- [ ] **Step 2: Agregar título "eventos" al objeto `titles` en `showPage`**

Localizar (línea ~4011):
```javascript
  const titles = { dashboard:'Dashboard', portfolio:'Portfolio', blog:'Blog', photos:'Fotos del Sitio', video:'Video Hero', content:'Contenido', messages:'Mensajes', testimonials:'Testimonios', settings:'Configuración', invites:'Invitaciones', contratos:'Contratos', presupuesto:'Presupuesto PDF', entregas:'Entregas a Clientes', fiestas:'QR - Fiestas', clientes:'Clientes' };
```

Reemplazar con:
```javascript
  const titles = { dashboard:'Dashboard', portfolio:'Portfolio', blog:'Blog', photos:'Fotos del Sitio', video:'Video Hero', content:'Contenido', messages:'Mensajes', testimonials:'Testimonios', settings:'Configuración', invites:'Invitaciones', contratos:'Contratos', presupuesto:'Presupuesto PDF', entregas:'Entregas a Clientes', fiestas:'QR - Fiestas', clientes:'Clientes', eventos:'Eventos Hub' };
```

- [ ] **Step 3: Agregar hook `evHub_load()` en `showPage`**

Localizar (línea ~4027):
```javascript
  if (id === 'contratos') initContratosPage();
```

Agregar DESPUÉS de esa línea:
```javascript
  if (id === 'eventos') evHub_load();
```

- [ ] **Step 4: Agregar page `#page-eventos` en el HTML**

Localizar el comienzo de `page-presupuesto` (línea ~2007-2008):
```html
      </div>

      <div class="page" id="page-presupuesto" data-module="presupuesto">
```

Agregar ANTES:
```html
      </div>

      <div class="page" id="page-eventos">
        <div class="section-header">
          <div>
            <h2 class="section-h">Eventos Hub</h2>
            <p style="font-size:11px;color:var(--gray);letter-spacing:1px;margin-top:4px">Hub central · conecta todos los servicios por evento</p>
          </div>
          <button class="btn-add" onclick="evHub_showNew()">+ Nuevo Evento</button>
        </div>

        <!-- Formulario nuevo evento -->
        <div id="ev-new-form" style="display:none" class="settings-section">
          <div class="settings-section-title">Nuevo Evento</div>
          <div class="form-row" style="margin-top:14px">
            <div class="form-group">
              <label class="form-label">Nombre del evento</label>
              <input class="form-input" id="ev-nombre" placeholder="Bodas García & Pérez">
            </div>
            <div class="form-group">
              <label class="form-label">Fecha</label>
              <input class="form-input" id="ev-fecha" type="date">
            </div>
            <div class="form-group">
              <label class="form-label">Tipo</label>
              <select class="form-select" id="ev-tipo">
                <option value="casamiento">Casamiento</option>
                <option value="quinceañera">Quinceañera</option>
                <option value="evento">Evento social</option>
              </select>
            </div>
          </div>
          <div style="display:flex;gap:20px;margin-top:12px;align-items:center">
            <label style="display:flex;gap:6px;align-items:center;font-size:12px;cursor:pointer"><input type="checkbox" id="ev-qr"> QR Fiestas</label>
            <label style="display:flex;gap:6px;align-items:center;font-size:12px;cursor:pointer"><input type="checkbox" id="ev-pm"> Premiere</label>
            <label style="display:flex;gap:6px;align-items:center;font-size:12px;cursor:pointer"><input type="checkbox" id="ev-inv"> Invitación Digital</label>
          </div>
          <div class="form-group" style="margin-top:12px">
            <label class="form-label">Notas</label>
            <input class="form-input" id="ev-notas" placeholder="Notas internas...">
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn-add" onclick="evHub_create()">Guardar</button>
            <button class="btn-sm btn-sec" onclick="evHub_showNew()">Cancelar</button>
          </div>
        </div>

        <!-- Lista de eventos -->
        <div id="ev-list" style="margin-top:20px">
          <p style="color:var(--gray);font-size:12px">Cargando...</p>
        </div>

        <!-- Detalle de evento -->
        <div id="ev-detail" style="display:none;margin-top:24px" class="settings-section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
            <div class="settings-section-title" id="ev-detail-slug" style="margin:0"></div>
            <button style="background:none;border:none;color:var(--gray);cursor:pointer;font-size:18px" onclick="document.getElementById('ev-detail').style.display='none'">✕</button>
          </div>
          <div id="ev-detail-content"></div>
        </div>
      </div>

      <div class="page" id="page-presupuesto" data-module="presupuesto">
```

**IMPORTANTE:** Reemplazar solo la línea `      <div class="page" id="page-presupuesto" data-module="presupuesto">` al final para no duplicar la página existente — el bloque de arriba ya la incluye como ancla de fin.

- [ ] **Step 5: Agregar JS del hub antes del cierre de `</script>`**

Localizar en la zona final del script (buscar `// ── FIN` o antes de `</script>` final). Agregar el siguiente bloque de JS en la sección de scripts (después del bloque de contratos, antes del cierre del script):

```javascript
// ── Eventos Hub ──────────────────────────────────────────────────────────

async function evHub_load() {
  if (!CLIENTES_WORKER) return;
  const list = document.getElementById('ev-list');
  list.innerHTML = '<p style="color:var(--gray);font-size:12px">Cargando...</p>';
  try {
    const r = await fetch(CLIENTES_WORKER + '/hub', { headers: { Authorization: 'Bearer ' + getAdminJWT() } });
    const eventos = await r.json();
    if (!Array.isArray(eventos) || !eventos.length) {
      list.innerHTML = '<p style="color:var(--gray);font-size:12px">Sin eventos. Creá el primero con "+ Nuevo Evento".</p>';
      return;
    }
    list.innerHTML = eventos.map(ev => `
      <div class="settings-section" style="cursor:pointer;margin-bottom:10px" onclick="evHub_view('${ev.slug}')">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:13px;font-weight:600">${ev.nombre}</div>
            <div style="font-size:11px;color:var(--gray);margin-top:3px">${ev.slug} &middot; ${ev.fecha} &middot; ${ev.tipo}</div>
          </div>
          <div style="display:flex;gap:5px;font-size:10px;letter-spacing:0.5px">
            ${ev.qr  ? '<span style="background:rgba(0,200,120,.15);color:#00c878;padding:2px 7px;border-radius:3px">QR</span>'  : ''}
            ${ev.pm  ? '<span style="background:rgba(255,180,0,.15);color:#ffb400;padding:2px 7px;border-radius:3px">PM</span>'  : ''}
            ${ev.inv ? '<span style="background:rgba(140,100,255,.15);color:#8c64ff;padding:2px 7px;border-radius:3px">INV</span>' : ''}
          </div>
        </div>
      </div>
    `).join('');
  } catch(e) {
    list.innerHTML = '<p style="color:#e05;font-size:12px">Error cargando eventos: ' + e.message + '</p>';
  }
}

function evHub_showNew() {
  const f = document.getElementById('ev-new-form');
  f.style.display = f.style.display === 'none' ? 'block' : 'none';
}

async function evHub_create() {
  if (!CLIENTES_WORKER) return;
  const nombre = document.getElementById('ev-nombre').value.trim();
  const fecha  = document.getElementById('ev-fecha').value.trim();
  const tipo   = document.getElementById('ev-tipo').value;
  const qr     = document.getElementById('ev-qr').checked ? 1 : 0;
  const pm     = document.getElementById('ev-pm').checked ? 1 : 0;
  const inv    = document.getElementById('ev-inv').checked ? 1 : 0;
  const notas  = document.getElementById('ev-notas').value.trim();
  if (!nombre || !fecha) { toast('Completá nombre y fecha'); return; }
  const slug = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + fecha;
  try {
    const r = await fetch(CLIENTES_WORKER + '/hub', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminJWT() },
      body: JSON.stringify({ slug, nombre, fecha, tipo, qr, pm, inv, notas })
    });
    if (!r.ok) { const e = await r.json(); toast(e.error || 'Error'); return; }
    toast('Evento creado');
    evHub_showNew();
    evHub_load();
  } catch(e) { toast('Error: ' + e.message); }
}

async function evHub_view(slug) {
  if (!CLIENTES_WORKER) return;
  const det = document.getElementById('ev-detail');
  const content = document.getElementById('ev-detail-content');
  document.getElementById('ev-detail-slug').textContent = slug;
  det.style.display = 'block';
  content.innerHTML = '<p style="color:var(--gray);font-size:12px">Cargando...</p>';
  det.scrollIntoView({ behavior: 'smooth' });
  try {
    const r = await fetch(CLIENTES_WORKER + '/hub/' + slug, { headers: { Authorization: 'Bearer ' + getAdminJWT() } });
    const d = await r.json();
    const renderRows = (items, fields) => items.length
      ? items.map(i => `<tr>${fields.map(f => `<td style="padding:4px 10px;font-size:12px;border-bottom:1px solid rgba(255,255,255,0.04)">${i[f] != null ? i[f] : ''}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${fields.length}" style="color:var(--gray);font-size:11px;padding:6px 10px">Sin registros vinculados</td></tr>`;
    const section = (label, items, fields) => `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;letter-spacing:1.5px;color:var(--gray);text-transform:uppercase;margin-bottom:6px">${label}</div>
        <table style="width:100%;border-collapse:collapse">${renderRows(items, fields)}</table>
      </div>`;
    content.innerHTML = `
      <div style="margin-bottom:18px">
        <div style="font-size:15px;font-weight:600">${d.nombre}</div>
        <div style="font-size:11px;color:var(--gray);margin-top:3px">${d.fecha} &middot; ${d.tipo}</div>
      </div>
      ${section('Solicitudes', d.solicitudes, ['id','nombre_display','fecha'])}
      ${section('Contratos',   d.contratos,   ['numero','cliente','fecha_ev'])}
      ${section('Entregas',    d.entregas,     ['id','nombres','fecha'])}
      ${section('QR Fiestas',  d.qr_eventos,  ['id','nombre','fecha'])}
      <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:14px;margin-top:8px">
        <div style="font-size:10px;letter-spacing:1.5px;color:var(--gray);text-transform:uppercase;margin-bottom:10px">Vincular registro</div>
        <div class="form-row" style="align-items:flex-end">
          <div class="form-group">
            <label class="form-label">Tabla</label>
            <select class="form-select" id="ev-link-table">
              <option value="solicitudes">Solicitud</option>
              <option value="contratos">Contrato (número)</option>
              <option value="entrega_configs">Entrega</option>
              <option value="eventos_foto">QR Fiesta</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">ID / Número</label>
            <input class="form-input" id="ev-link-id" placeholder="ABC123 ó 42">
          </div>
          <button class="btn-add" onclick="evHub_link('${slug}')">Vincular</button>
        </div>
      </div>
    `;
  } catch(e) {
    content.innerHTML = '<p style="color:#e05;font-size:12px">Error: ' + e.message + '</p>';
  }
}

async function evHub_link(slug) {
  if (!CLIENTES_WORKER) return;
  const table = document.getElementById('ev-link-table').value;
  const id    = document.getElementById('ev-link-id').value.trim();
  if (!id) { toast('Ingresá un ID o número'); return; }
  try {
    const r = await fetch(CLIENTES_WORKER + '/hub/' + slug + '/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + getAdminJWT() },
      body: JSON.stringify({ table, id })
    });
    if (!r.ok) { const e = await r.json(); toast(e.error || 'Error'); return; }
    toast('Registro vinculado');
    evHub_view(slug);
  } catch(e) { toast('Error: ' + e.message); }
}
```

- [ ] **Step 6: Bump versión en config.json de ambos brands**

En `e:\CLAUDE\CORE\brands\crp\config.json`, reemplazar todas las ocurrencias de `V1.70` por `V1.71`.

En `e:\CLAUDE\CORE\brands\kuerre\config.json`, reemplazar todas las ocurrencias de `V1.70` por `V1.71`.

También en `e:\CLAUDE\CORE\src\admin.html`, buscar `V1.70` y reemplazar por `V1.71`.

- [ ] **Step 7: Commit CORE**

```powershell
git -C "e:\CLAUDE\CORE" add src/admin.html brands/crp/config.json brands/kuerre/config.json
git -C "e:\CLAUDE\CORE" commit -m "feat: add Eventos Hub section (sidebar + page + JS) V1.71"
```

---

### Task 5: Build y Deploy

**Files:**
- Generate: `e:\CLAUDE\WEB CRP\Productivo\admin.html`
- Generate: `e:\CLAUDE\WEB KUERRE\Productivo\admin.html`
- Generate: `e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html`

---

- [ ] **Step 1: Build CORE**

```powershell
node "e:\CLAUDE\CORE\build-admin.cjs"
```

Expected: sin errores, archivos `WEB CRP/Productivo/admin.html`, `WEB KUERRE/Productivo/admin.html` y `WEB KUERRE/Desarrollo/admin.html` actualizados.

- [ ] **Step 2: Verificar que el build incluyó la nueva página**

```powershell
Select-String -Path "e:\CLAUDE\WEB CRP\Productivo\admin.html" -Pattern "page-eventos" | Select-Object -First 1
Select-String -Path "e:\CLAUDE\WEB KUERRE\Productivo\admin.html" -Pattern "page-eventos" | Select-Object -First 1
```

Expected: ambos muestran una línea con `id="page-eventos"`.

- [ ] **Step 3: Verificar que CRP tiene `CT_USE_D1 = true` (no debe haber regresión)**

```powershell
Select-String -Path "e:\CLAUDE\WEB CRP\Productivo\admin.html" -Pattern "CT_USE_D1"
```

Expected: `CT_USE_D1  = true;`

- [ ] **Step 4: Commit + push CRP Productivo**

```powershell
git -C "e:\CLAUDE\WEB CRP" add Productivo/admin.html
git -C "e:\CLAUDE\WEB CRP" commit -m "build: admin V1.71 — Eventos Hub"
git -C "e:\CLAUDE\WEB CRP" push
```

- [ ] **Step 5: Commit + push Kuerre Productivo**

```powershell
git -C "e:\CLAUDE\WEB KUERRE" add Productivo/admin.html Desarrollo/admin.html
git -C "e:\CLAUDE\WEB KUERRE" commit -m "build: admin V1.71 — Eventos Hub"
git -C "e:\CLAUDE\WEB KUERRE" push
```

- [ ] **Step 6: Verificar en browser**

1. Abrir el admin de CRP. Verificar que aparece "Eventos" en el sidebar.
2. Click en "Eventos" → se carga la página (lista vacía si no hay eventos aún).
3. Click "+ Nuevo Evento" → aparece el formulario.
4. Completar nombre "Test Evento", fecha "2026-12-01", tipo "Casamiento", activar QR. Guardar.
5. Verificar que aparece el card en la lista con el chip "QR".
6. Click en el card → se abre el detalle con las secciones (Solicitudes, Contratos, Entregas, QR Fiestas) vacías.
7. Repetir en el admin de Kuerre.

---

## Self-Review

**Spec coverage:**
- ✅ Tabla `eventos` en CRP → Task 1 Step 3
- ✅ Columna `evento_slug` en 4 tablas CRP → Task 1 Steps 1 + 3
- ✅ Columna `evento_slug` en 3 tablas Kuerre → Task 1 Steps 2 + 4
- ✅ CRUD endpoints CRP `/hub` → Task 2
- ✅ CRUD endpoints Kuerre `/hub` → Task 3
- ✅ Sidebar + page + JS en CORE admin → Task 4
- ✅ Build + deploy ambos → Task 5
- ✅ No-regresión: ninguna ruta existente modificada; columnas nullable → funciona con records existentes

**Placeholder scan:** Ninguno. Todo el código está completo en los steps.

**Type consistency:**
- `slug` usado consistentemente en worker y JS del admin
- `getAdminJWT()` (no `getAdminToken()`) — verificado en el código existente de CORE (línea 2957)
- `CLIENTES_WORKER` — guardada en ambos config.json (CRP: crclub-worker, Kuerre: KUERRE-worker)
- `isAdmin(request, env)` en CRP; `isAdmin(request, coreEnv)` en Kuerre — correcto según arquitectura de cada worker
