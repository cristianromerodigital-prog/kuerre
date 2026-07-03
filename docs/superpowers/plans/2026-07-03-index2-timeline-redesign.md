# Rediseño Timeline index2.html — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestructurar `Desarrollo/index2.html` como cronología "Antes / Durante / Después" de un evento, sin tocar paleta ni romper demos interactivas ni el contrato de ids con el Worker.

**Architecture:** Un solo archivo HTML con CSS/JS inline. Las 3 secciones `.feature-split` existentes se envuelven en etapas de una línea de tiempo vertical (`.tl-stage`) con encabezados de contexto nuevos; el DOM interno de cada sección NO se toca (celus, `data-demo`, animaciones e ids del config sobreviven intactos). La uniformización del layout (visual izquierda / texto derecha) se hace solo con CSS `order`.

**Tech Stack:** Vanilla HTML/CSS/JS inline. Sin build. Git repo: `e:\CLAUDE\WEB KUERRE`.

## Global Constraints

- Archivo único a modificar: `Desarrollo/index2.html`. NO tocar `index.html`, `Productivo/`, otros HTML ni el worker.
- Paleta intacta: `--green:#9060b8`, `--blue:#c090e0`, `--bg:#fafafa`. No cambiar tipografías (Inter + Cormorant Garamond).
- Ids del contrato con `/site/config` deben sobrevivir textualmente: `hero-eyebrow`, `hero-title`, `hero-desc`, `hero-btn1`, `hero-btn2`, `trust-num-0..3`, `trust-label-0..3`, `inv-*`, `qr-*`, `pm-*`, `svc-eyebrow`, `svc-title`, `svc-name-0..2`, `svc-desc-0..2`, `svc-price-0..2`, `cf-*`, `step-name-0..2`, `step-desc-0..2`, `faq-eyebrow`, `faq-title`, `faq-list`, `cta-title`, `cta-desc`, `cta-btn`.
- Elementos interactivos intactos: `data-demo` + `openDemoModal`, video hero (`hero-video`/`hero-fallback-img`), `qrLiveLoop`, `pmCrossfade`, countdown (`scr-cd-*`), QR escaneable (`.qr-demo-box`), orquestación IntersectionObserver + `prefers-reduced-motion`.
- Edits parciales con Edit tool — nunca reescribir el archivo completo.
- Commits: mensajes descriptivos; usar `git commit -F <archivo>` (el sandbox bloquea `-m` con rutas en el mensaje). Working dir del repo: `e:\CLAUDE\WEB KUERRE`.
- No promocionar a `index.html` ni push — eso lo pide el usuario aparte ("subilo").
- Verificación: no hay tests automatizados; cada task verifica con grep de ids + apertura en navegador (`Start-Process`).

---

### Task 1: CSS nuevo (timeline, chips, combo strip, responsive)

**Files:**
- Modify: `Desarrollo/index2.html` (bloque `<style>`, insertar antes de `/* RESPONSIVE */` línea ~322)

**Interfaces:**
- Produces: clases CSS `.tl-intro`, `.tl-stage`, `.tl-node`, `.tl-when`, `.tl-stage-title`, `.tl-card`, `.tl-on`, `.hero-stages`, `.stage-chip`, `.chip-dot`, `.combo-strip` — usadas por Tasks 2, 3, 4, 5.

- [ ] **Step 1: Insertar bloque CSS**

Con Edit, anclar en `/* RESPONSIVE */` e insertar antes:

