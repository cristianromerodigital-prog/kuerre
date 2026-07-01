# QR Fiestas — R2 + Drive Simultáneo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las fotos de QR Fiestas se suben a R2 al instante (galería rápida) y se copian a Drive en background via `ctx.waitUntil` + GAS (para que el cliente descargue y Premiere funcione). Sin toggles, siempre ambos destinos.

**Architecture:** Worker recibe la foto → put a R2 → responde OK al invitado → `ctx.waitUntil` llama GAS `uploadFoto` en background → foto llega a Drive sin que el invitado espere. La galería lista desde R2 (rápido, sin throttling). Drive sigue siendo fuente de verdad para el cliente y Premiere. Eventos existentes (`storage='drive'`) no se tocan.

**Tech Stack:** Cloudflare Workers, R2 (`kuerre-media`), D1 (`kuerre-db`), KV, GAS (CRP account, sin cambios de código), CORE build system.

## Global Constraints

- NUNCA editar `WEB KUERRE/Productivo/admin.html` directamente — editar `CORE/src/admin.html` y correr `node build-admin.cjs all` desde `e:\CLAUDE\CORE\`
- Worker deploy: `npx wrangler deploy` desde `e:\CLAUDE\WEB KUERRE\worker\`
- `eventos.js` es CORE compartido — cambios afectan CRP también. Toda lógica R2 va condicionada a `evento.storage === 'r2'`
- `storage='drive'` = comportamiento actual (sin cambios). `storage='r2'` = nueva arquitectura dual
- GAS consolidado: Kuerre usa el GAS de CRP (`cristian.romero.digital@gmail.com`) para fotos — solo cambio de URL en KV, sin tocar código GAS
- Drive de Kuerre = carpeta "KUERRE" dentro del Drive de CRP (cristian.romero.digital, 5TB)
- `folder_id` sigue siendo obligatorio en eventos R2 (destino Drive para backup)

---

### Task 1: Schema D1 — columna `storage`

**Files:**
- Modify: `WEB KUERRE/worker/schema.sql`

**Interfaces:**
- Produces: `eventos_foto.storage TEXT DEFAULT 'drive'` — todas las tasks siguientes la leen

- [ ] **Step 1: Agregar al schema.sql**

Al final del archivo:

```sql
-- Migración: backend de storage por evento ('drive' = GAS+Drive | 'r2' = R2+Drive background)
ALTER TABLE eventos_foto ADD COLUMN storage TEXT DEFAULT 'drive';
```

- [ ] **Step 2: Aplicar en D1 remoto**

```bash
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE eventos_foto ADD COLUMN storage TEXT DEFAULT 'drive';"
```

Si dice `duplicate column name`: ya existe, ignorar y continuar.

- [ ] **Step 3: Verificar**

```bash
npx wrangler d1 execute kuerre-db --remote --command "PRAGMA table_info(eventos_foto);" --json
```

Confirmar que `storage` aparece con `dflt_value: "drive"`.

- [ ] **Step 4: Commit**

```bash
cd "e:\CLAUDE\WEB KUERRE"
git add worker/schema.sql
git commit -m "feat(qr): add storage column to eventos_foto (drive|r2)"
```

---

### Task 2: Worker — R2 serve + listado + delete

**Files:**
- Modify: `WEB KUERRE/worker/src/index.js`

**Interfaces:**
- Consumes: `eventos_foto.storage` (Task 1)
- Produces:
  - `GET /api/fotos/{key}` — sirve imagen desde R2
  - `GET /eventos/{id}/fotos` — lista desde R2 si `storage='r2'` (interceptado antes del core)
  - `DELETE /eventos/admin/{id}/fotos/{key}` — borra de R2 si `storage='r2'` (interceptado antes del core)

- [ ] **Step 1: Agregar función `handleFotoListR2`**

Agregar cerca de `handleFotoUploadConModeracion`:

```javascript
async function handleFotoListR2(eventoId, request, env) {
  const sessionId = new URL(request.url).searchParams.get('session') || '';
  const listed = await env.MEDIA.list({ prefix: `eventos/${eventoId}/` });
  const objects = (listed.objects || []).sort((a, b) => Number(b.uploaded) - Number(a.uploaded));
  if (!objects.length) return json({ files: [] });

  const workerOrigin = new URL(request.url).origin;
  const fotoIds = objects.map(o => o.key);
  const ph = fotoIds.map(() => '?').join(',');

  const { results: likeCounts } = await env.DB.prepare(
    `SELECT foto_id, COUNT(*) as total FROM foto_likes WHERE evento_id=? AND foto_id IN (${ph}) GROUP BY foto_id`
  ).bind(eventoId, ...fotoIds).all();

  const countMap = {};
  likeCounts.forEach(r => { countMap[r.foto_id] = r.total; });

  let likedSet = new Set();
  if (sessionId) {
    const { results: myLikes } = await env.DB.prepare(
      `SELECT foto_id FROM foto_likes WHERE evento_id=? AND session_id=? AND foto_id IN (${ph})`
    ).bind(eventoId, sessionId, ...fotoIds).all();
    myLikes.forEach(r => likedSet.add(r.foto_id));
  }

  const files = objects.map(o => ({
    url: `${workerOrigin}/api/fotos/${encodeURIComponent(o.key)}`,
    foto_id: o.key,
    likes: countMap[o.key] || 0,
    liked: likedSet.has(o.key),
    name: o.key.split('/').pop()
  }));

  return json({ files });
}
```

- [ ] **Step 2: Agregar interceptores GET y DELETE antes de `mountCoreRouter`**

Buscar el comentario `// ── kuerre-core: eventos, fotos` e insertar ANTES:

