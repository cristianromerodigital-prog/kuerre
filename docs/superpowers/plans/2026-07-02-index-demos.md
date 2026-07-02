# Index Kuerre — Demos Vivas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conectar el index de Kuerre con demos reales de los 3 servicios (evento demo permanente con reset nocturno), QR escaneable, micro-animaciones en los mockups y modal demo on-click — todo en `index2.html` sin tocar el index actual.

**Architecture:** El worker gana 3 piezas: rutas `GET/POST /invite/{slug}` (hoy no existen — el admin ya las llama y cae al fallback `?c=`), endpoints de seed/reset del evento demo, y un handler `scheduled()` con cron diario. El frontend se trabaja íntegro en `Desarrollo/index2.html` (copia de `index.html`); al aprobar, reemplaza a `index.html`.

**Tech Stack:** Vanilla HTML/CSS/JS inline (sin build), Cloudflare Worker `kuerre-worker` (D1 `KUERRE_DB`, KV `KUERRE_KV`, R2 `MEDIA`), wrangler.

**Spec:** `docs/superpowers/specs/2026-07-02-index-demos-design.md`

## Global Constraints

- CSS y JS siempre inline dentro del HTML (convención del proyecto).
- No tocar `Desarrollo/index.html` — todo cambio de landing va en `Desarrollo/index2.html`.
- Edits parciales con Edit tool; nunca reescribir archivos existentes completos.
- No hay framework de tests en este proyecto: cada task cierra con verificación manual (curl / navegador) antes de commit.
- Versión: `index2.html` arranca con `KVER='1.41'` y `v1.41` en el topbar.
- Deploy (Productivo + push + gh-pages) SOLO cuando Cristian diga "subilo". El worker sí se deploya en Task 2 (necesario para probar).
- Slug demo: `demo`. URLs demo relativas en el index: `invite.html?i=demo`, `fiestas.html?e=demo`, `premiere.html?e=demo`. URL absoluta para el QR: `https://kuerre.com.ar/fiestas.html?e=demo`.
- Claves KV nuevas: `invite_cfg_{slug}` (config invitación), `fiesta_slug_demo` (ya existe el patrón `fiesta_slug_*`), `demo_seed` (snapshot seed).
- Commits en `e:\CLAUDE\WEB KUERRE` (repo main). Mensajes descriptivos.

---

### Task 1: Rutas `/invite/{slug}` en el worker (GET público + POST auth, fecha dinámica para `demo`)

**Files:**
- Modify: `worker/src/index.js` (insertar antes del bloque `// ── KV directo` ~línea 644)

**Interfaces:**
- Produces: `GET /invite/{slug}` → JSON config (200) o `{error}` (404). Para slug `demo`, `fecha_iso` y `fecha_display` se recalculan a hoy+21 días. `POST /invite/{slug}` con header `Authorization: {CF_AUTH_TOKEN}` guarda el body JSON en KV `invite_cfg_{slug}`.
- Consumes: nada nuevo. `invite.html` (línea 504) y `admin` (CORE línea 6241) ya llaman estas rutas.

- [ ] **Step 1: Agregar las rutas**

En `worker/src/index.js`, insertar ANTES del comentario `// ── KV directo (branding settings read/write)`:

```js
      // ── Invitaciones: config por slug ──────────────────────────────────────
      const invCfgMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})$/);
      if (invCfgMatch && method === 'GET') {
        const slug = invCfgMatch[1];
        const raw = await env.KUERRE_KV.get('invite_cfg_' + slug);
        if (!raw) return json({ error: 'Not found' }, 404);
        let cfg;
        try { cfg = JSON.parse(raw); } catch { return json({ error: 'Config inválida' }, 500); }
        if (slug === 'demo') {
          const d = new Date(Date.now() + 21 * 86400000);
          cfg.fecha_iso = d.toISOString().slice(0, 10) + 'T21:00:00';
          cfg.fecha_display = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
        }
        return json(cfg);
      }
      if (invCfgMatch && method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        if (!env.CF_AUTH_TOKEN || auth !== env.CF_AUTH_TOKEN) return json({ error: 'Unauthorized' }, 401);
        const body = await request.text();
        try { JSON.parse(body); } catch { return json({ error: 'JSON inválido' }, 400); }
        await env.KUERRE_KV.put('invite_cfg_' + invCfgMatch[1], body);
        return json({ ok: true });
      }
```