```css
/* ── TIMELINE ── */
#timeline { position:relative; z-index:1; max-width:1160px; margin:0 auto; padding:100px 40px 20px; }
.tl-intro { text-align:center; margin-bottom:80px; }
.tl-stage { position:relative; padding-left:72px; padding-bottom:96px; }
.tl-stage::before { content:''; position:absolute; left:20px; top:28px; bottom:0; width:2px;
  background:rgba(144,96,184,.16); }
.tl-stage:last-of-type::before { bottom:60px; }
.tl-stage.tl-on::before { background:linear-gradient(to bottom, rgba(144,96,184,.55), rgba(144,96,184,.16)); }
.tl-node { position:absolute; left:11px; top:6px; width:20px; height:20px; border-radius:50%;
  border:2px solid rgba(144,96,184,.35); background:var(--bg); z-index:2;
  transition:background .5s, box-shadow .5s, border-color .5s; }
.tl-stage.tl-on .tl-node { background:linear-gradient(135deg,#9060b8,#c090e0);
  border-color:transparent; box-shadow:0 0 18px rgba(192,144,224,.55); }
.tl-when { display:block; font-size:10px; letter-spacing:.5em; text-transform:uppercase;
  color:var(--green); margin-bottom:10px; font-weight:500; }
.tl-stage-title { font-family:'Cormorant Garamond',serif; font-size:clamp(30px,4.5vw,54px);
  font-style:italic; font-weight:300; line-height:1.1; margin-bottom:36px; color:#111; }
.tl-card { border-radius:28px; overflow:hidden; border:1px solid var(--border);
  background:#fff; box-shadow:0 16px 60px rgba(0,0,0,.1); }
.tl-card .feature-split { min-height:480px; }
.tl-card .feat-visual { order:1; }
.tl-card .feat-content { order:2; padding:64px 56px; }

/* ── HERO STAGE CHIPS ── */
.hero-stages { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin-top:28px; }
.stage-chip { display:inline-flex; align-items:center; gap:8px; padding:9px 18px; border-radius:999px;
  border:1px solid rgba(144,96,184,.3); background:rgba(255,255,255,.6); color:rgba(0,0,0,.55);
  font-size:10px; letter-spacing:.22em; text-transform:uppercase; text-decoration:none; transition:all .25s; }
.stage-chip:hover { border-color:var(--green); color:var(--green); }
.chip-dot { width:7px; height:7px; border-radius:50%; background:linear-gradient(135deg,#9060b8,#c090e0); flex-shrink:0; }

/* ── COMBO STRIP ── */
.combo-strip { margin:56px auto 0; max-width:860px; padding:44px 40px; border-radius:24px; text-align:center;
  background:linear-gradient(135deg,rgba(144,96,184,.07),rgba(192,144,224,.13));
  border:1px solid var(--border); }
.combo-strip p { font-size:14px; line-height:2; color:rgba(0,0,0,.55); max-width:640px; margin:0 auto 28px; }
.combo-strip strong { color:var(--green); font-weight:500; }
```

- [ ] **Step 2: Insertar reglas responsive**

Dentro del bloque `@media(max-width:900px)` existente (después de `.trust-bar { flex-wrap:wrap; }`), agregar:

```css
  #timeline { padding:80px 20px 10px; }
  .tl-stage { padding-left:34px; padding-bottom:72px; }
  .tl-stage::before { left:7px; }
  .tl-node { left:-2px; width:18px; height:18px; }
  .tl-card .feat-content { padding:60px 32px; }
```

- [ ] **Step 3: Verificar que la página sigue renderizando igual (CSS aún sin uso)**

Run: `Start-Process "e:\CLAUDE\WEB KUERRE\Desarrollo\index2.html"`
Expected: página idéntica a antes, sin errores en consola.

- [ ] **Step 4: Commit**

```bash
cd "e:/CLAUDE/WEB KUERRE" && git add Desarrollo/index2.html && git commit -F <msgfile>
```
Mensaje: `feat(index2): CSS de timeline, chips de etapa y franja combo (sin uso aun)`

---

### Task 2: Hero — copy nuevo + chips Antes/Durante/Después

**Files:**
- Modify: `Desarrollo/index2.html` (líneas ~424-433, dentro de `.hero-glass`)

**Interfaces:**
- Consumes: `.hero-stages`, `.stage-chip`, `.chip-dot` (Task 1).
- Produces: nada que consuman otras tasks.

- [ ] **Step 1: Reemplazar defaults de eyebrow/título/sub**

```html
<div class="hero-eyebrow" id="hero-eyebrow">Antes · Durante · Después</div>
<h1 class="hero-title" id="hero-title">Tu evento no dura<br>solo una noche</h1>
<p class="hero-sub" id="hero-desc">Empieza cuando compartís la invitación digital, se vive con tus invitados durante la fiesta a través del QR interactivo, y continúa semanas después con la entrega Premiere.</p>
```

(Los ids se conservan; si hay config en KV pisa estos defaults — esperado.)

- [ ] **Step 2: Agregar chips después de `.hero-actions`** (después del `</div>` que cierra `hero-actions`, antes del `</div>` de `.hero-glass`)

```html
      <div class="hero-stages">
        <a class="stage-chip" href="#invitaciones"><span class="chip-dot"></span>Antes</a>
        <a class="stage-chip" href="#qr-fiestas"><span class="chip-dot"></span>Durante</a>
        <a class="stage-chip" href="#premiere"><span class="chip-dot"></span>Después</a>
      </div>
```

- [ ] **Step 3: Verificar**