```javascript
      // ── R2: listado de fotos ───────────────────────────────────────────────
      const fotoListMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/fotos$/);
      if (fotoListMatch && method === 'GET') {
        const eid = await resolveEventId(fotoListMatch[1], env);
        if (eid) {
          const ev = await env.DB.prepare('SELECT storage FROM eventos_foto WHERE id=?').bind(eid).first();
          if (ev?.storage === 'r2') return await handleFotoListR2(eid, request, env);
        }
        // storage='drive': cae al core router
      }

      // ── R2: delete foto desde admin ────────────────────────────────────────
      const fotoDelMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/fotos\/(.+)$/);
      if (fotoDelMatch && method === 'DELETE') {
        const [, eventoId, rawKey] = fotoDelMatch;
        const ev = await env.DB.prepare('SELECT storage FROM eventos_foto WHERE id=?').bind(eventoId).first();
        if (ev?.storage === 'r2') {
          const key = decodeURIComponent(rawKey);
          await Promise.all([
            env.DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(eventoId, key).run(),
            env.MEDIA.delete(key)
          ]);
          return json({ ok: true });
        }
        // storage='drive': cae al core router
      }
```

- [ ] **Step 3: Agregar route `/api/fotos/*`**

Buscar el bloque `// ── Hero video` e insertar ANTES:

```javascript
        // ── R2 foto serve ──────────────────────────────────────────────────
        if (path.startsWith('/api/fotos/') && method === 'GET') {
          const key = decodeURIComponent(path.slice('/api/fotos/'.length));
          if (!key || key.includes('..')) return new Response('Not found', { status: 404 });
          const obj = await env.MEDIA.get(key);
          if (!obj) return new Response('Not found', { status: 404 });
          return new Response(obj.body, {
            headers: {
              'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
              'Cache-Control': 'public, max-age=31536000, immutable',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
```

- [ ] **Step 4: Dry-run para verificar sintaxis**

```bash
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler deploy --dry-run 2>&1 | head -20
```

Sin errores de sintaxis.

- [ ] **Step 5: Deploy**

```bash
npx wrangler deploy
```

- [ ] **Step 6: Smoke test**

```bash
curl -I https://kuerre-worker.cristian-romero-digital.workers.dev/api/fotos/inexistente
```

Esperado: `HTTP/2 404`. Si da 500, hay error en el route.

- [ ] **Step 7: Commit**

```bash
cd "e:\CLAUDE\WEB KUERRE"
git add worker/src/index.js
git commit -m "feat(qr): R2 list/serve/delete — interceptores antes del core"
```

---

### Task 3: Worker — upload a R2 + Drive en background

**Files:**
- Modify: `WEB KUERRE/worker/src/index.js`

**Interfaces:**
- Consumes: `eventos_foto.storage` y `eventos_foto.folder_id` (Task 1)
- Consumes: `ctx` del handler principal (ya disponible en `fetch(request, env, ctx)`)
- Produces: `handleFotoUploadConModeracion(identifier, request, env, ctx)` — agrega `ctx` al signature