Nota: `invite.html` espera el objeto config directo (hace `if (data && typeof data === 'object') return data;`) — devolver el config plano, sin envolver.

- [ ] **Step 2: Deploy y verificar**

```bash
cd "e:/CLAUDE/WEB KUERRE/worker" && npx wrangler deploy
```

Verificar (usar el CF_AUTH_TOKEN real — pedírselo a Cristian o leerlo de la config del admin):

```bash
curl -s -X POST "https://kuerre-worker.cristian-romero-digital.workers.dev/invite/demo" -H "Authorization: $CF_AUTH" -H "Content-Type: application/json" -d '{"novios":"Sofía & Mateo","fecha_iso":"2027-02-14T21:00:00","fecha_display":"14 de febrero de 2027"}'
# Esperado: {"ok":true}
curl -s "https://kuerre-worker.cristian-romero-digital.workers.dev/invite/demo"
# Esperado: config con fecha_iso ~21 días en el futuro (NO 2027-02-14) y fecha_display en español
curl -s "https://kuerre-worker.cristian-romero-digital.workers.dev/invite/no-existe"
# Esperado: {"error":"Not found"}
```

- [ ] **Step 3: Commit**

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add worker/src/index.js && git commit -m "worker: rutas GET/POST /invite/{slug} con fecha dinamica para slug demo"
```

---

### Task 2: Seed snapshot + reset del evento demo + cron nocturno

**Files:**
- Modify: `worker/src/index.js` (función top-level `resetDemoEvent` + 2 rutas admin + handler `scheduled` en el export default)
- Modify: `worker/wrangler.toml` (agregar `[triggers]`)

**Interfaces:**
- Consumes: KV `fiesta_slug_demo` → ID real (6 chars `[A-Z2-9]`) del evento demo (se crea en Task 3). R2 keys `eventos/{id}/...` (formato existente del upload, línea 104). Tablas `foto_likes(evento_id, foto_id)` y `evento_frases(id, evento_id)`.
- Produces: `POST /api/demo/seed-snapshot` (admin JWT) → `{ok, fotos, frases}`; guarda KV `demo_seed` = `{keys:[], fraseIds:[], at}`. `POST /api/demo/reset` (admin JWT) → `{ok, deleted}`. Cron diario 08:00 UTC (05:00 ART) ejecuta el mismo reset.

- [ ] **Step 1: Agregar `resetDemoEvent` como función top-level**

En `worker/src/index.js`, después de `handleFotoListR2` (línea ~167):

```js
async function resetDemoEvent(env) {
  const demoId = await env.KUERRE_KV.get('fiesta_slug_demo');
  if (!demoId) return { ok: false, error: 'fiesta_slug_demo no configurado' };
  let seed = { keys: [], fraseIds: [] };
  try { seed = JSON.parse(await env.KUERRE_KV.get('demo_seed')) || seed; } catch {}
  const seedKeys = new Set(seed.keys || []);
  const listed = await env.MEDIA.list({ prefix: `eventos/${demoId}/` });
  let deleted = 0;
  for (const obj of (listed.objects || [])) {
    if (seedKeys.has(obj.key)) continue;
    await env.MEDIA.delete(obj.key);
    await env.KUERRE_DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(demoId, obj.key).run();
    deleted++;
  }
  const fraseIds = (seed.fraseIds || []).map(Number).filter(n => !isNaN(n));
  if (fraseIds.length) {
    const ph = fraseIds.map(() => '?').join(',');
    await env.KUERRE_DB.prepare(`DELETE FROM evento_frases WHERE evento_id=? AND id NOT IN (${ph})`).bind(demoId, ...fraseIds).run();
  } else {
    await env.KUERRE_DB.prepare('DELETE FROM evento_frases WHERE evento_id=?').bind(demoId).run();
  }
  return { ok: true, deleted };
}
```

- [ ] **Step 2: Agregar rutas admin de snapshot y reset manual**

Insertar junto a las rutas de Task 1 (antes de `// ── KV directo`):