Run: `Start-Process "e:\CLAUDE\WEB KUERRE\Desarrollo\index2.html"`
Expected: hero con copy nuevo, 3 chips debajo de los CTAs; clic en cada chip scrollea a su sección; video del celu sigue cargando.

- [ ] **Step 4: Commit**

Mensaje: `feat(index2): hero con concepto antes/durante/despues + chips de etapa`

---

### Task 3: Timeline — envolver las 3 secciones de servicio en etapas

**Files:**
- Modify: `Desarrollo/index2.html` (líneas ~487-630: los tres `.feature-split`)

**Interfaces:**
- Consumes: `.tl-*` (Task 1).
- Produces: estructura `.tl-stage` con nodos, consumida por el JS de Task 4. Ids nuevos: `tl-when-0..2`, `tl-title-0..2` (NO gestionados por config).

- [ ] **Step 1: Insertar apertura del timeline antes del comentario `<!-- FEATURE: INVITACIONES -->`**

```html
<!-- TIMELINE: LA EXPERIENCIA -->
<section id="timeline">
  <div class="tl-intro">
    <span class="sec-label">La experiencia</span>
    <h2 class="sec-title" style="margin-bottom:0">Un evento,<br><em>tres momentos</em></h2>
  </div>
```

- [ ] **Step 2: Envolver cada feature-split en su etapa**

Antes de `<div id="invitaciones" class="feature-split">`:

```html
  <div class="tl-stage">
    <div class="tl-node"></div>
    <span class="tl-when" id="tl-when-0">Etapa 01 · Antes</span>
    <h3 class="tl-stage-title" id="tl-title-0">Semanas antes del gran día</h3>
    <div class="tl-card">
```

Después del `</div>` que cierra `#invitaciones` (línea ~533): agregar `</div></div>` (cierra `.tl-card` y `.tl-stage`).

Repetir para QR Fiestas (antes de `<div id="qr-fiestas" class="feature-split">`):

```html
  <div class="tl-stage">
    <div class="tl-node"></div>
    <span class="tl-when" id="tl-when-1">Etapa 02 · Durante</span>
    <h3 class="tl-stage-title" id="tl-title-1">La noche del evento</h3>
    <div class="tl-card">
```

y para Premiere (antes de `<div id="premiere" class="feature-split">`):

```html
  <div class="tl-stage">
    <div class="tl-node"></div>
    <span class="tl-when" id="tl-when-2">Etapa 03 · Después</span>
    <h3 class="tl-stage-title" id="tl-title-2">Las semanas siguientes</h3>
    <div class="tl-card">
```

Cerrar cada uno con `</div></div>` tras el cierre del feature-split correspondiente, y tras el último agregar `</section>` (cierra `#timeline`).

**IMPORTANTE:** el contenido interno de cada `.feature-split` NO se modifica — ni ids, ni celus, ni `data-demo`, ni el `style="background:#fafafa"` de los `.feat-content`. La uniformización visual/texto la hace el CSS `order` de Task 1.

- [ ] **Step 3: Verificar integridad del DOM y del contrato de ids**

Grep en el archivo — deben existir exactamente igual que antes: `id="invitaciones"`, `id="qr-fiestas"`, `id="premiere"`, `inv-title`, `qr-title`, `pm-title`, `data-demo` (6 ocurrencias), `qr-badge`.
Contar aperturas/cierres de div balanceados en la zona editada (o pegar el archivo en el navegador y revisar que el footer sigue al final, sin layout roto).

- [ ] **Step 4: Verificar interactividad en navegador**