**Flujo para `storage='r2'`:**
1. OpenAI check (igual que hoy)
2. `env.MEDIA.put(key, buffer)` → responde OK
3. `ctx.waitUntil(gasUploadBackground(...))` → Drive en background

**Flujo para `storage='drive'`:** idéntico al actual, sin cambios.

- [ ] **Step 1: Agregar función `gasUploadBackground`**

Agregar cerca de `handleFotoListR2`:

```javascript
async function gasUploadBackground(gasUrl, folderId, buffer, filename, mimeType, eventoId, env) {
  try {
    const base64 = arrayBufferToBase64(buffer);
    const res = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'uploadFoto',
        folderId,
        moderacion: false,
        base64,
        filename,
        mimeType
      })
    });
    if (!res.ok) throw new Error(`GAS status ${res.status}`);
  } catch (e) {
    // Log para re-sync manual desde admin
    const errKey = `drive_sync_err_${eventoId}_${Date.now()}`;
    await env.KV.put(errKey, JSON.stringify({ folderId, filename, error: e.message, ts: Date.now() }), { expirationTtl: 86400 * 7 });
  }
}
```

**Nota:** `arrayBufferToBase64` ya existe en `helpers.js` e importado en el worker.

- [ ] **Step 2: Modificar `handleFotoUploadConModeracion` — agregar `ctx` al signature**

Cambiar:
```javascript
async function handleFotoUploadConModeracion(identifier, request, env) {
```
Por:
```javascript
async function handleFotoUploadConModeracion(identifier, request, env, ctx) {
```

- [ ] **Step 3: Agregar `storage` a la query D1 del evento**

Dentro de `handleFotoUploadConModeracion`, cambiar la query que lee el evento:
```javascript
'SELECT folder_id, estado, moderacion, cierre_auto FROM eventos_foto WHERE id = ?'
```
Por:
```javascript
'SELECT folder_id, estado, moderacion, cierre_auto, storage FROM eventos_foto WHERE id = ?'
```

- [ ] **Step 4: Reemplazar el bloque de upload GAS con la lógica dual**

Dentro de `handleFotoUploadConModeracion`, localizar el bloque que llama a GAS con `action: 'uploadFoto'`. Reemplazar todo ese bloque final por:

```javascript
  // ── Upload: R2 inmediato + Drive en background ─────────────────────────
  if (evento.storage === 'r2') {
    const ext = ((file.name || 'foto.jpg').split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const key = `eventos/${realId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await env.MEDIA.put(key, buffer, { httpMetadata: { contentType: file.type || 'image/jpeg' } });

    const workerOrigin = new URL(request.url).origin;

    // Drive backup en background (no bloquea la respuesta)
    if (evento.folder_id) {
      const gasUrl = await env.KV.get('fiestas_gas_url');
      if (gasUrl) {
        ctx.waitUntil(gasUploadBackground(gasUrl, evento.folder_id, buffer, file.name || `foto_${Date.now()}.jpg`, file.type || 'image/jpeg', realId, env));
      }
    }

    return json({ ok: true, file: { url: `${workerOrigin}/api/fotos/${encodeURIComponent(key)}`, name: file.name } });
  }

  // ── Drive directo (storage='drive' — comportamiento original) ──────────
  const gasUrl = await env.KV.get('fiestas_gas_url');
  if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
  const res = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'uploadFoto',
      folderId: evento.folder_id,
      moderacion: evento.moderacion === 1,
      base64,
      filename: file.name || `foto_${Date.now()}.jpg`,
      mimeType: file.type || 'image/jpeg'
    })
  });
  return json(await res.json());
```

- [ ] **Step 5: Actualizar el call site para pasar `ctx`**

Buscar donde se llama `handleFotoUploadConModeracion` en el handler principal:
```javascript
return await handleFotoUploadConModeracion(fotoUploadMatch[1], request, env);
```
Cambiar por:
```javascript
return await handleFotoUploadConModeracion(fotoUploadMatch[1], request, env, ctx);
```

- [ ] **Step 6: Dry-run**

```bash
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler deploy --dry-run 2>&1 | head -20
```

- [ ] **Step 7: Deploy**

```bash
npx wrangler deploy
```

- [ ] **Step 8: Commit**

```bash
cd "e:\CLAUDE\WEB KUERRE"
git add worker/src/index.js
git commit -m "feat(qr): upload R2 inmediato + Drive background via ctx.waitUntil"
```

---

### Task 4: CORE eventos.js — config y creación con `storage`

**Files:**
- Modify: `CORE/src/eventos.js`

**Interfaces:**
- Produces:
  - `GET /eventos/admin/config` devuelve `{ gas_url, storage }`
  - `POST /eventos/admin/config` persiste `storage` en KV como `fiestas_storage`
  - `POST /eventos/admin` acepta y guarda `storage` en D1

- [ ] **Step 1: Extender GET /eventos/admin/config**

Localizar:
```javascript
  if (path === '/eventos/admin/config' && method === 'GET') {
    const gas_url = await env.KV.get('fiestas_gas_url');
    return json({ gas_url: gas_url || '' });
  }
