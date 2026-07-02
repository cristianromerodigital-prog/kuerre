# KUERRE — Contratos D1 (alinear con CRP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el sistema de contratos de KUERRE para que use D1 con las mismas columnas que CRP, habilitando `CT_USE_D1 = true` en el admin.

**Architecture:** La tabla `contratos` de KUERRE se recrea con las 39 columnas de CRP (es seguro: 0 filas). La tabla `solicitudes` recibe las columnas individuales que le faltan (hay 1 fila de prueba que se migra desde `data_json`). El worker KUERRE recibe los tres endpoints de contratos idénticos a CRP. CORE/brands/kuerre/config.json agrega el patch `CT_USE_D1 = true` y `fecha_evento` en el POST body. Se rebuilda el admin y se deploya.

**Tech Stack:** Cloudflare D1 (kuerre-db), Cloudflare Workers (kuerre-worker), wrangler 4.x, vanilla JS/HTML.

## Global Constraints

- Worker usa `env.KUERRE_DB` (no `env.CRCLUB_DB` como CRP)
- Worker usa `env.KUERRE_KV` (no `env.CRCLUB_KV`)
- Brand name en config es `kuerre` (minúsculas)
- Worker URL: `https://kuerre-worker.cristian-romero-digital.workers.dev`
- D1 database name: `kuerre-db` (id: `8ea1a29e-942d-40f6-84a3-341e822c4323`)
- Build admin: `node build-admin.cjs kuerre` desde `e:\CLAUDE\CORE\`
- Deploy worker: `npx wrangler deploy` desde `e:\CLAUDE\WEB KUERRE\worker\`
- NO tocar CRP ni el worker `crclub-worker`
- NO modificar la tabla `eventos` (compatible entre ambos proyectos)
- Mantener `data_json` en `solicitudes` (no borrar — otros endpoints lo usan)

---

## Task 1: D1 — Recrear tabla contratos con schema CRP

**Files:**
- Create: `e:\CLAUDE\WEB KUERRE\worker\migrate_contratos_crp.sql`

**Verificado:** `contratos` tiene 0 filas en producción → DROP + CREATE seguro.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- migrate_contratos_crp.sql
-- KUERRE: reemplaza tabla contratos (blob datos) por schema CRP (columnas individuales)
-- Verificado: 0 filas en producción al 2026-07-01

DROP TABLE IF EXISTS contratos;

CREATE TABLE contratos (
  numero          INTEGER PRIMARY KEY,
  fecha_gen       TEXT DEFAULT '',
  fecha_evento    TEXT DEFAULT '',
  cliente         TEXT DEFAULT '',
  cliente2        TEXT DEFAULT '',
  lugar           TEXT DEFAULT '',
  precio          INTEGER DEFAULT 0,
  cuotas          INTEGER DEFAULT 1,
  estado          TEXT DEFAULT 'GENERADO',
  doc_url         TEXT DEFAULT '',
  pdf_url         TEXT DEFAULT '',
  notas           TEXT DEFAULT '',
  solicitud_id    TEXT DEFAULT NULL,
  cliente_dni     TEXT DEFAULT '',
  cliente_tel     TEXT DEFAULT '',
  cliente_email   TEXT DEFAULT '',
  cliente2_nac    TEXT DEFAULT '',
  cliente2_dni    TEXT DEFAULT '',
  cliente2_dom    TEXT DEFAULT '',
  cliente2_tel    TEXT DEFAULT '',
  cliente2_email  TEXT DEFAULT '',
  hora_inicio     TEXT DEFAULT '',
  hora_fin        TEXT DEFAULT '',
  direccion       TEXT DEFAULT '',
  invitados       TEXT DEFAULT '',
  ciudad          TEXT DEFAULT '',
  dia_firma       TEXT DEFAULT '',
  nombre_paquete  TEXT DEFAULT '',
  servicios       TEXT DEFAULT '[]',
  contacto_nombre TEXT DEFAULT '',
  contacto_rel    TEXT DEFAULT '',
  contacto_tel    TEXT DEFAULT '',
  civil_fecha     TEXT DEFAULT '',
  civil_hora      TEXT DEFAULT '',
  civil_dir       TEXT DEFAULT '',
  reli_fecha      TEXT DEFAULT '',
  reli_hora       TEXT DEFAULT '',
  reli_dir        TEXT DEFAULT '',
  formas_pago     TEXT DEFAULT '[]',
  evento_id       INTEGER DEFAULT NULL
);
```