```js
      // ── Demo: snapshot de seed y reset manual ──────────────────────────────
      if (path === '/api/demo/seed-snapshot' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const demoId = await env.KUERRE_KV.get('fiesta_slug_demo');
        if (!demoId) return json({ error: 'fiesta_slug_demo no configurado' }, 400);
        const listed = await env.MEDIA.list({ prefix: `eventos/${demoId}/` });
        const keys = (listed.objects || []).map(o => o.key);
        const { results } = await env.KUERRE_DB.prepare('SELECT id FROM evento_frases WHERE evento_id=?').bind(demoId).all();
        const fraseIds = (results || []).map(r => r.id);
        await env.KUERRE_KV.put('demo_seed', JSON.stringify({ keys, fraseIds, at: new Date().toISOString() }));
        return json({ ok: true, fotos: keys.length, frases: fraseIds.length });
      }
      if (path === '/api/demo/reset' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return json(await resetDemoEvent(env));
      }
```

- [ ] **Step 3: Handler `scheduled` en el export default**

En `worker/src/index.js` línea ~520, el export default hoy solo tiene `fetch`. Agregar después del cierre de `fetch` (la coma tras `},` en la penúltima línea):

```js
  async scheduled(event, env, ctx) {
    ctx.waitUntil(resetDemoEvent(env).catch(e => console.error('[DEMO RESET]', e.message)));
  },
```

- [ ] **Step 4: Cron en wrangler.toml**

Agregar al final de `worker/wrangler.toml`:

```toml
[triggers]
crons = ["0 8 * * *"]
```

- [ ] **Step 5: Deploy y verificar**

```bash
cd "e:/CLAUDE/WEB KUERRE/worker" && npx wrangler deploy
# Verificar en el output que lista el cron trigger "0 8 * * *"
```

Login admin para obtener JWT y probar (las rutas devuelven error controlado mientras no exista el evento demo):

```bash
TOKEN=$(curl -s -X POST "https://kuerre-worker.cristian-romero-digital.workers.dev/admin/login" -H "Content-Type: application/json" -d '{"user":"<ADMIN_USER>","pass":"<ADMIN_PASS>"}' | python -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
curl -s -X POST "https://kuerre-worker.cristian-romero-digital.workers.dev/api/demo/reset" -H "Authorization: Bearer $TOKEN"
# Esperado AHORA (sin evento demo): {"ok":false,"error":"fiesta_slug_demo no configurado"}
curl -s "https://kuerre-worker.cristian-romero-digital.workers.dev/api/health"
# Esperado: {"ok":true,...} — el worker sigue vivo tras el deploy
```

Regla de memoria `feedback_gas_deploy_riesgo`: tras el deploy, probar también una ruta existente crítica (ej. `GET /site/config`) para confirmar cero regresión.

- [ ] **Step 6: Commit**

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add worker/src/index.js worker/wrangler.toml && git commit -m "worker: reset nocturno evento demo (cron 05:00 ART) + endpoints seed-snapshot y reset manual"
```

---

### Task 3: Crear el evento demo "Sofía & Mateo" (colaborativa — requiere fotos de Cristian)

**Files:** ninguno (datos en D1/KV/R2 + admin UI)

**Interfaces:**
- Consumes: rutas de Task 1 y 2 ya deployadas.
- Produces: KV `fiesta_slug_demo` → ID del evento; `invite_cfg_demo`; galería `fiestas.html?e=demo` con seed; premiere demo; snapshot `demo_seed`.

- [ ] **Step 1: Crear el evento desde el admin** (Cristian o guiado)

En `https://kuerre-worker.cristian-romero-digital.workers.dev/admin`: crear evento hub "Sofía & Mateo" (tipo casamiento, fecha cualquiera futura) y activarle el servicio QR Fiestas (estado activo, storage r2, moderación ON si `OPENAI_KEY` está configurada — recomendado para la demo pública). Anotar el ID de 6 caracteres del servicio fiesta.