```

Reemplazar por:
```javascript
  if (path === '/eventos/admin/config' && method === 'GET') {
    const [gas_url, storage] = await Promise.all([
      env.KV.get('fiestas_gas_url'),
      env.KV.get('fiestas_storage')
    ]);
    return json({ gas_url: gas_url || '', storage: storage || 'drive' });
  }
```

- [ ] **Step 2: Extender POST /eventos/admin/config**

Localizar:
```javascript
  if (path === '/eventos/admin/config' && method === 'POST') {
    const { gas_url } = await request.json();
    if (!gas_url) return json({ error: 'gas_url requerido' }, 400);
    await env.KV.put('fiestas_gas_url', gas_url);
    return json({ ok: true });
  }
```

Reemplazar por:
```javascript
  if (path === '/eventos/admin/config' && method === 'POST') {
    const { gas_url, storage } = await request.json();
    const ops = [];
    if (gas_url !== undefined) ops.push(env.KV.put('fiestas_gas_url', gas_url));
    if (storage === 'r2' || storage === 'drive') ops.push(env.KV.put('fiestas_storage', storage));
    if (!ops.length) return json({ error: 'Nada que actualizar' }, 400);
    await Promise.all(ops);
    return json({ ok: true });
  }
```

- [ ] **Step 3: Extender POST /eventos/admin (crear evento)**

Localizar el bloque que hace `INSERT INTO eventos_foto`. Cambiar el destructuring y el INSERT:

Destructuring — agregar `storage`:
```javascript
const { nombre, fecha, cierre_auto, folder_id, portada, estado, moderacion, storage } = await request.json();
```

Validación — `folder_id` obligatorio solo para Drive:
```javascript
const storageVal = (storage === 'r2' || storage === 'drive') ? storage : 'drive';
if (storageVal === 'drive' && !folder_id) return json({ error: 'folder_id requerido para Drive' }, 400);
```

INSERT — agregar columna `storage`:
```javascript
    await env.DB.prepare(`
      INSERT INTO eventos_foto (id, nombre, fecha, cierre_auto, folder_id, portada, estado, moderacion, storage, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, nombre, fecha, cierre_auto || null, folder_id || '', portada || null,
        estado || 'activo', moderacion ? 1 : 0, storageVal, nowISO()).run();
```

- [ ] **Step 4: Rebuild**

```bash
cd "e:\CLAUDE\CORE"
node build-admin.cjs all
```

Esperado: `✅ kuerre built` y `✅ crp built` sin errores.

- [ ] **Step 5: Re-deploy worker**

```bash
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler deploy
```

- [ ] **Step 6: Commit**

```bash
cd "e:\CLAUDE\WEB KUERRE"
git add -A
git commit -m "feat(qr): eventos config+create soportan storage backend"
```

---

### Task 5: Admin UI — default R2 en config + badge en lista

**Files:**
- Modify: `CORE/src/admin.html`

**Interfaces:**
- Consumes: `GET /eventos/admin/config` con `{ gas_url, storage }` (Task 4)
- Consumes: `POST /eventos/admin/config` con `{ storage }` (Task 4)
- Consumes: `POST /eventos/admin` con `storage` (Task 4)

**Antes de editar:** Buscar con Grep los anchors exactos en el archivo de 850KB:
```bash
grep -n "fiestas-gas-url\|fiestas_gas_url\|loadFiestasConfig\|saveFiestasConfig\|folder_id\|fiesta_estado\|badge" "e:\CLAUDE\CORE\src\admin.html" | head -30
```

- [ ] **Step 1: Agregar toggle Drive/R2 en el HTML de config QR**

Localizar el `input` con `id="fiestas-gas-url"`. Agregar DESPUÉS del bloque que lo contiene (después del `</div>` de ese form-group):

```html
<div class="form-group" style="margin-top:16px">
  <label class="form-label">Almacenamiento por defecto para eventos nuevos</label>
  <div style="display:flex;gap:8px;margin-top:6px">
    <button id="storage-btn-drive" class="btn-sm" onclick="setFiestasStorage('drive')" style="min-width:72px">Drive</button>
    <button id="storage-btn-r2"    class="btn-sm" onclick="setFiestasStorage('r2')"    style="min-width:72px">R2</button>
  </div>
  <p class="form-hint" style="margin-top:6px">R2: galería rápida + copia a Drive en background. Drive: comportamiento anterior. Los eventos existentes no se ven afectados.</p>
</div>
```

- [ ] **Step 2: Agregar funciones JS `setFiestasStorage` y `updateStorageButtons`**

Localizar la función JS que guarda la config de QR (tiene `fiestas_gas_url`). Agregar después de esa función:

```javascript
async function setFiestasStorage(val) {
  await fetch(CONFIG.CF_URL + '/eventos/admin/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminJWT() },
    body: JSON.stringify({ storage: val })
  }).catch(() => {});
  updateStorageButtons(val);
  showToast('Storage: ' + (val === 'r2' ? 'R2 + Drive background' : 'Drive directo'));
}

function updateStorageButtons(val) {
  const gold = getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() || '#c9a96e';
  ['drive', 'r2'].forEach(v => {
    const btn = document.getElementById('storage-btn-' + v);
    if (!btn) return;
    btn.style.background = val === v ? gold : '';
    btn.style.color      = val === v ? '#111' : '';
    btn.style.fontWeight = val === v ? '700' : '';
  });
}
```

- [ ] **Step 3: Cargar `storage` al inicializar la sección QR**

Localizar la función que hace `fetch` al GET `/eventos/admin/config`. Agregar después de leer `data.gas_url`:

```javascript
updateStorageButtons(data.storage || 'drive');
```

- [ ] **Step 4: Pasar `storage` al crear evento nuevo**

Localizar la función JS que hace POST a `/eventos/admin` para crear un evento. Agregar en el body del fetch, junto a `nombre`, `fecha`, etc.:

```javascript
storage: document.getElementById('storage-btn-r2')?.style.background ? 'r2' : 'drive',
```

**Alternativa más robusta** si hay una variable de estado para el storage activo:

```javascript
// Al inicio del módulo QR, agregar:
let _fiestasStorage = 'drive';

// En updateStorageButtons, agregar:
_fiestasStorage = val;

// En el create, usar:
storage: _fiestasStorage,
```

Usar la alternativa robusta si la función de create no tiene fácil acceso al DOM del config.

- [ ] **Step 5: Badge R2 en el listado de eventos**

Localizar en el JS donde se renderiza cada evento de la lista de QR (contiene `evento.nombre` y `evento.fecha` en un template HTML). Agregar badge:

```javascript
const storageBadge = ev.storage === 'r2'
  ? ' <span style="font-size:9px;letter-spacing:.5px;background:rgba(144,96,184,.25);color:var(--gold);padding:1px 5px;border-radius:3px;vertical-align:middle">R2</span>'
  : '';
// Usar storageBadge junto al nombre del evento en el innerHTML
```

- [ ] **Step 6: Rebuild y verificación local**

```bash
cd "e:\CLAUDE\CORE"
node build-admin.cjs all
```

Abrir `WEB KUERRE/Desarrollo/admin.html` → loguearse → QR Fiestas → Configuración:
- Botones "Drive" y "R2" visibles
- Click "R2" → se resalta en gold
- Recargar → sigue en R2
- Crear evento → en el POST body debe aparecer `"storage":"r2"`

- [ ] **Step 7: Commit**

```bash
cd "e:\CLAUDE\WEB KUERRE"
git add -A
git commit -m "feat(qr): toggle storage Drive/R2 en admin + badge en lista"
```

---

### Task 6: GAS consolidado + KV config + test end-to-end + deploy

**Files:** ninguno nuevo

**Objetivo:** Apuntar Kuerre a GAS de CRP para fotos, verificar flujo completo y hacer deploy productivo.

- [ ] **Step 1: Actualizar `fiestas_gas_url` en KV de Kuerre para usar GAS de CRP**

Desde la consola del browser en el admin de Kuerre logueado:

```javascript
fetch(CONFIG.CF_URL + '/eventos/admin/config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getAdminJWT() },
  body: JSON.stringify({ gas_url: 'https://script.google.com/macros/s/AKfycbyhlU8mZpL0LJF19pKglRnV7DNsukj0hydU2RtANpmKQ5NOj6iZj9CyFRj5h46pJJK2/exec' })
}).then(r=>r.json()).then(console.log)
```

Esperado: `{ ok: true }`.

- [ ] **Step 2: Crear carpeta "KUERRE" en Drive de CRP**

En Google Drive (cristian.romero.digital@gmail.com), crear una carpeta raíz llamada "KUERRE". Copiar su ID (de la URL: `drive.google.com/drive/folders/{ID}`).

- [ ] **Step 3: Activar R2 como default en el admin de Kuerre**

Admin → QR Fiestas → Configuración → click "R2" → confirmar toast.

- [ ] **Step 4: Crear evento de prueba con R2**

En el admin, crear evento "Test R2 Jul 2026" con:
- `folder_id`: ID de una subcarpeta dentro de "KUERRE" en el Drive de CRP (crear la carpeta manualmente, compartirla con el email que ejecuta el GAS de CRP)
- `storage`: debe ser "r2" (verificar en el badge de la lista)

- [ ] **Step 5: Test de upload desde fiestas.html**

Abrir `WEB KUERRE/Productivo/fiestas.html?id={id_evento}` en browser.
Subir una foto de prueba.

En DevTools → Network verificar:
- POST a `/eventos/{id}/fotos` → respuesta `{ ok: true, file: { url: "https://...workers.dev/api/fotos/eventos/..." } }`
- La URL de la foto empieza con `https://kuerre-worker.../api/fotos/`

- [ ] **Step 6: Verificar galería**

Recargar `fiestas.html` → foto aparece en la galería. Click en foto → lightbox funciona.

- [ ] **Step 7: Verificar Drive backup (esperar ~10 segundos)**

Abrir la carpeta Drive del evento → la foto debe aparecer ahí también. Puede tardar unos segundos (background).

- [ ] **Step 8: Test de evento Drive existente (no-regresión)**

Abrir un evento existente con `storage='drive'` → las fotos deben cargar normalmente desde Drive. Upload de foto nueva → va a Drive directamente (comportamiento anterior sin cambios).

- [ ] **Step 9: Deploy productivo**

```bash
# Build
cd "e:\CLAUDE\CORE"
node build-admin.cjs all

# Copy to gh-pages worktree
cd "e:\CLAUDE\WEB KUERRE"
Copy-Item "Productivo\admin.html" ".worktrees\gh-pages\admin.html"

# Push main
git add -A
git commit -m "deploy: QR Fiestas R2+Drive dual storage — productivo"
git push origin main

# Push gh-pages
cd ".worktrees\gh-pages"
git add admin.html
git commit -m "deploy: dual storage QR fiestas"
git push origin gh-pages
```

---

## Self-Review

**Spec coverage:**
- ✅ R2 inmediato para galería (fast UX)
- ✅ Drive siempre populado via ctx.waitUntil (cliente descarga, Premiere funciona)
- ✅ No toggle Drive/R2 — ambos siempre para eventos nuevos
- ✅ Eventos existentes `storage='drive'` sin cambios (no-regresión)
- ✅ GAS consolidado en CRP para fotos de Kuerre
- ✅ Drive de Kuerre = carpeta dentro de CRP 5TB
- ✅ folder_id sigue configurable desde admin (no hardcodeado)
- ✅ Error de Drive backup logueado en KV para diagnóstico

**Tipo consistencia:**
- `storage` siempre `'r2'` | `'drive'` — D1, KV, body POST, lógica worker
- `foto_id` para R2 = R2 key completo (`eventos/ID/timestamp_rand.ext`) — consistente en likes, delete, URL
- `gasUploadBackground` recibe `buffer` como `ArrayBuffer` — mismo tipo que sale de `file.arrayBuffer()`

**Backward compatibility:**
- `eventos.js` cambios en config/create: no afectan CRP (CRP no tiene R2 binding, pero el código de config solo guarda en KV y el de create solo guarda en D1 — no llama a `env.MEDIA`)
- `handleFotoUploadConModeracion` con `ctx`: el parámetro nuevo es el cuarto, opcional en JS — el core router sigue llamando a `handleEventoUpload` (sin ctx) para eventos Drive ✅