- [ ] **Step 2: Ejecutar en D1 remoto**

```powershell
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler d1 execute kuerre-db --remote --file migrate_contratos_crp.sql
```

Resultado esperado: `"success": true`, `"rows_written": 0` (DROP + CREATE).

- [ ] **Step 3: Verificar schema en D1**

```powershell
npx wrangler d1 execute kuerre-db --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='contratos'"
```

Resultado esperado: la definición SQL debe mostrar `numero INTEGER PRIMARY KEY` y columna `fecha_evento`.

---

## Task 2: D1 — Agregar columnas faltantes a solicitudes

**Files:**
- Create: `e:\CLAUDE\WEB KUERRE\worker\migrate_solicitudes_cols.sql`

**Columnas presentes en CRP pero ausentes en KUERRE (verificado contra D1 real):**
`cliente2_nombre`, `hora_inicio`, `hora_fin`, `invitados`, `quinceanera_nombre`, `civil_fecha`, `civil_hora`, `civil_lugar`, `civil_dir`, `reli_fecha`, `reli_hora`, `reli_lugar`, `reli_dir`, `procesada`

**Nota:** hay 1 fila de prueba (id=LZKF8A, CUMPLE de test) — el UPDATE la migra; si falla no importa porque es datos de prueba.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- migrate_solicitudes_cols.sql
-- KUERRE: agregar columnas individuales que tiene CRP pero faltan en KUERRE
-- Mantiene data_json (no lo elimina — otros endpoints lo usan)

ALTER TABLE solicitudes ADD COLUMN cliente2_nombre    TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN hora_inicio        TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN hora_fin           TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN invitados          TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN quinceanera_nombre TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_fecha        TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_hora         TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_lugar        TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN civil_dir          TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_fecha         TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_hora          TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_lugar         TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN reli_dir           TEXT DEFAULT '';
ALTER TABLE solicitudes ADD COLUMN procesada          INTEGER DEFAULT 0;

-- Migrar la 1 fila existente desde data_json a columnas individuales
UPDATE solicitudes SET
  hora_inicio        = COALESCE(json_extract(data_json,'$.fiesta.horaInicio'), json_extract(data_json,'$.evento.horaInicio'), ''),
  hora_fin           = COALESCE(json_extract(data_json,'$.fiesta.horaFin'),    json_extract(data_json,'$.evento.horaFin'),    ''),
  invitados          = COALESCE(json_extract(data_json,'$.fiesta.invitados'),  json_extract(data_json,'$.evento.invitados'),  ''),
  cliente2_nombre    = COALESCE(json_extract(data_json,'$.novio.nombre'),      json_extract(data_json,'$.quinceanera.nombre'), ''),
  quinceanera_nombre = COALESCE(json_extract(data_json,'$.quinceanera.nombre'), ''),
  civil_fecha        = COALESCE(json_extract(data_json,'$.civil.fecha'),        ''),
  civil_hora         = COALESCE(json_extract(data_json,'$.civil.horario'),      ''),
  civil_dir          = COALESCE(json_extract(data_json,'$.civil.direccion'),    ''),
  reli_fecha         = COALESCE(json_extract(data_json,'$.religiosa.fecha'),    ''),
  reli_hora          = COALESCE(json_extract(data_json,'$.religiosa.horario'),  ''),
  reli_dir           = COALESCE(json_extract(data_json,'$.religiosa.direccion'),'')
WHERE data_json IS NOT NULL AND data_json != '{}';
```

- [ ] **Step 2: Ejecutar en D1 remoto**

```powershell
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler d1 execute kuerre-db --remote --file migrate_solicitudes_cols.sql
```

Resultado esperado: `"success": true`. Puede mostrar warnings de columnas duplicadas si alguna ya existe — no es error.

- [ ] **Step 3: Verificar schema**

```powershell
npx wrangler d1 execute kuerre-db --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='solicitudes'"
```

Resultado esperado: ver `cliente2_nombre`, `hora_inicio`, `procesada` en la definición.

---

## Task 3: Worker — Agregar endpoints de contratos

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js`