- [ ] **Step 2: Mapear el slug `demo`**

```bash
cd "e:/CLAUDE/WEB KUERRE/worker" && npx wrangler kv key put --namespace-id d6467ee2136446f48c6bc2527d1e68a4 "fiesta_slug_demo" "<ID6>" --remote
```

Verificar: `https://kuerre.com.ar/fiestas.html?e=demo` carga la galería vacía (o probar con `Desarrollo/fiestas.html` local apuntando al mismo worker).

- [ ] **Step 3: Config de invitación demo**

Crear la invitación "Sofía & Mateo" en el admin (sección Invitaciones) con textos/música/foto de portada. Copiar su config generada y duplicarla al slug fijo:

```bash
curl -s -X POST "https://kuerre-worker.cristian-romero-digital.workers.dev/invite/demo" -H "Authorization: $CF_AUTH" -H "Content-Type: application/json" -d @invite-demo-config.json
```

Verificar: `invite.html?i=demo` abre con countdown ~21 días (la fecha la pisa el worker).

- [ ] **Step 4: Premiere demo**

Crear entrega Premiere para el evento demo desde el admin con slug/id `demo` (fotos + video de muestra de Cristian). Verificar: `premiere.html?e=demo` carga.

- [ ] **Step 5: Fotos seed + snapshot**

Cristian sube ~15 fotos reales por la propia galería demo (`fiestas.html?e=demo`) — así quedan con el formato de key correcto. Después:

```bash
curl -s -X POST "https://kuerre-worker.cristian-romero-digital.workers.dev/api/demo/seed-snapshot" -H "Authorization: Bearer $TOKEN"
# Esperado: {"ok":true,"fotos":15,"frases":N}
```

- [ ] **Step 6: Probar el ciclo de reset completo**

Subir 1 foto de prueba extra a la galería demo, luego:

```bash
curl -s -X POST "https://kuerre-worker.cristian-romero-digital.workers.dev/api/demo/reset" -H "Authorization: Bearer $TOKEN"
# Esperado: {"ok":true,"deleted":1} — y la galería vuelve a mostrar solo las 15 seed
```

---

### Task 4: `index2.html` — copia, botones "Ver demo en vivo" y FAQ

**Files:**
- Create: `Desarrollo/index2.html` (copia de `Desarrollo/index.html`)
- Modify: `Desarrollo/index2.html`

**Interfaces:**
- Produces: `index2.html` con `KVER='1.41'`, un botón demo por sección feature (`#inv-demo-btn`, `#qr-demo-btn`, `#pm-demo-btn`) y FAQ actualizada. Los ids nuevos NO existen en el CMS (`applyContent`) — no hay riesgo de que el KV los pise.

- [ ] **Step 1: Copiar y versionar**

```powershell
Copy-Item "e:\CLAUDE\WEB KUERRE\Desarrollo\index.html" "e:\CLAUDE\WEB KUERRE\Desarrollo\index2.html"
```

En `index2.html`: `var KVER='1.38'` → `'1.41'` y `v1.40` (span `#site-version`) → `v1.41`.

- [ ] **Step 2: Botones demo en las 3 secciones**

En cada sección feature, envolver el botón existente y agregar el demo. Ejemplo Invitaciones (repetir el patrón en `#qr-fiestas` con `fiestas.html?e=demo` id `qr-demo-btn`, y en `#premiere` con `premiere.html?e=demo` id `pm-demo-btn`):

