# Normalización D1 — evento_id como FK entero

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar `evento_slug TEXT` (FK textual con fecha embebida) por `evento_id INTEGER` (FK a `eventos.id`) en las 4 tablas satelite, y eliminar columnas duplicadas (`fecha`, `tipo`, `nombre`/`nombres`/`nombre_display`) que ahora viven solo en `eventos`.

**Architecture:** Migración en 4 fases: (1) ALTER TABLE en D1 para agregar `evento_id` y hacer backfill desde el slug join, (2) DROP de columnas redundantes, (3) actualización del código worker para usar JOIN en vez de columnas propias, (4) deploy. Las queries de listado hacen `LEFT JOIN eventos ON e.id = s.evento_id` y devuelven `e.fecha`, `e.tipo`, `e.nombre AS nombre_display` — el shape del JSON response no cambia, por lo que el frontend no necesita modificaciones.

**Tech Stack:** Cloudflare D1 (SQLite), Cloudflare Workers, wrangler CLI

## Global Constraints

- CRP D1: database-name `crclub-db`, binding `CRCLUB_DB`, id `c1ee9e54-e490-427c-ae8b-8a9e75340648`
- Kuerre D1: database-name `kuerre-db`, binding `KUERRE_DB`, id `8ea1a29e-942d-40f6-84a3-341e822c4323`
- Backup disponible: `e:\CLAUDE\WEB CRP\worker\backup_20260701_182730.json`
- Workers CRP: `e:\CLAUDE\WEB CRP\worker\src\index.js`
- Workers Kuerre: `e:\CLAUDE\WEB KUERRE\worker\src\index.js`
- Nunca editar `Productivo/admin.html` directamente — se genera con `node build-admin.cjs` en `e:\CLAUDE\CORE\`
- Version bump obligatorio en `CORE/src/admin.html` Y ambos `brands/*/config.json` (find/replace `>V1.XX<`)
- Todos los comandos D1 requieren `--remote` flag para apuntar a producción

## Qué columnas se eliminan y por qué

| Tabla | Columnas eliminadas | De dónde vienen ahora |
|-------|--------------------|-----------------------|
| `solicitudes` | `fecha`, `tipo`, `nombre_display`, `evento_slug` | `eventos.fecha`, `eventos.tipo`, `eventos.nombre` via JOIN |
| `contratos` | `tipo`, `fecha_ev`, `evento_slug` | `eventos.tipo`, `eventos.fecha` via JOIN. Se mantienen `cliente`, `cliente2`, `lugar` (nombres legales específicos del contrato) |
| `entrega_configs` | `fecha`, `tipo`, `nombres`, `evento_slug` | `eventos.fecha`, `eventos.tipo`, `eventos.nombre` via JOIN |
| `eventos_foto` | `fecha`, `nombre`, `evento_slug` | `eventos.fecha`, `eventos.nombre` via JOIN |

---

### Task 1: Migrar D1 CRP — agregar evento_id y backfill

**Files:**
- Modify: D1 `crclub-db` (via wrangler CLI)

- [ ] **Step 1: Agregar columna evento_id a las 4 tablas**

```powershell
cd "e:\CLAUDE\WEB CRP\worker"
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE solicitudes ADD COLUMN evento_id INTEGER DEFAULT NULL" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE contratos ADD COLUMN evento_id INTEGER DEFAULT NULL" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE entrega_configs ADD COLUMN evento_id INTEGER DEFAULT NULL" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE eventos_foto ADD COLUMN evento_id INTEGER DEFAULT NULL" --json
```

Expected: 4 respuestas con `"success": true`

- [ ] **Step 2: Backfill evento_id desde evento_slug**

```powershell
npx wrangler d1 execute crclub-db --remote --command "UPDATE solicitudes SET evento_id = (SELECT id FROM eventos WHERE slug = solicitudes.evento_slug) WHERE evento_slug IS NOT NULL" --json
npx wrangler d1 execute crclub-db --remote --command "UPDATE contratos SET evento_id = (SELECT id FROM eventos WHERE slug = contratos.evento_slug) WHERE evento_slug IS NOT NULL" --json
npx wrangler d1 execute crclub-db --remote --command "UPDATE entrega_configs SET evento_id = (SELECT id FROM eventos WHERE slug = entrega_configs.evento_slug) WHERE evento_slug IS NOT NULL" --json
npx wrangler d1 execute crclub-db --remote --command "UPDATE eventos_foto SET evento_id = (SELECT id FROM eventos WHERE slug = eventos_foto.evento_slug) WHERE evento_slug IS NOT NULL" --json
```

- [ ] **Step 3: Verificar que todos los registros tienen evento_id**

```powershell
npx wrangler d1 execute crclub-db --remote --command "SELECT 'solicitudes' t, COUNT(*) total, SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) sin_id FROM solicitudes UNION ALL SELECT 'contratos', COUNT(*), SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) FROM contratos UNION ALL SELECT 'entrega_configs', COUNT(*), SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) FROM entrega_configs UNION ALL SELECT 'eventos_foto', COUNT(*), SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) FROM eventos_foto" --json
```

Expected: todas las filas con `sin_id = 0`

- [ ] **Step 4: Drop columnas redundantes**

```powershell
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE solicitudes DROP COLUMN fecha" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE solicitudes DROP COLUMN tipo" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE solicitudes DROP COLUMN nombre_display" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE solicitudes DROP COLUMN evento_slug" --json

npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE contratos DROP COLUMN tipo" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE contratos DROP COLUMN fecha_ev" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE contratos DROP COLUMN evento_slug" --json

npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN fecha" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN tipo" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN nombres" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN evento_slug" --json

npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE eventos_foto DROP COLUMN fecha" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE eventos_foto DROP COLUMN nombre" --json
npx wrangler d1 execute crclub-db --remote --command "ALTER TABLE eventos_foto DROP COLUMN evento_slug" --json
```

- [ ] **Step 5: Verificar schema final**

```powershell
npx wrangler d1 execute crclub-db --remote --command "SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('solicitudes','contratos','entrega_configs','eventos_foto')" --json
```

Expected: ninguna tabla tiene `fecha`, `tipo`, `nombre_display`, `nombres`, `nombre`, `evento_slug`. Todas tienen `evento_id`.

---

### Task 2: Migrar D1 Kuerre — agregar evento_id y backfill

**Files:**
- Modify: D1 `kuerre-db` (via wrangler CLI)

- [ ] **Step 1: Agregar evento_id y backfill (mismo proceso que Task 1)**

```powershell
cd "e:\CLAUDE\WEB KUERRE\worker"
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE solicitudes ADD COLUMN evento_id INTEGER DEFAULT NULL" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE contratos ADD COLUMN evento_id INTEGER DEFAULT NULL" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE entrega_configs ADD COLUMN evento_id INTEGER DEFAULT NULL" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE eventos_foto ADD COLUMN evento_id INTEGER DEFAULT NULL" --json

npx wrangler d1 execute kuerre-db --remote --command "UPDATE solicitudes SET evento_id = (SELECT id FROM eventos WHERE slug = solicitudes.evento_slug) WHERE evento_slug IS NOT NULL" --json
npx wrangler d1 execute kuerre-db --remote --command "UPDATE contratos SET evento_id = (SELECT id FROM eventos WHERE slug = contratos.evento_slug) WHERE evento_slug IS NOT NULL" --json
npx wrangler d1 execute kuerre-db --remote --command "UPDATE entrega_configs SET evento_id = (SELECT id FROM eventos WHERE slug = entrega_configs.evento_slug) WHERE evento_slug IS NOT NULL" --json
npx wrangler d1 execute kuerre-db --remote --command "UPDATE eventos_foto SET evento_id = (SELECT id FROM eventos WHERE slug = eventos_foto.evento_slug) WHERE evento_slug IS NOT NULL" --json
```

- [ ] **Step 2: Verificar y Drop columnas (mismo que Task 1 pero con kuerre-db)**

```powershell
npx wrangler d1 execute kuerre-db --remote --command "SELECT 'solicitudes' t, COUNT(*) total, SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) sin_id FROM solicitudes UNION ALL SELECT 'contratos', COUNT(*), SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) FROM contratos UNION ALL SELECT 'entrega_configs', COUNT(*), SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) FROM entrega_configs UNION ALL SELECT 'eventos_foto', COUNT(*), SUM(CASE WHEN evento_id IS NULL THEN 1 ELSE 0 END) FROM eventos_foto" --json

npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE solicitudes DROP COLUMN fecha" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE solicitudes DROP COLUMN tipo" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE solicitudes DROP COLUMN nombre_display" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE solicitudes DROP COLUMN evento_slug" --json

npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE contratos DROP COLUMN tipo" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE contratos DROP COLUMN fecha_ev" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE contratos DROP COLUMN evento_slug" --json

npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN fecha" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN tipo" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN nombres" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE entrega_configs DROP COLUMN evento_slug" --json

npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE eventos_foto DROP COLUMN fecha" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE eventos_foto DROP COLUMN nombre" --json
npx wrangler d1 execute kuerre-db --remote --command "ALTER TABLE eventos_foto DROP COLUMN evento_slug" --json
```

---

### Task 3: Actualizar CRP Worker

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\worker\src\index.js`

Funciones a cambiar: `handleSolicitudesCreate`, `handleSolicitudesList`, `handleContratosList`, `handleContratosUpsert`, `handleHubUpsert` (remover cascade), `handleHubView`, `handleHubLink`.

- [ ] **Step 1: handleSolicitudesCreate — usar evento_id**

Reemplazar la función completa (líneas 1096–1175):

```javascript
async function handleSolicitudesCreate(request, env) {
  const body = await request.json();
  const { tipo } = body;
  if (!tipo || !['BODA','XV','CUMPLE'].includes(tipo)) {
    return json({ error: 'tipo inválido' }, 400);
  }

  let nombre_display, fecha, salon, direccion, cliente_nombre, cliente_tel, cliente_email;

  if (tipo === 'BODA') {
    const { novia, novio, fiesta } = body;
    nombre_display = `${novia?.nombre || ''} & ${novio?.nombre || ''}`;
    fecha = fiesta?.fecha || '';
    salon = fiesta?.salon || '';
    direccion = fiesta?.direccion || '';
    cliente_nombre = novia?.nombre || '';
    cliente_tel = novia?.telefono || '';
    cliente_email = novia?.email || '';
  } else if (tipo === 'XV') {
    const { quinceanera, cliente, evento } = body;
    nombre_display = `XV ${quinceanera?.nombre || ''}`;
    fecha = evento?.fecha || '';
    salon = evento?.salon || '';
    direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || '';
    cliente_tel = cliente?.telefono || '';
    cliente_email = cliente?.email || '';
  } else {
    const { cliente, evento } = body;
    nombre_display = `Cumple ${cliente?.nombre || ''}`;
    fecha = evento?.fecha || '';
    salon = evento?.salon || '';
    direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || '';
    cliente_tel = cliente?.telefono || '';
    cliente_email = cliente?.email || '';
  }

  if (!fecha) return json({ error: 'Fecha del evento requerida' }, 400);

  const now = nowISO();
  const eventoSlug = nombre_display.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    + '-' + fecha;

  // Upsert evento, luego obtener su id (no podemos usar lastRowId con INSERT OR IGNORE)
  await env.CRCLUB_DB.prepare(`
    INSERT OR IGNORE INTO eventos (slug, nombre, fecha, tipo, qr, pm, inv)
    VALUES (?, ?, ?, ?, 1, 1, 1)
  `).bind(eventoSlug, nombre_display, fecha, tipo).run();
  const eventoRow = await env.CRCLUB_DB.prepare('SELECT id FROM eventos WHERE slug=?').bind(eventoSlug).first();
  const eventoId = eventoRow.id;

  for (let attempt = 0; attempt < 2; attempt++) {
    const id = generateEventId();
    const fiesta_id = generateEventId();
    try {
      await env.CRCLUB_DB.batch([
        env.CRCLUB_DB.prepare(`
          INSERT INTO solicitudes
            (id, salon, direccion, cliente_nombre, cliente_tel, cliente_email,
             data_json, fiesta_id, invite_slug, evento_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, salon, direccion, cliente_nombre, cliente_tel, cliente_email,
            JSON.stringify(body), fiesta_id, id, eventoId, now),
        env.CRCLUB_DB.prepare(`
          INSERT INTO eventos_foto
            (id, cierre_auto, folder_id, portada, estado, moderacion, storage, evento_id, created_at)
          VALUES (?, NULL, '', NULL, 'pendiente', 0, 'r2', ?, ?)
        `).bind(fiesta_id, eventoId, now),
        env.CRCLUB_DB.prepare(`
          INSERT INTO entrega_configs
            (id, folder_id, portada, overlay, allow_dl, evento_id, created_at)
          VALUES (?, '', '', 'violeta', 1, ?, ?)
        `).bind(id, eventoId, now),
      ]);
      return json({ ok: true, id });
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
}
```

- [ ] **Step 2: handleSolicitudesList — JOIN eventos**

Buscar la query actual que tiene `SELECT s.*` y reemplazarla:

```javascript
// Dentro de handleSolicitudesList, el SELECT principal:
    env.CRCLUB_DB.prepare(`
      SELECT s.*,
             e.fecha, e.tipo, e.nombre AS nombre_display,
             ef.estado    AS fiesta_estado,
             ec.folder_id AS entrega_folder
      FROM solicitudes s
      LEFT JOIN eventos          e  ON e.id  = s.evento_id
      LEFT JOIN eventos_foto    ef ON ef.id = s.fiesta_id
      LEFT JOIN entrega_configs ec ON ec.id = s.id
      ${whereClause}
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, limit, offset).all(),
```

Y en las condiciones de búsqueda, cambiar `s.nombre_display` por `e.nombre`:

```javascript
conditions.push('(e.nombre LIKE ? OR s.cliente_nombre LIKE ? OR s.cliente_tel LIKE ?)');
```

- [ ] **Step 3: handleContratosList — JOIN eventos**

```javascript
async function handleContratosList(env) {
  const { results } = await env.CRCLUB_DB.prepare(`
    SELECT c.*, e.fecha AS fecha_ev, e.tipo, e.nombre AS nombre_evento
    FROM contratos c
    LEFT JOIN eventos e ON e.id = c.evento_id
    ORDER BY c.numero DESC
  `).all();
  return json(results || []);
}
```

- [ ] **Step 4: handleContratosUpsert — usar evento_id**

```javascript
async function handleContratosUpsert(request, env) {
  const body = await request.json();
  const { numero, fecha_gen, cliente, cliente2, lugar, precio, cuotas, estado, doc_url, pdf_url, notas, form_data, solicitud_id } = body;
  if (!numero) return json({ error: 'numero requerido' }, 400);

  let evento_id = null;
  if (solicitud_id) {
    const sol = await env.CRCLUB_DB.prepare('SELECT evento_id FROM solicitudes WHERE id=?').bind(solicitud_id).first();
    evento_id = sol?.evento_id || null;
  }

  await env.CRCLUB_DB.prepare(
    `INSERT INTO contratos (numero, fecha_gen, cliente, cliente2, lugar, precio, cuotas, estado, doc_url, pdf_url, notas, form_data, evento_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(numero) DO UPDATE SET
       fecha_gen=excluded.fecha_gen, cliente=excluded.cliente, cliente2=excluded.cliente2,
       lugar=excluded.lugar, precio=excluded.precio, cuotas=excluded.cuotas, estado=excluded.estado,
       doc_url=excluded.doc_url, pdf_url=excluded.pdf_url, notas=excluded.notas, form_data=excluded.form_data,
       evento_id=COALESCE(excluded.evento_id, contratos.evento_id)`
  ).bind(
    numero, fecha_gen || '', cliente || '', cliente2 || '', lugar || '',
    precio || 0, cuotas || 1, estado || 'GENERADO',
    doc_url || '', pdf_url || '', notas || '', form_data || '{}', evento_id
  ).run();
  return json({ ok: true });
}
```

- [ ] **Step 5: handleHubUpsert — remover cascade**

```javascript
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
```

- [ ] **Step 6: handleHubView — query por evento_id**

```javascript
async function handleHubView(slug, env) {
  const evento = await env.CRCLUB_DB.prepare('SELECT * FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'not found' }, 404);
  const [sols, cts, ents, qrs] = await Promise.all([
    env.CRCLUB_DB.prepare('SELECT id, cliente_nombre, cliente_tel FROM solicitudes WHERE evento_id=?').bind(evento.id).all(),
    env.CRCLUB_DB.prepare('SELECT numero, cliente, cliente2, precio FROM contratos WHERE evento_id=?').bind(evento.id).all(),
    env.CRCLUB_DB.prepare('SELECT id FROM entrega_configs WHERE evento_id=?').bind(evento.id).all(),
    env.CRCLUB_DB.prepare('SELECT id FROM eventos_foto WHERE evento_id=?').bind(evento.id).all(),
  ]);
  return json({ ...evento, solicitudes: sols.results || [], contratos: cts.results || [], entregas: ents.results || [], qr_eventos: qrs.results || [] });
}
```

- [ ] **Step 7: handleHubLink — set evento_id**

```javascript
async function handleHubLink(slug, request, env) {
  const { table, id } = await request.json();
  const pkCol = { solicitudes: 'id', contratos: 'numero', entrega_configs: 'id', eventos_foto: 'id' };
  if (!pkCol[table]) return json({ error: 'tabla inválida: usar solicitudes|contratos|entrega_configs|eventos_foto' }, 400);
  const evento = await env.CRCLUB_DB.prepare('SELECT id FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'evento no encontrado' }, 404);
  await env.CRCLUB_DB.prepare(`UPDATE ${table} SET evento_id=? WHERE ${pkCol[table]}=?`).bind(evento.id, id).run();
  return json({ ok: true });
}
```

---

### Task 4: Actualizar Kuerre Worker

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js`

Mismas funciones que Task 3, pero binding `env.KUERRE_DB` en lugar de `env.CRCLUB_DB`. Los cambios son idénticos en lógica.

- [ ] **Step 1: handleSolicitudesCreate**

```javascript
async function handleSolicitudesCreate(request, env) {
  const body = await request.json();
  const { tipo } = body;
  if (!tipo || !['BODA','XV','CUMPLE'].includes(tipo)) return json({ error: 'tipo inválido' }, 400);

  let nombre_display, fecha, salon, direccion, cliente_nombre, cliente_tel, cliente_email;
  if (tipo === 'BODA') {
    const { novia, novio, fiesta } = body;
    nombre_display = `${novia?.nombre || ''} & ${novio?.nombre || ''}`;
    fecha = fiesta?.fecha || ''; salon = fiesta?.salon || ''; direccion = fiesta?.direccion || '';
    cliente_nombre = novia?.nombre || ''; cliente_tel = novia?.telefono || ''; cliente_email = novia?.email || '';
  } else if (tipo === 'XV') {
    const { quinceanera, cliente, evento } = body;
    nombre_display = `XV ${quinceanera?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
  } else {
    const { cliente, evento } = body;
    nombre_display = `Cumple ${cliente?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
  }
  if (!fecha) return json({ error: 'Fecha del evento requerida' }, 400);

  const now = nowISO();
  const eventoSlug = nombre_display.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + fecha;

  await env.KUERRE_DB.prepare(`INSERT OR IGNORE INTO eventos (slug,nombre,fecha,tipo,qr,pm,inv) VALUES (?,?,?,?,1,1,1)`)
    .bind(eventoSlug, nombre_display, fecha, tipo).run();
  const eventoRow = await env.KUERRE_DB.prepare('SELECT id FROM eventos WHERE slug=?').bind(eventoSlug).first();
  const eventoId = eventoRow.id;

  for (let attempt = 0; attempt < 2; attempt++) {
    const id = generateEventId();
    const fiesta_id = generateEventId();
    try {
      await env.KUERRE_DB.batch([
        env.KUERRE_DB.prepare(`INSERT INTO solicitudes (id,salon,direccion,cliente_nombre,cliente_tel,cliente_email,data_json,fiesta_id,invite_slug,evento_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, salon, direccion, cliente_nombre, cliente_tel, cliente_email, JSON.stringify(body), fiesta_id, id, eventoId, now),
        env.KUERRE_DB.prepare(`INSERT INTO eventos_foto (id,cierre_auto,folder_id,portada,estado,moderacion,storage,evento_id,created_at) VALUES (?,NULL,'',NULL,'pendiente',0,'r2',?,?)`)
          .bind(fiesta_id, eventoId, now),
        env.KUERRE_DB.prepare(`INSERT INTO entrega_configs (id,folder_id,portada,overlay,allow_dl,evento_id,created_at) VALUES (?,'',' ','violeta',1,?,?)`)
          .bind(id, eventoId, now),
      ]);
      return json({ ok: true, id });
    } catch (e) { if (attempt === 1) throw e; }
  }
}
```

- [ ] **Step 2: handleHubUpsert — remover cascade (Kuerre)**

```javascript
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
```

- [ ] **Step 3: handleHubView — query por evento_id (Kuerre)**

```javascript
async function handleHubView(slug, db) {
  const evento = await db.prepare('SELECT * FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'not found' }, 404);
  const [sols, cts, ents, qrs] = await Promise.all([
    db.prepare('SELECT id, cliente_nombre, cliente_tel FROM solicitudes WHERE evento_id=?').bind(evento.id).all(),
    db.prepare('SELECT numero, cliente, cliente2, precio FROM contratos WHERE evento_id=?').bind(evento.id).all(),
    db.prepare('SELECT id FROM entrega_configs WHERE evento_id=?').bind(evento.id).all(),
    db.prepare('SELECT id FROM eventos_foto WHERE evento_id=?').bind(evento.id).all(),
  ]);
  return json({ ...evento, solicitudes: sols.results || [], contratos: cts.results || [], entregas: ents.results || [], qr_eventos: qrs.results || [] });
}
```

- [ ] **Step 4: handleHubLink — set evento_id (Kuerre)**

```javascript
async function handleHubLink(slug, request, db) {
  const { table, id } = await request.json();
  const pkCol = { solicitudes: 'id', contratos: 'numero', entrega_configs: 'id', eventos_foto: 'id' };
  if (!pkCol[table]) return json({ error: 'tabla inválida: usar solicitudes|contratos|entrega_configs|eventos_foto' }, 400);
  const evento = await db.prepare('SELECT id FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'evento no encontrado' }, 404);
  await db.prepare(`UPDATE ${table} SET evento_id=? WHERE ${pkCol[table]}=?`).bind(evento.id, id).run();
  return json({ ok: true });
}
```

- [ ] **Step 5: handleContratosList y handleContratosUpsert en Kuerre** — buscar en el worker Kuerre las funciones equivalentes y aplicar el mismo JOIN y cambio de evento_id.

---

### Task 5: Actualizar schema.sql

**Files:**
- Modify: `e:\CLAUDE\WEB CRP\worker\schema.sql`
- Modify: `e:\CLAUDE\WEB KUERRE\worker\schema.sql`

- [ ] **Step 1: Actualizar schema CRP** — reflejar el schema normalizado final en `solicitudes`, `contratos`, `entrega_configs`, `eventos_foto`.

El nuevo schema de las 4 tablas:

```sql
CREATE TABLE IF NOT EXISTS solicitudes (
  id               TEXT PRIMARY KEY,
  salon            TEXT DEFAULT '',
  direccion        TEXT DEFAULT '',
  cliente_nombre   TEXT DEFAULT '',
  cliente_tel      TEXT DEFAULT '',
  cliente_email    TEXT DEFAULT '',
  data_json        TEXT NOT NULL,
  fiesta_id        TEXT DEFAULT '',
  invite_slug      TEXT DEFAULT '',
  codigo_contrato  TEXT DEFAULT '',
  drive_cliente_id TEXT DEFAULT '',
  drive_fiesta_id  TEXT DEFAULT '',
  drive_entrega_id TEXT DEFAULT '',
  drive_contrato_id   TEXT DEFAULT '',
  drive_invitacion_id TEXT DEFAULT '',
  evento_id        INTEGER DEFAULT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entrega_configs (
  id          TEXT PRIMARY KEY,
  folder_id   TEXT DEFAULT '',
  portada     TEXT DEFAULT '',
  overlay     TEXT DEFAULT 'violeta',
  allow_dl    INTEGER DEFAULT 1,
  evento_id   INTEGER DEFAULT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contratos (
  numero    INTEGER PRIMARY KEY,
  fecha_gen TEXT DEFAULT '',
  cliente   TEXT DEFAULT '',
  cliente2  TEXT DEFAULT '',
  lugar     TEXT DEFAULT '',
  precio    INTEGER DEFAULT 0,
  cuotas    INTEGER DEFAULT 1,
  estado    TEXT DEFAULT 'GENERADO',
  doc_url   TEXT DEFAULT '',
  pdf_url   TEXT DEFAULT '',
  notas     TEXT DEFAULT '',
  form_data TEXT DEFAULT '{}',
  evento_id INTEGER DEFAULT NULL
);

CREATE TABLE IF NOT EXISTS eventos_foto (
  id          TEXT PRIMARY KEY,
  cierre_auto TEXT,
  folder_id   TEXT NOT NULL,
  portada     TEXT,
  estado      TEXT DEFAULT 'activo',
  moderacion  INTEGER DEFAULT 0,
  storage     TEXT DEFAULT 'r2',
  evento_id   INTEGER DEFAULT NULL,
  created_at  TEXT NOT NULL
);
```

---

### Task 6: Deploy

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html` (bump versión)
- Modify: `e:\CLAUDE\CORE\brands\crp\config.json` (bump versión)
- Modify: `e:\CLAUDE\CORE\brands\kuerre\config.json` (bump versión)

- [ ] **Step 1: Bump versión** — buscar `>V1.76<` en `CORE/src/admin.html` y reemplazar por `>V1.77<`. Mismo en ambos `config.json` (find `>V1.76<` → replace `>V1.77<`).

- [ ] **Step 2: Build admin**

```powershell
cd "e:\CLAUDE\CORE"; node build-admin.cjs
```

Expected: `✓ WEB CRP/Productivo/admin.html`, `✓ WEB KUERRE/Productivo/admin.html`, `✓ WEB KUERRE/Desarrollo/admin.html`

- [ ] **Step 3: Deploy CRP worker**

```powershell
cd "e:\CLAUDE\WEB CRP\worker"; npx wrangler deploy 2>&1 | Select-String "Deployed|error"
```

- [ ] **Step 4: Deploy Kuerre worker**

```powershell
cd "e:\CLAUDE\WEB KUERRE\worker"; npx wrangler deploy 2>&1 | Select-String "Deployed|error"
```

- [ ] **Step 5: Git push CRP Productivo**

```powershell
cd "e:\CLAUDE\WEB CRP\Productivo"
git add admin.html
git commit -m "V1.77 — normalizacion DB: evento_id INTEGER FK, eliminar columnas duplicadas"
git push
```

- [ ] **Step 6: Git push Kuerre**

```powershell
cd "e:\CLAUDE\WEB KUERRE"
git add Productivo/admin.html Desarrollo/admin.html worker/src/index.js worker/schema.sql
git commit -m "V1.77 — normalizacion DB: evento_id INTEGER FK, eliminar columnas duplicadas"
git push origin main

# Sync gh-pages
cd "e:\CLAUDE\WEB KUERRE\.worktrees\gh-pages"
git checkout gh-pages
git merge main --no-edit
git push origin gh-pages
```

- [ ] **Step 7: Verificar en prod** — abrir admin CRP, ir a Clientes, confirmar que Barbara Hernandez Correa muestra la fecha correcta desde el hub. Cambiar la fecha en Eventos Hub y verificar que la lista de clientes actualiza sin cascade.