Agregar tres funciones y tres routes. Las funciones son idénticas a CRP excepto que usan `env.KUERRE_DB` en vez de `env.CRCLUB_DB`, y `env.KUERRE_KV` en vez de `env.CRCLUB_KV`.

- [ ] **Step 1: Agregar las tres funciones antes de `export default`**

Buscar la línea `export default {` (línea ~410) e insertar antes:

```js
// ── Contratos (mismo schema que CRP) ──

async function handleContratosList(env) {
  const { results } = await env.KUERRE_DB.prepare(`
    SELECT c.*, COALESCE(e.fecha, c.fecha_evento) AS fecha_ev, e.tipo, e.nombre AS nombre_evento
    FROM contratos c
    LEFT JOIN eventos e ON e.id = c.evento_id
    ORDER BY c.numero DESC
  `).all();
  return json(results || []);
}

async function handleContratosUpsert(request, env) {
  const body = await request.json().catch(() => ({}));
  const {
    numero, fecha_gen, fecha_evento, cliente, cliente2, lugar, precio, cuotas, estado, doc_url, pdf_url, notas, solicitud_id,
    cliente_dni, cliente_tel, cliente_email,
    cliente2_nac, cliente2_dni, cliente2_dom, cliente2_tel, cliente2_email,
    hora_inicio, hora_fin, direccion, invitados, ciudad, dia_firma, nombre_paquete, servicios,
    contacto_nombre, contacto_rel, contacto_tel,
    civil_fecha, civil_hora, civil_dir,
    reli_fecha, reli_hora, reli_dir,
    formas_pago
  } = body;
  if (!numero) return json({ error: 'numero requerido' }, 400);
  let evento_id = null;
  if (solicitud_id) {
    const sol = await env.KUERRE_DB.prepare('SELECT evento_id FROM solicitudes WHERE id=?').bind(solicitud_id).first();
    evento_id = sol?.evento_id || null;
  }
  await env.KUERRE_DB.prepare(`
    INSERT INTO contratos
      (numero, fecha_gen, fecha_evento, cliente, cliente2, lugar, precio, cuotas, estado, doc_url, pdf_url, notas, evento_id,
       cliente_dni, cliente_tel, cliente_email, cliente2_nac, cliente2_dni, cliente2_dom, cliente2_tel, cliente2_email,
       hora_inicio, hora_fin, direccion, invitados, ciudad, dia_firma, nombre_paquete, servicios,
       contacto_nombre, contacto_rel, contacto_tel, civil_fecha, civil_hora, civil_dir, reli_fecha, reli_hora, reli_dir, formas_pago)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?, ?)
    ON CONFLICT(numero) DO UPDATE SET
      fecha_gen=excluded.fecha_gen, fecha_evento=excluded.fecha_evento,
      cliente=excluded.cliente, cliente2=excluded.cliente2,
      lugar=excluded.lugar, precio=excluded.precio, cuotas=excluded.cuotas, estado=excluded.estado,
      doc_url=excluded.doc_url, pdf_url=excluded.pdf_url, notas=excluded.notas,
      evento_id=COALESCE(excluded.evento_id, contratos.evento_id),
      cliente_dni=excluded.cliente_dni, cliente_tel=excluded.cliente_tel, cliente_email=excluded.cliente_email,
      cliente2_nac=excluded.cliente2_nac, cliente2_dni=excluded.cliente2_dni, cliente2_dom=excluded.cliente2_dom,
      cliente2_tel=excluded.cliente2_tel, cliente2_email=excluded.cliente2_email,
      hora_inicio=excluded.hora_inicio, hora_fin=excluded.hora_fin, direccion=excluded.direccion,
      invitados=excluded.invitados, ciudad=excluded.ciudad, dia_firma=excluded.dia_firma,
      nombre_paquete=excluded.nombre_paquete, servicios=excluded.servicios,
      contacto_nombre=excluded.contacto_nombre, contacto_rel=excluded.contacto_rel, contacto_tel=excluded.contacto_tel,
      civil_fecha=excluded.civil_fecha, civil_hora=excluded.civil_hora, civil_dir=excluded.civil_dir,
      reli_fecha=excluded.reli_fecha, reli_hora=excluded.reli_hora, reli_dir=excluded.reli_dir,
      formas_pago=excluded.formas_pago
  `).bind(
    numero, fecha_gen || '', fecha_evento || '', cliente || '', cliente2 || '', lugar || '',
    precio || 0, cuotas || 1, estado || 'GENERADO',
    doc_url || '', pdf_url || '', notas || '', evento_id,
    cliente_dni || '', cliente_tel || '', cliente_email || '',
    cliente2_nac || '', cliente2_dni || '', cliente2_dom || '', cliente2_tel || '', cliente2_email || '',
    hora_inicio || '', hora_fin || '', direccion || '', invitados || '', ciudad || '',
    dia_firma || '', nombre_paquete || '', servicios || '[]',
    contacto_nombre || '', contacto_rel || '', contacto_tel || '',
    civil_fecha || '', civil_hora || '', civil_dir || '',
    reli_fecha || '', reli_hora || '', reli_dir || '',
    formas_pago || '[]'
  ).run();
  if (fecha_evento) {
    const eid = evento_id || (await env.KUERRE_DB.prepare('SELECT evento_id FROM contratos WHERE numero=?').bind(numero).first())?.evento_id;
    if (eid) {
      await env.KUERRE_DB.prepare('UPDATE eventos SET fecha=? WHERE id=?').bind(fecha_evento, eid).run();
    }
  }
  return json({ ok: true });
}

async function handleContratosDelete(numero, env) {
  const row = await env.KUERRE_DB.prepare('SELECT doc_url, pdf_url FROM contratos WHERE numero=?').bind(numero).first();
  if (!row) return json({ error: 'Contrato no encontrado' }, 404);
  const gasUrl = await env.KUERRE_KV.get('crd_contratos_cfg').then(v => { try { return JSON.parse(v)?.url; } catch(e) { return null; } }).catch(() => null);
  if (gasUrl && (row.doc_url || row.pdf_url)) {
    const docId = row.doc_url ? (row.doc_url.match(/\/d\/([^/?]+)/)?.[1] || null) : null;
    const pdfId = row.pdf_url ? (row.pdf_url.match(/\/d\/([^/?]+)/)?.[1] || null) : null;
    if (docId || pdfId) {
      fetch(gasUrl, { method: 'POST', redirect: 'follow', body: JSON.stringify({ action: 'trashFiles', docId, pdfId }) }).catch(() => {});
    }
  }
  await env.KUERRE_DB.prepare('DELETE FROM contratos WHERE numero=?').bind(numero).run();
  return json({ ok: true });
}
```