```html
<!-- antes -->
<a href="https://wa.me/..." target="_blank" class="btn-primary" id="inv-btn" style="width:fit-content">Consultar precio</a>
<!-- después -->
<div class="feat-actions">
  <a href="https://wa.me/..." target="_blank" class="btn-primary" id="inv-btn">Consultar precio</a>
  <a href="invite.html?i=demo" target="_blank" class="btn-secondary" id="inv-demo-btn">Ver demo en vivo →</a>
</div>
```

CSS (junto a `.feat-list` en el `<style>`):

```css
.feat-actions { display:flex; gap:12px; flex-wrap:wrap; align-items:center; }
```

- [ ] **Step 3: FAQ**

Reemplazar la respuesta de "¿Puedo ver una demo antes de contratar?":

```html
<div class="faq-a">Sí, y no hace falta pedirla: en esta misma página tenés el botón "Ver demo en vivo" en cada servicio. Abrí la invitación demo, subí una foto a la galería QR o mirá una entrega Premiere real. Sin compromiso.</div>
```

Además: `curl -s https://kuerre-worker.cristian-romero-digital.workers.dev/crd_content` — si el JSON trae `faq.items`, el CMS pisa el HTML estático; actualizar ese item también en el KV (vía admin CMS o `POST /crd_content` con CF_AUTH, mergeando el JSON existente — nunca sobreescribir el resto).

- [ ] **Step 4: Verificar y commit**

Abrir `Desarrollo/index2.html` en el navegador: 3 botones demo visibles y funcionales (abren las URLs demo en pestaña nueva), FAQ correcta, cero errores en consola.

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add Desarrollo/index2.html && git commit -m "index2: copia de index V1.41 con botones 'Ver demo en vivo' y FAQ actualizada"
```

---

### Task 5: QR escaneable en la sección QR Fiestas

**Files:**
- Modify: `Desarrollo/index2.html` (sección `#qr-fiestas`, `.feat-content`)
- Scratchpad: script node para generar el SVG (no se commitea)

**Interfaces:**
- Consumes: `.feat-actions` de Task 4 (el QR va después de esa fila).
- Produces: bloque `.qr-demo-box` visible solo en desktop.

- [ ] **Step 1: Generar el SVG del QR (una sola vez, offline)**

```bash
cd "$SCRATCHPAD" && npm init -y >/dev/null && npm i qrcode >/dev/null
node -e "require('qrcode').toString('https://kuerre.com.ar/fiestas.html?e=demo',{type:'svg',errorCorrectionLevel:'M',margin:1},(e,s)=>{if(e)throw e;console.log(s)})" > qr-demo.svg
```

Verificar el SVG escaneándolo desde el archivo abierto en el navegador antes de insertarlo.

- [ ] **Step 2: Insertar en index2.html**

Dentro de `.feat-content` de `#qr-fiestas`, después de `.feat-actions`:

```html
<div class="qr-demo-box">
  <div class="qr-demo-svg"><!-- SVG generado en Step 1, con width="104" height="104" --></div>
  <div class="qr-demo-copy">Escanealo con tu celu<br><strong>y subí una foto ahora</strong></div>
</div>
```

CSS:

```css
.qr-demo-box { display:flex; align-items:center; gap:16px; margin-top:24px; padding:14px 18px;
  background:#fff; border:1px solid var(--border); border-radius:14px; width:fit-content; }
.qr-demo-svg svg { display:block; width:104px; height:104px; }
.qr-demo-copy { font-size:12px; line-height:1.7; color:rgba(0,0,0,.55); letter-spacing:.04em; }
.qr-demo-copy strong { color:var(--green); font-weight:500; }
@media(max-width:900px) { .qr-demo-box { display:none; } }
```

- [ ] **Step 3: Verificar y commit**