Run: `Start-Process "e:\CLAUDE\WEB KUERRE\Desarrollo\index2.html"`
Expected:
- Las 3 etapas aparecen como tarjetas sobre la línea de tiempo con sus encabezados "Etapa 01/02/03".
- Layout uniforme: celu a la izquierda, texto a la derecha (desktop).
- Clic en cada celu abre el modal demo; "Ver demo en vivo" funciona.
- Badge "+1 foto" anima en QR; crossfade en Premiere; QR escaneable visible.
- Links del navbar (#invitaciones, #qr-fiestas, #premiere) y chips del hero scrollean bien.
- Ancho 400px (devtools): tarjetas a columna completa, línea a la izquierda.

- [ ] **Step 5: Commit**

Mensaje: `feat(index2): linea de tiempo antes/durante/despues envolviendo los 3 servicios`

---

### Task 4: JS — activación de nodos al scrollear

**Files:**
- Modify: `Desarrollo/index2.html` (bloque `<script>` final, después de la orquestación IntersectionObserver existente, ~línea 1059)

**Interfaces:**
- Consumes: `.tl-stage`, clase `.tl-on` (Tasks 1 y 3).

- [ ] **Step 1: Agregar observer de etapas**

```js
// Timeline: encender nodos al entrar en viewport
(function() {
  var stages = document.querySelectorAll('.tl-stage');
  if (!stages.length) return;
  var io = new IntersectionObserver(function(entries) {
    entries.forEach(function(en) {
      if (en.isIntersecting) { en.target.classList.add('tl-on'); io.unobserve(en.target); }
    });
  }, { threshold: .2 });
  stages.forEach(function(s) { io.observe(s); });
})();
```

- [ ] **Step 2: Verificar**

Run: `Start-Process "e:\CLAUDE\WEB KUERRE\Desarrollo\index2.html"`
Expected: al scrollear, cada nodo pasa de hueco a relleno con glow violeta y el segmento de línea se acentúa. Sin errores en consola.

- [ ] **Step 3: Commit**

Mensaje: `feat(index2): nodos de timeline se encienden al scrollear`

---

### Task 5: Servicios → "La experiencia completa" + franja combo

**Files:**
- Modify: `Desarrollo/index2.html` (sección `#servicios`, líneas ~634-711)

**Interfaces:**
- Consumes: `.combo-strip` (Task 1). Ids `svc-*` intactos.

- [ ] **Step 1: Reemplazar defaults de eyebrow y título**

```html
  <span class="sec-label" id="svc-eyebrow">La experiencia completa</span>
  <h2 class="sec-title" id="svc-title">Tres momentos,<br><em>una experiencia completa</em></h2>
```

(Mismos ids — si hay texto en KV lo pisa; anotar para actualizar en admin.)

- [ ] **Step 2: Agregar franja combo después del `</div>` que cierra `.cards`, antes de `</section>`**

```html
  <div class="combo-strip">
    <p id="combo-text">Gracias a esta experiencia, <strong>tu evento ya no dura solo una noche</strong>: empieza desde el momento en que compartís la invitación digital, se vive con tus invitados durante la fiesta a través del QR interactivo y continúa semanas después con la entrega Premiere, donde podés revivir y compartir cada recuerdo una y otra vez.</p>
    <a href="https://wa.me/541162557763?text=Hola%2C%20quiero%20la%20experiencia%20completa%20de%20KUERRE%20(Invitaci%C3%B3n%20%2B%20QR%20%2B%20Premiere)" target="_blank" class="btn-primary" id="combo-btn">Quiero la experiencia completa</a>
  </div>
```

- [ ] **Step 3: Verificar**

Run: `Start-Process "e:\CLAUDE\WEB KUERRE\Desarrollo\index2.html"`
Expected: cards con precios intactas (countdown de invitación andando), franja combo debajo con CTA que abre WhatsApp con el texto correcto.

- [ ] **Step 4: Commit**

Mensaje: `feat(index2): seccion experiencia completa con franja combo y CTA WhatsApp`

---

### Task 6: Bump de versión + verificación final

**Files:**
- Modify: `Desarrollo/index2.html` (línea 7 `KVER='1.41'` y línea ~386 `v1.41`)

- [ ] **Step 1: Bump 1.41 → 1.42 en ambas ocurrencias**

```js
var KVER='1.42';
```
```html
<span id="site-version" ...>v1.42</span>
```

- [ ] **Step 2: Verificación final completa (checklist)**

Grep — todos deben existir: `hero-eyebrow`, `hero-title`, `hero-desc`, `trust-num-3`, `inv-feat-4`, `qr-feat-4`, `pm-feat-4`, `svc-price-2`, `step-desc-2`, `faq-list`, `cta-btn`, 6× `data-demo`.
Navegador (desktop + 400px):
- Hero: video/fallback, chips scrollean.
- Timeline: 3 etapas, nodos se encienden, demos en modal, animaciones QR/Premiere, QR escaneable.
- Experiencia completa: cards + combo strip.
- Cómo funciona / FAQ (toggle) / CTA final / footer intactos.
- Consola sin errores; con red activa, `/site/config` carga y los textos de KV pisan los defaults sin romper nada (los encabezados `tl-*` y `combo-*` no son tocados por config).

- [ ] **Step 3: Commit**

Mensaje: `chore(index2): bump version a 1.42 tras rediseno timeline`

- [ ] **Step 4: Reporte al usuario**

Avisar qué textos conviene actualizar en el admin/KV para acompañar la narrativa (hero eyebrow/título/sub, título de servicios) — sin tocar KV.