- [ ] **Step 2: Agregar las tres routes**

Dentro del bloque `try` del `fetch` handler, antes de la línea `return json({ error: 'Not found' }, 404);`, insertar:

```js
// ── Contratos ──
if (path === '/contratos' && method === 'GET') {
  if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
  return await handleContratosList(env);
}
if (path === '/contratos' && method === 'POST') {
  if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
  return await handleContratosUpsert(request, env);
}
const contratosDelMatch = path.match(/^\/contratos\/(\d+)$/);
if (contratosDelMatch && method === 'DELETE') {
  if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
  return await handleContratosDelete(Number(contratosDelMatch[1]), env);
}
```

- [ ] **Step 3: Deploy del worker**

```powershell
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler deploy
```

Resultado esperado: `Deployed kuerre-worker triggers`.

- [ ] **Step 4: Smoke test — GET /contratos**

```powershell
$jwt = "PEGAR_JWT_ADMIN_KUERRE_AQUI"
Invoke-RestMethod -Uri "https://kuerre-worker.cristian-romero-digital.workers.dev/contratos" -Headers @{ Authorization = "Bearer $jwt" }
```

Resultado esperado: array vacío `[]` (0 contratos aún).

---

## Task 4: Worker — Actualizar handleSolicitudesCreate para poblar columnas individuales

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js` — función `handleSolicitudesCreate` (líneas ~194-248)

Actualmente `handleSolicitudesCreate` extrae algunos campos del body pero no `hora_inicio`, `hora_fin`, `invitados`, `cliente2_nombre`, `quinceanera_nombre`, ni las ceremonias.

- [ ] **Step 1: Actualizar la función para extraer todos los campos**

Reemplazar el bloque de extracción de datos (líneas 199-216) — la parte donde se setean `nombre_display`, `fecha`, `salon`, etc. — con:

```js
  let nombre_display, fecha, salon, direccion, cliente_nombre, cliente_tel, cliente_email;
  let cliente2_nombre = '', quinceanera_nombre = '', hora_inicio = '', hora_fin = '', invitados = '';
  let civil_fecha = '', civil_hora = '', civil_dir = '';
  let reli_fecha = '', reli_hora = '', reli_dir = '';

  if (tipo === 'BODA') {
    const { novia, novio, fiesta, civil, religiosa } = body;
    nombre_display = `${novia?.nombre || ''} & ${novio?.nombre || ''}`;
    fecha = fiesta?.fecha || ''; salon = fiesta?.salon || ''; direccion = fiesta?.direccion || '';
    cliente_nombre = novia?.nombre || ''; cliente_tel = novia?.telefono || ''; cliente_email = novia?.email || '';
    cliente2_nombre = novio?.nombre || '';
    hora_inicio = fiesta?.horaInicio || ''; hora_fin = fiesta?.horaFin || ''; invitados = fiesta?.invitados || '';
    if (civil) { civil_fecha = civil.fecha||''; civil_hora = civil.horario||''; civil_dir = civil.direccion||''; }
    if (religiosa) { reli_fecha = religiosa.fecha||''; reli_hora = religiosa.horario||''; reli_dir = religiosa.direccion||''; }
  } else if (tipo === 'XV') {
    const { quinceanera, cliente, evento } = body;
    nombre_display = `XV ${quinceanera?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
    cliente2_nombre = quinceanera?.nombre || ''; quinceanera_nombre = quinceanera?.nombre || '';
    hora_inicio = evento?.horaInicio || ''; hora_fin = evento?.horaFin || ''; invitados = evento?.invitados || '';
  } else {
    const { cliente, evento } = body;
    nombre_display = `Cumple ${cliente?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
    hora_inicio = evento?.horaInicio || ''; hora_fin = evento?.horaFin || ''; invitados = evento?.invitados || '';
  }
```

- [ ] **Step 2: Actualizar el INSERT de solicitudes para incluir los nuevos campos**

Reemplazar el `INSERT INTO solicitudes` (en el batch, línea ~236) con:

```js
env.KUERRE_DB.prepare(`INSERT INTO solicitudes
  (id, salon, direccion, cliente_nombre, cliente_tel, cliente_email,
   cliente2_nombre, quinceanera_nombre, hora_inicio, hora_fin, invitados,
   civil_fecha, civil_hora, civil_dir, reli_fecha, reli_hora, reli_dir,
   data_json, fiesta_id, invite_slug, evento_id, created_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
  .bind(id, salon, direccion, cliente_nombre, cliente_tel, cliente_email,
    cliente2_nombre, quinceanera_nombre, hora_inicio, hora_fin, invitados,
    civil_fecha, civil_hora, civil_dir, reli_fecha, reli_hora, reli_dir,
    JSON.stringify(body), fiesta_id, id, eventoId, now),
```

- [ ] **Step 3: Deploy nuevamente**

```powershell
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler deploy
```

---

## Task 5: CORE template — agregar fecha_evento al POST body de ctGenerar

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` — función `ctGenerar`, bloque POST a `/contratos` (~línea 8855)

El fix fue aplicado directamente a CRP pero no al template CORE. Esta tarea lo agrega al template.

- [ ] **Step 1: Editar CORE/src/admin.html**

Buscar:
```js
          body: JSON.stringify({
            numero:          json.numero,
            cliente:         _isBoda ? (data.novia?.nombre || '') : (data.cliente?.nombre || ''),
```

Reemplazar con:
```js
          body: JSON.stringify({
            numero:          json.numero,
            fecha_evento:    _isBoda ? (data.fiesta?.fecha || '') : (data.evento?.fecha || ''),
            cliente:         _isBoda ? (data.novia?.nombre || '') : (data.cliente?.nombre || ''),
```

---

## Task 6: KUERRE brand config — patch CT_USE_D1 = true

**Files:**
- Modify: `e:\CLAUDE\CORE\brands\kuerre\config.json`

Agregar un patch nuevo (patch 20) que setee `CT_USE_D1 = true` para KUERRE, igual al patch 14b de CRP.

- [ ] **Step 1: Agregar patch en config.json**

En `patches`, después del último patch existente (patch 19 sobre video section), agregar:

```json
    {
      "_comment": "20. CT_USE_D1 = true para KUERRE (contratos en D1)",
      "find": "const CT_USE_D1  = false; // CRP override: true (uses CLIENTES_WORKER /contratos)",
      "replace": "const CT_USE_D1  = true;"
    }
```

**Verificar:** el `find` es el texto exacto que está en `CORE/src/admin.html` línea con `CT_USE_D1`. Debe matchear exactamente (incluyendo los dos espacios antes del `=`).

---

## Task 7: Rebuild admin KUERRE + bump versión + push

**Files:**
- Rebuilt: `e:\CLAUDE\WEB KUERRE\Productivo\admin.html`
- Rebuilt: `e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html`

- [ ] **Step 1: Rebuildar**

```powershell
cd "e:\CLAUDE\CORE"
node build-admin.cjs kuerre
```

Resultado esperado:
```
  → WEB KUERRE/Productivo/admin.html
  → WEB KUERRE/Desarrollo/admin.html
✅ kuerre built (2 files)
```

- [ ] **Step 2: Verificar que CT_USE_D1 = true está en el output**

```powershell
Select-String "CT_USE_D1" "e:\CLAUDE\WEB KUERRE\Productivo\admin.html"
```

Resultado esperado: `const CT_USE_D1  = true;` (sin el comentario).

- [ ] **Step 3: Verificar que fecha_evento está en ctGenerar POST body**

```powershell
Select-String "fecha_evento" "e:\CLAUDE\WEB KUERRE\Productivo\admin.html"
```

Resultado esperado: al menos 2 líneas — una en el POST body de ctGenerar, otra en el mapping del historial.

- [ ] **Step 4: Bump versión KUERRE**

Buscar la versión actual en `Productivo/admin.html` (ej: `>V1.50<`) y actualizarla a `>V1.51<`.

- [ ] **Step 5: Commit + push KUERRE**

```powershell
cd "e:\CLAUDE\WEB KUERRE\Productivo"
git add admin.html
git commit -m "feat: contratos D1 alineados con CRP — CT_USE_D1=true + fecha_evento V1.51"
git push
```

- [ ] **Step 6: Rebuildar CRP también (para propagar el fix de fecha_evento al template)**

```powershell
cd "e:\CLAUDE\CORE"
node build-admin.cjs crp
```

Luego copiar a Productivo CRP si corresponde (o ignorar si CRP ya tiene el fix directo).

---

## Self-Review

**Spec coverage:**
- ✅ Tabla `contratos` KUERRE → schema CRP (Task 1)
- ✅ Tabla `solicitudes` KUERRE → columnas individuales (Task 2)
- ✅ Worker → endpoints GET/POST/DELETE /contratos (Task 3)
- ✅ Worker → solicitudes create con columnas individuales (Task 4)
- ✅ Admin → `fecha_evento` en POST body (Task 5, via CORE template)
- ✅ Admin → `CT_USE_D1 = true` para KUERRE (Task 6)
- ✅ Deploy + push (Task 7)

**Notas:**
- `data_json` se mantiene en `solicitudes` — no se elimina (otros endpoints como agendar lo usan)
- Los endpoints de solicitudes existentes (`/solicitudes/:id/data`, `/agendar`) que escriben `data_json` no se modifican — dual-write hasta un cleanup futuro
- El `schema.sql` de KUERRE no se actualiza para reflejar la nueva tabla (es documentación, no código ejecutable) — hacerlo es opcional