Escanear el QR renderizado en la página con un celular → abre la galería demo. En viewport ≤900px el QR no se muestra (el botón demo de Task 4 lo reemplaza).

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add Desarrollo/index2.html && git commit -m "index2: QR escaneable a la galeria demo en seccion QR Fiestas (solo desktop)"
```

---

### Task 6: Micro-animaciones en los mockups

**Files:**
- Modify: `Desarrollo/index2.html` (CSS en `<style>`, JS antes de `</body>`, ids en los mockups)

**Interfaces:**
- Consumes: mockups existentes — card `.scr-inv` (countdown `.scr-inv-cd-n`), card `.scr-qr` (6 divs `.scr-qr-photo`), phone-lg QR (5 `<img>` del grid), phone-lg premiere (3 `<img>` thumbnails), botón "Confirmar asistencia →" del phone-lg invitación.
- Produces: animaciones activas solo en viewport (IntersectionObserver), desactivadas con `prefers-reduced-motion`.

- [ ] **Step 1: Countdown real en la card Invitación**

Agregar ids a los números de la card `.scr-inv` (`scr-cd-d`, `scr-cd-h`, `scr-cd-m` en los `<span class="scr-inv-cd-n">`). JS:

```js
// Countdown demo: mismo target que la invitación demo (hoy + 21 días, 21:00)
(function(){
  var target = Date.now() + 21*86400000;
  var d=document.getElementById('scr-cd-d'), h=document.getElementById('scr-cd-h'), m=document.getElementById('scr-cd-m');
  if(!d) return;
  function tick(){
    var s = Math.max(0, target - Date.now())/1000;
    d.textContent = Math.floor(s/86400);
    h.textContent = String(Math.floor(s%86400/3600)).padStart(2,'0');
    m.textContent = String(Math.floor(s%3600/60)).padStart(2,'0');
  }
  tick(); setInterval(tick, 30000);
})();
```

- [ ] **Step 2: Galería QR "en vivo" (card + phone-lg)**

CSS:

```css
@keyframes qr-pop { 0% { opacity:0; transform:scale(.85); } 100% { opacity:1; transform:scale(1); } }
.qr-live-pop { animation:qr-pop .6s cubic-bezier(.2,.8,.4,1); }
.qr-live-badge { position:absolute; top:8px; right:8px; z-index:5; padding:3px 8px; border-radius:10px;
  background:linear-gradient(135deg,#9060b8,#c090e0); color:#fff; font-size:7px; letter-spacing:.08em;
  opacity:0; transition:opacity .4s; pointer-events:none; }
.qr-live-badge.on { opacity:1; }
@media (prefers-reduced-motion: reduce) { .qr-live-pop { animation:none; } }
```

En el phone-lg de `#qr-fiestas` (contenedor `.phone-lg-screen`, que ya es `position:relative` vía `.phone-lg`): agregar `<div class="qr-live-badge" id="qr-badge">+1 foto</div>`. JS genérico que anima en loop los hijos de un contenedor:

```js
function qrLiveLoop(container, selector, badge) {
  var items = container.querySelectorAll(selector);
  if (!items.length) return null;
  var i = 0;
  return setInterval(function(){
    var el = items[i % items.length];
    el.classList.remove('qr-live-pop'); void el.offsetWidth; el.classList.add('qr-live-pop');
    if (badge) { badge.classList.add('on'); setTimeout(function(){ badge.classList.remove('on'); }, 1400); }
    i++;
  }, 2600);
}
```

- [ ] **Step 3: Premiere crossfade + pulse del CTA invite**

CSS:

```css
.pm-fade { transition:opacity .8s; }
@keyframes cta-pulse { 0%,100% { box-shadow:0 0 0 0 rgba(192,144,224,.35); } 50% { box-shadow:0 0 0 6px rgba(192,144,224,0); } }
.inv-cta-pulse { animation:cta-pulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .inv-cta-pulse { animation:none; } .pm-fade { transition:none; } }
```

Agregar clase `pm-fade` a las 3 `<img>` thumbnail del phone-lg premiere y `inv-cta-pulse` al div "Confirmar asistencia →". JS crossfade (rota las src entre un pool de las mismas unsplash ya usadas en la página):

```js
function pmCrossfade(container) {
  var imgs = container.querySelectorAll('img.pm-fade');
  if (!imgs.length) return null;
  var pool = ['https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=80&q=60',
              'https://images.unsplash.com/photo-1529634597503-139d3726fed5?w=80&q=60',
              'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=80&q=60',
              'https://images.unsplash.com/photo-1519741347686-c1e0aadf4611?w=80&q=60',
              'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=80&q=60'];
  var i = 0;
  return setInterval(function(){
    var img = imgs[i % imgs.length];
    img.style.opacity = 0;
    setTimeout(function(){ img.src = pool[Math.floor(Math.random()*pool.length)]; img.style.opacity = 1; }, 800);
    i++;
  }, 3200);
}
```

- [ ] **Step 4: Orquestación con IntersectionObserver**

```js
(function(){
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var timers = new Map();
  var starters = [];
  var qrCard = document.querySelector('.scr-qr-grid');
  if (qrCard) starters.push([qrCard, function(){ return qrLiveLoop(qrCard, '.scr-qr-photo', null); }]);
  var qrPhone = document.querySelector('#qr-fiestas .phone-lg-screen');
  if (qrPhone) starters.push([qrPhone, function(){ return qrLiveLoop(qrPhone, 'img', document.getElementById('qr-badge')); }]);
  var pmPhone = document.querySelector('#premiere .phone-lg-screen');
  if (pmPhone) starters.push([pmPhone, function(){ return pmCrossfade(pmPhone); }]);
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      var pair = starters.find(function(s){ return s[0] === en.target; });
      if (!pair) return;
      if (en.isIntersecting && !timers.has(en.target)) timers.set(en.target, pair[1]());
      else if (!en.isIntersecting && timers.has(en.target)) { clearInterval(timers.get(en.target)); timers.delete(en.target); }
    });
  }, { threshold: .3 });
  starters.forEach(function(s){ io.observe(s[0]); });
})();
```

- [ ] **Step 5: Verificar y commit**

En el navegador: countdown cuenta, fotos QR "aparecen" en loop con badge, premiere hace crossfade, CTA pulsa; al scrollear fuera de vista los intervals se frenan (verificar con `performance` o logs); con `prefers-reduced-motion` emulado en DevTools no hay animaciones. Cero errores en consola.

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add Desarrollo/index2.html && git commit -m "index2: micro-animaciones en mockups (countdown real, galeria en vivo, crossfade premiere, pulse CTA)"
```

---

### Task 7: Modal demo on-click en los phones

**Files:**
- Modify: `Desarrollo/index2.html` (HTML del modal antes de `</body>`, CSS, JS, atributos `data-demo` en los mockups)

**Interfaces:**
- Consumes: URLs demo (Global Constraints). Mockups: los 3 phone-lg de features + los 3 `.phone` de cards + el phone-lg del hero.
- Produces: `openDemoModal(url)` / `closeDemoModal()`; en ≤900px abre pestaña nueva directa.

- [ ] **Step 1: HTML + CSS del modal**

```html
<div id="demo-modal">
  <div class="demo-modal-frame">
    <div class="demo-modal-bar">
      <a id="demo-modal-open" href="#" target="_blank">Abrir en pestaña nueva ↗</a>
      <button onclick="closeDemoModal()" aria-label="Cerrar">✕</button>
    </div>
    <iframe id="demo-modal-iframe" title="Demo Kuerre"></iframe>
  </div>
</div>
```

```css
#demo-modal { display:none; position:fixed; inset:0; z-index:400; background:rgba(10,6,20,.75);
  backdrop-filter:blur(8px); align-items:center; justify-content:center; }
#demo-modal.open { display:flex; }
.demo-modal-frame { width:min(420px,92vw); height:min(86vh,780px); background:#111; border-radius:34px;
  border:8px solid #1c1c1e; overflow:hidden; display:flex; flex-direction:column;
  box-shadow:0 40px 120px rgba(0,0,0,.6); }
.demo-modal-bar { display:flex; justify-content:space-between; align-items:center; padding:10px 16px; background:#000; }
.demo-modal-bar a { color:#c090e0; font-size:11px; letter-spacing:.08em; text-decoration:none; }
.demo-modal-bar button { background:none; border:none; color:#fff; font-size:16px; cursor:pointer; padding:4px 8px; }
#demo-modal-iframe { flex:1; width:100%; border:none; background:#0a0a12; }
```

- [ ] **Step 2: JS + wiring de los phones**

```js
// [COMPARTIDA] abre demo en modal (desktop) o pestaña nueva (mobile)
function openDemoModal(url) {
  if (window.innerWidth <= 900) { window.open(url, '_blank'); return; }
  var m = document.getElementById('demo-modal');
  document.getElementById('demo-modal-iframe').src = url;
  document.getElementById('demo-modal-open').href = url;
  m.classList.add('open');
}
function closeDemoModal() {
  var m = document.getElementById('demo-modal');
  m.classList.remove('open');
  document.getElementById('demo-modal-iframe').src = 'about:blank';
}
document.getElementById('demo-modal').addEventListener('click', function(e){ if (e.target === this) closeDemoModal(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeDemoModal(); });
document.querySelectorAll('[data-demo]').forEach(function(el){
  el.style.cursor = 'pointer';
  el.addEventListener('click', function(){ openDemoModal(el.getAttribute('data-demo')); });
});
```

Atributos: `data-demo="invite.html?i=demo"` en el phone-lg de `#invitaciones` y en la card `.phone` de Invitación; `data-demo="fiestas.html?e=demo"` en el phone-lg de `#qr-fiestas`, la card QR y el phone del hero; `data-demo="premiere.html?e=demo"` en el phone-lg de `#premiere` y la card Premiere.

- [ ] **Step 3: Verificar y commit**

Desktop: clic en cada phone abre el modal con la demo correcta cargando en el iframe; Escape/click afuera/✕ cierran y limpian el iframe; "Abrir en pestaña nueva" funciona. Responsive ≤900px (DevTools): clic abre pestaña nueva. Nota: verificar que fiestas/invite/premiere no manden `X-Frame-Options`/CSP que bloquee iframe same-origin — se sirven desde gh-pages, no deberían.

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add Desarrollo/index2.html && git commit -m "index2: modal demo con marco de telefono al clickear los mockups"
```

---

### Task 8: Verificación integral

**Files:** ninguno nuevo

- [ ] **Step 1: Checklist completo sobre `index2.html`** (skill `superpowers:verification-before-completion`)

1. Las 3 demos abren desde botones, QR y modal.
2. Countdown de `invite.html?i=demo` siempre ~21 días.
3. Subir foto a la galería demo → aparece; `POST /api/demo/reset` la borra y preserva las seed.
4. Animaciones OK desktop y mobile; sin errores de consola; CMS (`crd_content`) sigue aplicando textos sin pisar los elementos nuevos.
5. Lighthouse/peso razonable: el index2 no carga iframes hasta abrir el modal.

- [ ] **Step 2: Mostrar a Cristian**

`index2.html` queda en Desarrollo. Para verla online: cuando Cristian diga "subilo", copiar TAMBIÉN `index2.html` a Productivo + push + sync gh-pages (regla `feedback_deploy_gh_pages`) — el index actual no se toca.

- [ ] **Step 3 (POST-APROBACIÓN — no ejecutar sin OK explícito de Cristian):** Promover: copiar `index2.html` → `index.html` (Desarrollo y Productivo), borrar `index2.html` de ambas, commit + push + gh-pages. Skill `superpowers:finishing-a-development-branch`.
