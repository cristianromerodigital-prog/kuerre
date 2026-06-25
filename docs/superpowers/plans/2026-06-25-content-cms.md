# Content CMS — WEB KUERRE Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo el contenido del `index.html` de WEB KUERRE (textos, imágenes de fondo, URLs de WhatsApp) es editable desde `admin.html` y se persiste en CF KV (`crd_content`).

**Architecture:** DOM injection con IDs — el admin guarda un objeto JSON en `crd_content` (localStorage + CF KV); el index lo lee al cargar y aplica cada campo al elemento con su ID. Fallback: si el Worker falla, el HTML hardcodeado queda intacto.

**Tech Stack:** Vanilla HTML/JS inline, CF KV via Worker REST, localStorage.

## Global Constraints

- CSS y JS siempre inline dentro del HTML — nunca archivos externos.
- Edits parciales con Edit tool — nunca Write sobre archivos existentes.
- No modificar nada fuera del scope de cada task (no cleanup, no refactor).
- Bump versión `V1.XX` en `admin.html` e `index.html` antes del commit final.
- `crd_content` ya está en `CF_SYNC_KEYS` del admin — no agregar entradas duplicadas.
- Worker URL: `https://kuerre-worker.cristian-romero-digital.workers.dev`
- Archivos de trabajo: `e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html` y `e:\CLAUDE\WEB KUERRE\Desarrollo\index.html`

---

### Task 1: Agregar IDs a elementos editables en `index.html`

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\index.html`

**Interfaces:**
- Produce: IDs en todos los elementos editables para que Task 2 pueda encontrarlos con `getElementById`.

- [ ] **Step 1: Topbar, nav, mobile menu**

En `index.html` aplicar estos cambios con Edit tool (uno por uno):

```
ANTES: <span class="topbar-left">Buenos Aires, Argentina</span>
DESPUES: <span class="topbar-left" id="topbar-text">Buenos Aires, Argentina</span>
```

```
ANTES: <a href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" class="nav-cta">Consultar</a>
DESPUES: <a href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" class="nav-cta" id="nav-cta-link">Consultar</a>
```

```
ANTES: <a class="mobile-cta" href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" onclick="closeMobileMenu()">Consultar</a>
DESPUES: <a class="mobile-cta" href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" onclick="closeMobileMenu()" id="mobile-cta-link">Consultar</a>
```

- [ ] **Step 2: Hero section**

```
ANTES: <div class="hero-bg"></div>
DESPUES: <div class="hero-bg" id="hero-bg"></div>
```

```
ANTES: <div class="hero-eyebrow">Servicios digitales para eventos</div>
DESPUES: <div class="hero-eyebrow" id="hero-eyebrow">Servicios digitales para eventos</div>
```

```
ANTES: <h1 class="hero-title">Hacé que tu evento<br>viva para siempre</h1>
DESPUES: <h1 class="hero-title" id="hero-title">Hacé que tu evento<br>viva para siempre</h1>
```

```
ANTES: <p class="hero-sub">Galería colaborativa en tiempo real, entrega cinematográfica e invitación digital. Todo lo que tu evento necesita, en un solo lugar.</p>
DESPUES: <p class="hero-sub" id="hero-desc">Galería colaborativa en tiempo real, entrega cinematográfica e invitación digital. Todo lo que tu evento necesita, en un solo lugar.</p>
```

```
ANTES: <a href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" class="btn-primary">
DESPUES: <a href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" class="btn-primary" id="hero-btn1">
```

```
ANTES: <a href="#servicios" class="btn-secondary">Ver servicios</a>
DESPUES: <a href="#servicios" class="btn-secondary" id="hero-btn2">Ver servicios</a>
```

- [ ] **Step 3: Trust Bar**

```
ANTES: <div class="trust-item"><div class="trust-num">+100</div><div class="trust-label">Eventos realizados</div></div>
  <div class="trust-item"><div class="trust-num">3</div><div class="trust-label">Servicios digitales</div></div>
  <div class="trust-item"><div class="trust-num">0</div><div class="trust-label">Apps que instalar</div></div>
  <div class="trust-item"><div class="trust-num">24h</div><div class="trust-label">Tiempo de respuesta</div></div>
DESPUES: <div class="trust-item"><div class="trust-num" id="trust-num-0">+100</div><div class="trust-label" id="trust-label-0">Eventos realizados</div></div>
  <div class="trust-item"><div class="trust-num" id="trust-num-1">3</div><div class="trust-label" id="trust-label-1">Servicios digitales</div></div>
  <div class="trust-item"><div class="trust-num" id="trust-num-2">0</div><div class="trust-label" id="trust-label-2">Apps que instalar</div></div>
  <div class="trust-item"><div class="trust-num" id="trust-num-3">24h</div><div class="trust-label" id="trust-label-3">Tiempo de respuesta</div></div>
```

- [ ] **Step 4: Feature Invitaciones**

Localizar la sección `<div id="invitaciones" class="feature-split">`. Dentro de su `.feat-content`:

```
ANTES: <span class="feat-label">Invitación Digital</span>
DESPUES: <span class="feat-label" id="inv-label">Invitación Digital</span>
```

```
ANTES: <h2 class="feat-title">Animada, musical<br>e interactiva</h2>
DESPUES: <h2 class="feat-title" id="inv-title">Animada, musical<br>e interactiva</h2>
```

```
ANTES: <p class="feat-desc">Cuenta regresiva en vivo, música de fondo, mapa interactivo, confirmación de asistencia y mucho más. Sin papel, con estilo.</p>
DESPUES: <p class="feat-desc" id="inv-desc">Cuenta regresiva en vivo, música de fondo, mapa interactivo, confirmación de asistencia y mucho más. Sin papel, con estilo.</p>
```

Los 5 `<li>` de la lista de features:
```
ANTES: <li>Cuenta regresiva al evento en tiempo real</li>
      <li>Música de fondo elegible por el cliente</li>
      <li>Confirmación de asistencia integrada</li>
      <li>Link a Google Maps con la ubicación</li>
      <li>Compartible por WhatsApp, Instagram y email</li>
DESPUES: <li id="inv-feat-0">Cuenta regresiva al evento en tiempo real</li>
      <li id="inv-feat-1">Música de fondo elegible por el cliente</li>
      <li id="inv-feat-2">Confirmación de asistencia integrada</li>
      <li id="inv-feat-3">Link a Google Maps con la ubicación</li>
      <li id="inv-feat-4">Compartible por WhatsApp, Instagram y email</li>
```

```
ANTES: <a href="https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20Invitaci%C3%B3n%20Digital" target="_blank" class="btn-primary" style="width:fit-content">Consultar precio</a>
DESPUES: <a href="https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20Invitaci%C3%B3n%20Digital" target="_blank" class="btn-primary" id="inv-btn" style="width:fit-content">Consultar precio</a>
```

En el `.feat-visual` de #invitaciones, el background:
```
ANTES: <div class="feat-visual-bg" style="background-image:url('https://images.unsplash.com/photo-1519741347686-c1e0aadf4611?w=900&auto=format&q=80')"></div>
DESPUES: <div class="feat-visual-bg" id="inv-bg" style="background-image:url('https://images.unsplash.com/photo-1519741347686-c1e0aadf4611?w=900&auto=format&q=80')"></div>
```

- [ ] **Step 5: Feature QR Fiestas**

Dentro de `<div id="qr-fiestas" class="feature-split">`, en el `.feat-content`:

```
ANTES: <span class="feat-label">QR Fiestas</span>
DESPUES: <span class="feat-label" id="qr-label">QR Fiestas</span>
```

```
ANTES: <h2 class="feat-title">La galería colaborativa<br>de tu evento</h2>
DESPUES: <h2 class="feat-title" id="qr-title">La galería colaborativa<br>de tu evento</h2>
```

```
ANTES: <p class="feat-desc">Tus invitados escanean un QR y en segundos están subiendo fotos desde su celular. Una galería que crece sola durante la fiesta.</p>
DESPUES: <p class="feat-desc" id="qr-desc">Tus invitados escanean un QR y en segundos están subiendo fotos desde su celular. Una galería que crece sola durante la fiesta.</p>
```

```
ANTES: <li>Sin descargar ninguna aplicación — solo el navegador</li>
      <li>Galería en tiempo real visible para todos los invitados</li>
      <li>Descarga masiva de todas las fotos al finalizar</li>
      <li>QR imprimible para colocar en las mesas</li>
      <li>Disponible 30 días después del evento</li>
DESPUES: <li id="qr-feat-0">Sin descargar ninguna aplicación — solo el navegador</li>
      <li id="qr-feat-1">Galería en tiempo real visible para todos los invitados</li>
      <li id="qr-feat-2">Descarga masiva de todas las fotos al finalizar</li>
      <li id="qr-feat-3">QR imprimible para colocar en las mesas</li>
      <li id="qr-feat-4">Disponible 30 días después del evento</li>
```

```
ANTES: <a href="https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20QR%20Fiestas" target="_blank" class="btn-primary" style="width:fit-content">Consultar precio</a>
DESPUES: <a href="https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20QR%20Fiestas" target="_blank" class="btn-primary" id="qr-btn" style="width:fit-content">Consultar precio</a>
```

En `.feat-visual` de #qr-fiestas:
```
ANTES: <div class="feat-visual-bg" style="background-image:url('https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=900&auto=format&q=80')"></div>
DESPUES: <div class="feat-visual-bg" id="qr-bg" style="background-image:url('https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=900&auto=format&q=80')"></div>
```

- [ ] **Step 6: Feature Premiere**

Dentro de `<div id="premiere" class="feature-split">`, en el `.feat-content`:

```
ANTES: <span class="feat-label">Premiere</span>
DESPUES: <span class="feat-label" id="pm-label">Premiere</span>
```

```
ANTES: <h2 class="feat-title">La entrega que se siente<br>como un estreno</h2>
DESPUES: <h2 class="feat-title" id="pm-title">La entrega que se siente<br>como un estreno</h2>
```

```
ANTES: <p class="feat-desc">Tu primer vistazo a las fotos y el video presentado con una experiencia cinematográfica. Una página personalizada que sorprende desde el primer segundo.</p>
DESPUES: <p class="feat-desc" id="pm-desc">Tu primer vistazo a las fotos y el video presentado con una experiencia cinematográfica. Una página personalizada que sorprende desde el primer segundo.</p>
```

```
ANTES: <li>Página de entrega con diseño exclusivo para tu evento</li>
      <li>Reproducción de video con estética de streaming</li>
      <li>Galería de fotos con navegación elegante</li>
      <li>Link privado para compartir solo con quien quieras</li>
      <li>Acceso desde cualquier dispositivo</li>
DESPUES: <li id="pm-feat-0">Página de entrega con diseño exclusivo para tu evento</li>
      <li id="pm-feat-1">Reproducción de video con estética de streaming</li>
      <li id="pm-feat-2">Galería de fotos con navegación elegante</li>
      <li id="pm-feat-3">Link privado para compartir solo con quien quieras</li>
      <li id="pm-feat-4">Acceso desde cualquier dispositivo</li>
```

```
ANTES: <a href="https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20Premiere" target="_blank" class="btn-primary" style="width:fit-content">Consultar precio</a>
DESPUES: <a href="https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20Premiere" target="_blank" class="btn-primary" id="pm-btn" style="width:fit-content">Consultar precio</a>
```

En `.feat-visual` de #premiere:
```
ANTES: <div class="feat-visual-bg" style="background-image:url('https://images.unsplash.com/photo-1485846234645-a62644f84728?w=900&auto=format&q=80')"></div>
DESPUES: <div class="feat-visual-bg" id="pm-bg" style="background-image:url('https://images.unsplash.com/photo-1485846234645-a62644f84728?w=900&auto=format&q=80')"></div>
```

- [ ] **Step 7: Servicios, Cómo Funciona, FAQ, CTA, Footer**

Sección #servicios:
```
ANTES: <span class="sec-label">Nuestros servicios</span>
DESPUES: <span class="sec-label" id="svc-eyebrow">Nuestros servicios</span>
```
```
ANTES: <h2 class="sec-title">Tres experiencias digitales,<br><em>un solo proveedor</em></h2>
DESPUES: <h2 class="sec-title" id="svc-title">Tres experiencias digitales,<br><em>un solo proveedor</em></h2>
```

Las 3 cards (IDs por orden de aparición en el HTML):
```
ANTES: <div class="card-name">Invitación Digital</div>
DESPUES: <div class="card-name" id="svc-name-0">Invitación Digital</div>
```
```
ANTES: <div class="card-desc">Invitación animada con cuenta regresiva, música de fondo, mapa interactivo y confirmación de asistencia. Sin papel, con estilo.</div>
DESPUES: <div class="card-desc" id="svc-desc-0">Invitación animada con cuenta regresiva, música de fondo, mapa interactivo y confirmación de asistencia. Sin papel, con estilo.</div>
```
```
ANTES: <div class="card-price">Desde $12.000 <small>ARS</small></div>
DESPUES: <div class="card-price" id="svc-price-0">Desde $12.000 <small>ARS</small></div>
```
Repetir para card 1 (`svc-name-1`, `svc-desc-1`, `svc-price-1` con "QR Fiestas" / $15.000) y card 2 (`svc-name-2`, `svc-desc-2`, `svc-price-2` con "Premiere" / $20.000).

Sección #como-funciona:
```
ANTES: <span class="sec-label">Proceso</span>
DESPUES: <span class="sec-label" id="cf-eyebrow">Proceso</span>
```
```
ANTES: <h2 class="sec-title">Simple, rápido<br><em>y sin complicaciones</em></h2>
DESPUES: <h2 class="sec-title" id="cf-title">Simple, rápido<br><em>y sin complicaciones</em></h2>
```
Los 3 pasos:
```
ANTES: <div class="step-name">Consultás</div>
DESPUES: <div class="step-name" id="step-name-0">Consultás</div>
```
```
ANTES: <div class="step-desc">Nos escribís por WhatsApp con la fecha y tipo de evento. Te respondemos el mismo día con disponibilidad y opciones.</div>
DESPUES: <div class="step-desc" id="step-desc-0">Nos escribís por WhatsApp con la fecha y tipo de evento. Te respondemos el mismo día con disponibilidad y opciones.</div>
```
Repetir para pasos 1 (`step-name-1`/`step-desc-1` — Personalizamos) y 2 (`step-name-2`/`step-desc-2` — Lo recibís).

Sección #faq — agregar `id="faq-list"` al `<section>` (para regenerar los items), y IDs al eyebrow y título:
```
ANTES: <section id="faq" class="section">
  <span class="sec-label">Preguntas frecuentes</span>
  <h2 class="sec-title">¿Tenés dudas?<br><em>Las respondemos todas</em></h2>
DESPUES: <section id="faq" class="section">
  <span class="sec-label" id="faq-eyebrow">Preguntas frecuentes</span>
  <h2 class="sec-title" id="faq-title">¿Tenés dudas?<br><em>Las respondemos todas</em></h2>
```

Nota: `faq-list` no se agrega al `<section id="faq">` porque ya tiene su ID. El JS usará `document.getElementById('faq')` como contenedor para regenerar los `.faq-item`s. Agregar el ID `faq-list` a un `<div>` wrapper alrededor de los items del FAQ:
```
Envolver los .faq-item existentes en:
<div id="faq-list">
  ... (todos los .faq-item)
</div>
```

CTA Final:
```
ANTES: <h2 class="cta-title">¿Listo para empezar?</h2>
DESPUES: <h2 class="cta-title" id="cta-title">¿Listo para empezar?</h2>
```
```
ANTES: <p class="cta-sub">Escribinos con la fecha y el tipo de evento. Te respondemos el mismo día con disponibilidad, opciones y presupuesto.</p>
DESPUES: <p class="cta-sub" id="cta-desc">Escribinos con la fecha y el tipo de evento. Te respondemos el mismo día con disponibilidad, opciones y presupuesto.</p>
```
```
ANTES: <a href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" class="btn-primary">
        <svg width="18"
DESPUES: <a href="https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE" target="_blank" class="btn-primary" id="cta-btn">
        <svg width="18"
```

Footer — envolver el texto copyright en un span:
```
ANTES: <p>© 2026 KUERRE · Servicios digitales para eventos · <a href="https://wa.me/541162557763" target="_blank" style="color:rgba(192,144,224,.5);text-decoration:none">WhatsApp</a></p>
DESPUES: <p><span id="footer-copyright">© 2026 KUERRE · Servicios digitales para eventos</span> · <a href="https://wa.me/541162557763" target="_blank" style="color:rgba(192,144,224,.5);text-decoration:none">WhatsApp</a></p>
```

---

### Task 2: Agregar `applyContent()` al `index.html`

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\index.html`

**Interfaces:**
- Consumes: IDs del Task 1, Worker endpoint `GET /crd_content`
- Produce: función `applyContent(c)` que aplica el JSON al DOM

- [ ] **Step 1: Agregar el bloque JS de init de contenido**

Dentro del `<script>` existente al final del body (donde ya está el fetch de `/site/config`), después del IIFE que carga el logo (`})()`), agregar:

```js
// ── CONTENT CMS ──
(async function() {
  try {
    const r = await fetch('https://kuerre-worker.cristian-romero-digital.workers.dev/crd_content');
    if (!r.ok) return;
    const c = await r.json();
    applyContent(c);
  } catch(e) {}
})();

function applyContent(c) {
  function set(id, val) {
    if (!val) return;
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  function setHTML(id, val) {
    if (!val) return;
    const el = document.getElementById(id);
    if (el) el.innerHTML = val.replace(/\n/g, '<br>');
  }
  function setBg(id, url) {
    if (!url) return;
    const el = document.getElementById(id);
    if (el) el.style.backgroundImage = "url('" + url + "')";
  }
  function setHref(id, url) {
    if (!url) return;
    const el = document.getElementById(id);
    if (el) el.href = url;
  }
  function setBtnText(id, text) {
    if (!text) return;
    const btn = document.getElementById(id);
    if (!btn) return;
    const svg = btn.querySelector('svg');
    btn.innerHTML = (svg ? svg.outerHTML + ' ' : '') + text;
  }

  // Global
  const g = c.global || {};
  set('topbar-text', g.topbar_left);
  set('footer-copyright', g.footer_copyright);
  if (g.nav_cta_text) {
    set('nav-cta-link', g.nav_cta_text);
    set('mobile-cta-link', g.nav_cta_text);
  }
  if (g.nav_cta_url) {
    setHref('nav-cta-link', g.nav_cta_url);
    setHref('mobile-cta-link', g.nav_cta_url);
  }

  // Hero
  const h = c.hero || {};
  set('hero-eyebrow', h.eyebrow);
  setHTML('hero-title', h.title);
  set('hero-desc', h.desc);
  setBtnText('hero-btn1', h.btn1_text);
  if (h.btn1_url) setHref('hero-btn1', h.btn1_url);
  set('hero-btn2', h.btn2_text);
  setBg('hero-bg', h.bg_image);

  // Trust Bar
  (c.trust || []).forEach(function(item, i) {
    set('trust-num-' + i, item.num);
    set('trust-label-' + i, item.label);
  });

  // Feature sections
  var sections = [
    { key: 'invitaciones', pfx: 'inv' },
    { key: 'qr',           pfx: 'qr'  },
    { key: 'premiere',     pfx: 'pm'  }
  ];
  sections.forEach(function(s) {
    var d = c[s.key] || {};
    var p = s.pfx;
    set(p + '-label', d.label);
    setHTML(p + '-title', d.title);
    set(p + '-desc', d.desc);
    (d.features || []).forEach(function(f, i) { set(p + '-feat-' + i, f); });
    set(p + '-btn', d.btn_text);
    if (d.btn_url) setHref(p + '-btn', d.btn_url);
    setBg(p + '-bg', d.bg_image);
  });

  // Servicios
  var svc = c.servicios || {};
  set('svc-eyebrow', svc.eyebrow);
  setHTML('svc-title', svc.title);
  (svc.cards || []).forEach(function(card, i) {
    set('svc-name-' + i, card.name);
    set('svc-desc-' + i, card.desc);
    if (card.price) {
      var el = document.getElementById('svc-price-' + i);
      if (el) el.innerHTML = card.price + ' <small>ARS</small>';
    }
  });

  // Cómo Funciona
  var cf = c.como_funciona || {};
  set('cf-eyebrow', cf.eyebrow);
  setHTML('cf-title', cf.title);
  (cf.steps || []).forEach(function(step, i) {
    set('step-name-' + i, step.name);
    set('step-desc-' + i, step.desc);
  });

  // FAQ
  var faq = c.faq || {};
  set('faq-eyebrow', faq.eyebrow);
  setHTML('faq-title', faq.title);
  if (faq.items && faq.items.length) {
    var list = document.getElementById('faq-list');
    if (list) {
      list.innerHTML = faq.items.map(function(item) {
        return '<div class="faq-item" onclick="toggleFaq(this)">' +
          '<div class="faq-q">' + item.q + '<span class="faq-icon">+</span></div>' +
          '<div class="faq-a">' + item.a + '</div>' +
          '</div>';
      }).join('');
    }
  }

  // CTA Final
  var cta = c.cta_final || {};
  setHTML('cta-title', cta.title);
  set('cta-desc', cta.desc);
  setBtnText('cta-btn', cta.btn_text);
  if (cta.btn_url) setHref('cta-btn', cta.btn_url);
}
```

- [ ] **Step 2: Verificar en browser**

Abrir `Desarrollo/index.html` en el browser. La página debe cargar normalmente con los valores hardcodeados (el Worker no tiene `crd_content` aún — fallback correcto). Sin errores de JS en consola.

---

### Task 3: Reemplazar el HTML de `page-content` en `admin.html`

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html`

**Interfaces:**
- Consumes: IDs de inputs que serán leídos por las funciones JS del Task 4
- Produce: el bloque HTML `<div class="page" id="page-content">` con tabs KUERRE

- [ ] **Step 1: Reemplazar el bloque completo `<div class="page" id="page-content">` ... `</div><!-- /page-content -->`**

Usar Edit tool. El old_string es desde `<div class="page" id="page-content">` hasta `</div><!-- /page-content -->`. Reemplazar con:

```html
      <div class="page" id="page-content">
        <h2 class="section-h" style="margin-bottom:4px">Editor de Contenido</h2>
        <p style="font-size:12px;color:var(--gray);margin-bottom:28px;letter-spacing:1px">Editá textos e imágenes del sitio. Se sincronizan automáticamente con el index.</p>

        <!-- TABS -->
        <div style="display:flex;gap:1px;background:rgba(255,255,255,0.06);margin-bottom:28px;flex-wrap:wrap">
          <button class="cnt-tab active" onclick="switchContentTab('global',this)">Global</button>
          <button class="cnt-tab" onclick="switchContentTab('hero',this)">Hero</button>
          <button class="cnt-tab" onclick="switchContentTab('trust',this)">Trust Bar</button>
          <button class="cnt-tab" onclick="switchContentTab('invitaciones',this)">Invitaciones</button>
          <button class="cnt-tab" onclick="switchContentTab('qr',this)">QR Fiestas</button>
          <button class="cnt-tab" onclick="switchContentTab('premiere',this)">Premiere</button>
          <button class="cnt-tab" onclick="switchContentTab('servicios',this)">Servicios</button>
          <button class="cnt-tab" onclick="switchContentTab('como',this)">Cómo Funciona</button>
          <button class="cnt-tab" onclick="switchContentTab('faq',this)">FAQ</button>
          <button class="cnt-tab" onclick="switchContentTab('cta',this)">CTA Final</button>
        </div>

        <!-- ── GLOBAL ── -->
        <div class="cnt-panel" id="cnt-global">
          <div class="settings-section">
            <div class="settings-section-title">Datos globales del sitio</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Número WhatsApp (sin + ni espacios)</label><input class="form-input" id="cnt-global-wa" placeholder="541162557763"></div>
              <div class="form-group"><label class="form-label">URL Instagram</label><input class="form-input" id="cnt-global-ig" placeholder="https://instagram.com/kuerre.digital"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Texto topbar izquierda</label><input class="form-input" id="cnt-global-topbar" placeholder="Buenos Aires, Argentina"></div>
              <div class="form-group"><label class="form-label">Texto botón nav "Consultar"</label><input class="form-input" id="cnt-global-nav-cta" placeholder="Consultar"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">URL botón nav (WhatsApp)</label><input class="form-input" id="cnt-global-nav-cta-url" placeholder="https://wa.me/541162557763?text=..."></div>
              <div class="form-group"><label class="form-label">Copyright footer</label><input class="form-input" id="cnt-global-footer" placeholder="© 2026 KUERRE · Servicios digitales para eventos"></div>
            </div>
          </div>
          <button class="btn-add" onclick="saveContentSection('global')">Guardar Global</button>
        </div>

        <!-- ── HERO ── -->
        <div class="cnt-panel" id="cnt-hero" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Sección Hero</div>
            <div class="form-group"><label class="form-label">Eyebrow (texto pequeño arriba del título)</label><input class="form-input" id="cnt-hero-eyebrow" placeholder="Servicios digitales para eventos"></div>
            <div class="form-group"><label class="form-label">Título principal (Enter = salto de línea)</label><textarea class="form-textarea" id="cnt-hero-title" style="min-height:60px" placeholder="Hacé que tu evento&#10;viva para siempre"></textarea></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-hero-desc" placeholder="Galería colaborativa en tiempo real..."></textarea></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Texto botón principal</label><input class="form-input" id="cnt-hero-btn1" placeholder="Consultá por WhatsApp"></div>
              <div class="form-group"><label class="form-label">URL botón principal (WhatsApp)</label><input class="form-input" id="cnt-hero-btn1-url" placeholder="https://wa.me/..."></div>
            </div>
            <div class="form-group"><label class="form-label">Texto botón secundario</label><input class="form-input" id="cnt-hero-btn2" placeholder="Ver servicios"></div>
            <div class="form-group"><label class="form-label">Imagen de fondo (URL)</label><input class="form-input" id="cnt-hero-bg" placeholder="https://images.unsplash.com/photo-..."></div>
          </div>
          <button class="btn-add" onclick="saveContentSection('hero')">Guardar Hero</button>
        </div>

        <!-- ── TRUST BAR ── -->
        <div class="cnt-panel" id="cnt-trust" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Trust Bar — 4 estadísticas</div>
            <p style="font-size:12px;color:var(--gray);margin-bottom:16px;letter-spacing:1px">Número grande + etiqueta debajo para cada stat.</p>
            <div class="form-row" style="margin-bottom:10px">
              <div class="form-group"><label class="form-label">Número 1</label><input class="form-input" id="cnt-trust-num-0" placeholder="+100"></div>
              <div class="form-group"><label class="form-label">Etiqueta 1</label><input class="form-input" id="cnt-trust-label-0" placeholder="Eventos realizados"></div>
            </div>
            <div class="form-row" style="margin-bottom:10px">
              <div class="form-group"><label class="form-label">Número 2</label><input class="form-input" id="cnt-trust-num-1" placeholder="3"></div>
              <div class="form-group"><label class="form-label">Etiqueta 2</label><input class="form-input" id="cnt-trust-label-1" placeholder="Servicios digitales"></div>
            </div>
            <div class="form-row" style="margin-bottom:10px">
              <div class="form-group"><label class="form-label">Número 3</label><input class="form-input" id="cnt-trust-num-2" placeholder="0"></div>
              <div class="form-group"><label class="form-label">Etiqueta 3</label><input class="form-input" id="cnt-trust-label-2" placeholder="Apps que instalar"></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Número 4</label><input class="form-input" id="cnt-trust-num-3" placeholder="24h"></div>
              <div class="form-group"><label class="form-label">Etiqueta 4</label><input class="form-input" id="cnt-trust-label-3" placeholder="Tiempo de respuesta"></div>
            </div>
          </div>
          <button class="btn-add" onclick="saveContentSection('trust')">Guardar Trust Bar</button>
        </div>

        <!-- ── INVITACIONES ── -->
        <div class="cnt-panel" id="cnt-invitaciones" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Sección Invitaciones Digitales</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Label (texto pequeño)</label><input class="form-input" id="cnt-inv-label" placeholder="Invitación Digital"></div>
            </div>
            <div class="form-group"><label class="form-label">Título (Enter = salto de línea)</label><textarea class="form-textarea" id="cnt-inv-title" style="min-height:60px" placeholder="Animada, musical&#10;e interactiva"></textarea></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-inv-desc"></textarea></div>
            <div class="settings-section-title" style="margin-top:16px;font-size:10px">Features (5 ítems)</div>
            <div class="form-group"><label class="form-label">Feature 1</label><input class="form-input" id="cnt-inv-feat-0"></div>
            <div class="form-group"><label class="form-label">Feature 2</label><input class="form-input" id="cnt-inv-feat-1"></div>
            <div class="form-group"><label class="form-label">Feature 3</label><input class="form-input" id="cnt-inv-feat-2"></div>
            <div class="form-group"><label class="form-label">Feature 4</label><input class="form-input" id="cnt-inv-feat-3"></div>
            <div class="form-group"><label class="form-label">Feature 5</label><input class="form-input" id="cnt-inv-feat-4"></div>
            <div class="form-row" style="margin-top:8px">
              <div class="form-group"><label class="form-label">Texto botón</label><input class="form-input" id="cnt-inv-btn" placeholder="Consultar precio"></div>
              <div class="form-group"><label class="form-label">URL botón (WhatsApp)</label><input class="form-input" id="cnt-inv-btn-url" placeholder="https://wa.me/..."></div>
            </div>
            <div class="form-group"><label class="form-label">Imagen de fondo (URL)</label><input class="form-input" id="cnt-inv-bg" placeholder="https://images.unsplash.com/..."></div>
          </div>
          <button class="btn-add" onclick="saveContentSection('invitaciones')">Guardar Invitaciones</button>
        </div>

        <!-- ── QR FIESTAS ── -->
        <div class="cnt-panel" id="cnt-qr" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Sección QR Fiestas</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Label (texto pequeño)</label><input class="form-input" id="cnt-qr-label" placeholder="QR Fiestas"></div>
            </div>
            <div class="form-group"><label class="form-label">Título (Enter = salto de línea)</label><textarea class="form-textarea" id="cnt-qr-title" style="min-height:60px" placeholder="La galería colaborativa&#10;de tu evento"></textarea></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-qr-desc"></textarea></div>
            <div class="settings-section-title" style="margin-top:16px;font-size:10px">Features (5 ítems)</div>
            <div class="form-group"><label class="form-label">Feature 1</label><input class="form-input" id="cnt-qr-feat-0"></div>
            <div class="form-group"><label class="form-label">Feature 2</label><input class="form-input" id="cnt-qr-feat-1"></div>
            <div class="form-group"><label class="form-label">Feature 3</label><input class="form-input" id="cnt-qr-feat-2"></div>
            <div class="form-group"><label class="form-label">Feature 4</label><input class="form-input" id="cnt-qr-feat-3"></div>
            <div class="form-group"><label class="form-label">Feature 5</label><input class="form-input" id="cnt-qr-feat-4"></div>
            <div class="form-row" style="margin-top:8px">
              <div class="form-group"><label class="form-label">Texto botón</label><input class="form-input" id="cnt-qr-btn" placeholder="Consultar precio"></div>
              <div class="form-group"><label class="form-label">URL botón (WhatsApp)</label><input class="form-input" id="cnt-qr-btn-url" placeholder="https://wa.me/..."></div>
            </div>
            <div class="form-group"><label class="form-label">Imagen de fondo (URL)</label><input class="form-input" id="cnt-qr-bg" placeholder="https://images.unsplash.com/..."></div>
          </div>
          <button class="btn-add" onclick="saveContentSection('qr')">Guardar QR Fiestas</button>
        </div>

        <!-- ── PREMIERE ── -->
        <div class="cnt-panel" id="cnt-premiere" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Sección Premiere</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Label (texto pequeño)</label><input class="form-input" id="cnt-pm-label" placeholder="Premiere"></div>
            </div>
            <div class="form-group"><label class="form-label">Título (Enter = salto de línea)</label><textarea class="form-textarea" id="cnt-pm-title" style="min-height:60px" placeholder="La entrega que se siente&#10;como un estreno"></textarea></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-pm-desc"></textarea></div>
            <div class="settings-section-title" style="margin-top:16px;font-size:10px">Features (5 ítems)</div>
            <div class="form-group"><label class="form-label">Feature 1</label><input class="form-input" id="cnt-pm-feat-0"></div>
            <div class="form-group"><label class="form-label">Feature 2</label><input class="form-input" id="cnt-pm-feat-1"></div>
            <div class="form-group"><label class="form-label">Feature 3</label><input class="form-input" id="cnt-pm-feat-2"></div>
            <div class="form-group"><label class="form-label">Feature 4</label><input class="form-input" id="cnt-pm-feat-3"></div>
            <div class="form-group"><label class="form-label">Feature 5</label><input class="form-input" id="cnt-pm-feat-4"></div>
            <div class="form-row" style="margin-top:8px">
              <div class="form-group"><label class="form-label">Texto botón</label><input class="form-input" id="cnt-pm-btn" placeholder="Consultar precio"></div>
              <div class="form-group"><label class="form-label">URL botón (WhatsApp)</label><input class="form-input" id="cnt-pm-btn-url" placeholder="https://wa.me/..."></div>
            </div>
            <div class="form-group"><label class="form-label">Imagen de fondo (URL)</label><input class="form-input" id="cnt-pm-bg" placeholder="https://images.unsplash.com/..."></div>
          </div>
          <button class="btn-add" onclick="saveContentSection('premiere')">Guardar Premiere</button>
        </div>

        <!-- ── SERVICIOS ── -->
        <div class="cnt-panel" id="cnt-servicios" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Encabezado de la sección</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Eyebrow</label><input class="form-input" id="cnt-svc-eyebrow" placeholder="Nuestros servicios"></div>
              <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="cnt-svc-title" placeholder="Tres experiencias digitales, un solo proveedor"></div>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Card 1 — Invitación Digital</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="cnt-svc-name-0" placeholder="Invitación Digital"></div>
              <div class="form-group"><label class="form-label">Precio (sin ARS)</label><input class="form-input" id="cnt-svc-price-0" placeholder="Desde $12.000"></div>
            </div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-svc-desc-0"></textarea></div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Card 2 — QR Fiestas</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="cnt-svc-name-1" placeholder="QR Fiestas"></div>
              <div class="form-group"><label class="form-label">Precio (sin ARS)</label><input class="form-input" id="cnt-svc-price-1" placeholder="Desde $15.000"></div>
            </div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-svc-desc-1"></textarea></div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Card 3 — Premiere</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="cnt-svc-name-2" placeholder="Premiere"></div>
              <div class="form-group"><label class="form-label">Precio (sin ARS)</label><input class="form-input" id="cnt-svc-price-2" placeholder="Desde $20.000"></div>
            </div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-svc-desc-2"></textarea></div>
          </div>
          <button class="btn-add" onclick="saveContentSection('servicios')">Guardar Servicios</button>
        </div>

        <!-- ── CÓMO FUNCIONA ── -->
        <div class="cnt-panel" id="cnt-como" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Encabezado</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Eyebrow</label><input class="form-input" id="cnt-cf-eyebrow" placeholder="Proceso"></div>
              <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="cnt-cf-title" placeholder="Simple, rápido y sin complicaciones"></div>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Paso 01</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="cnt-cf-step-name-0" placeholder="Consultás"></div>
            </div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-cf-step-desc-0"></textarea></div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Paso 02</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="cnt-cf-step-name-1" placeholder="Personalizamos"></div>
            </div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-cf-step-desc-1"></textarea></div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Paso 03</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Nombre</label><input class="form-input" id="cnt-cf-step-name-2" placeholder="Lo recibís"></div>
            </div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-cf-step-desc-2"></textarea></div>
          </div>
          <button class="btn-add" onclick="saveContentSection('como')">Guardar Cómo Funciona</button>
        </div>

        <!-- ── FAQ ── -->
        <div class="cnt-panel" id="cnt-faq" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">Encabezado</div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Eyebrow</label><input class="form-input" id="cnt-faq-eyebrow" placeholder="Preguntas frecuentes"></div>
              <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="cnt-faq-title" placeholder="¿Tenés dudas? Las respondemos todas"></div>
            </div>
          </div>
          <div class="settings-section">
            <div class="settings-section-title">Preguntas y respuestas</div>
            <div id="cnt-faq-list"></div>
            <button class="btn-sm" onclick="addFaqItem()" style="margin-top:12px">+ Agregar pregunta</button>
          </div>
          <button class="btn-add" onclick="saveContentSection('faq')">Guardar FAQ</button>
        </div>

        <!-- ── CTA FINAL ── -->
        <div class="cnt-panel" id="cnt-cta" style="display:none">
          <div class="settings-section">
            <div class="settings-section-title">CTA Final</div>
            <div class="form-group"><label class="form-label">Título</label><input class="form-input" id="cnt-cta-title" placeholder="¿Listo para empezar?"></div>
            <div class="form-group"><label class="form-label">Descripción</label><textarea class="form-textarea" id="cnt-cta-desc"></textarea></div>
            <div class="form-row">
              <div class="form-group"><label class="form-label">Texto botón</label><input class="form-input" id="cnt-cta-btn" placeholder="Consultá por WhatsApp"></div>
              <div class="form-group"><label class="form-label">URL botón (WhatsApp)</label><input class="form-input" id="cnt-cta-btn-url" placeholder="https://wa.me/..."></div>
            </div>
          </div>
          <button class="btn-add" onclick="saveContentSection('cta')">Guardar CTA Final</button>
        </div>

      </div><!-- /page-content -->
```

---

### Task 4: Reemplazar las funciones JS de contenido en `admin.html`

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html`

**Interfaces:**
- Consumes: IDs de inputs del Task 3, `getContent()`, `setContent()`, `toast()`, `syncToCloud()` (todas ya existen)
- Produce: `loadContentPage()`, `saveContentSection()`, `renderFaqEditor()`, `addFaqItem()`, `collectFaqItems()`, `CONTENT_DEFAULTS`

- [ ] **Step 1: Reemplazar `getContent()` y `setContent()`**

Localizar en el JS del admin:
```javascript
function getContent() {
  try { return JSON.parse(localStorage.getItem('crd_content')) || {}; } catch(e) { return {}; }
}
function setContent(data) {
  const str = JSON.stringify(data);
  localStorage.setItem('crd_content', str);
  syncToCloud('crd_content', str);
}
```

Reemplazar con (idéntico — sin cambios, ya están bien):
```javascript
function getContent() {
  try { return JSON.parse(localStorage.getItem('crd_content')) || {}; } catch(e) { return {}; }
}
function setContent(data) {
  const str = JSON.stringify(data);
  localStorage.setItem('crd_content', str);
  syncToCloud('crd_content', str);
}
```

**No se toca nada** — `getContent`/`setContent` ya están correctas. Pasar al siguiente step.

- [ ] **Step 2: Agregar `CONTENT_DEFAULTS` antes de `loadContentPage()`**

Localizar la línea `function loadContentPage() {` y agregar ANTES de ella:

```javascript
const CONTENT_DEFAULTS = {
  global: {
    wa_number: '541162557763',
    ig_url: 'https://instagram.com/kuerre.digital',
    topbar_left: 'Buenos Aires, Argentina',
    nav_cta_text: 'Consultar',
    nav_cta_url: 'https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE',
    footer_copyright: '© 2026 KUERRE · Servicios digitales para eventos'
  },
  hero: {
    eyebrow: 'Servicios digitales para eventos',
    title: 'Hacé que tu evento\nviva para siempre',
    desc: 'Galería colaborativa en tiempo real, entrega cinematográfica e invitación digital. Todo lo que tu evento necesita, en un solo lugar.',
    btn1_text: 'Consultá por WhatsApp',
    btn1_url: 'https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE',
    btn2_text: 'Ver servicios',
    bg_image: 'https://images.unsplash.com/photo-1519741497674-611481863552?w=1600&auto=format&q=80'
  },
  trust: [
    { num: '+100', label: 'Eventos realizados' },
    { num: '3',    label: 'Servicios digitales' },
    { num: '0',    label: 'Apps que instalar' },
    { num: '24h',  label: 'Tiempo de respuesta' }
  ],
  invitaciones: {
    label: 'Invitación Digital',
    title: 'Animada, musical\ne interactiva',
    desc: 'Cuenta regresiva en vivo, música de fondo, mapa interactivo, confirmación de asistencia y mucho más. Sin papel, con estilo.',
    features: ['Cuenta regresiva al evento en tiempo real','Música de fondo elegible por el cliente','Confirmación de asistencia integrada','Link a Google Maps con la ubicación','Compartible por WhatsApp, Instagram y email'],
    btn_text: 'Consultar precio',
    btn_url: 'https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20Invitaci%C3%B3n%20Digital',
    bg_image: 'https://images.unsplash.com/photo-1519741347686-c1e0aadf4611?w=900&auto=format&q=80'
  },
  qr: {
    label: 'QR Fiestas',
    title: 'La galería colaborativa\nde tu evento',
    desc: 'Tus invitados escanean un QR y en segundos están subiendo fotos desde su celular. Una galería que crece sola durante la fiesta.',
    features: ['Sin descargar ninguna aplicación — solo el navegador','Galería en tiempo real visible para todos los invitados','Descarga masiva de todas las fotos al finalizar','QR imprimible para colocar en las mesas','Disponible 30 días después del evento'],
    btn_text: 'Consultar precio',
    btn_url: 'https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20QR%20Fiestas',
    bg_image: 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=900&auto=format&q=80'
  },
  premiere: {
    label: 'Premiere',
    title: 'La entrega que se siente\ncomo un estreno',
    desc: 'Tu primer vistazo a las fotos y el video presentado con una experiencia cinematográfica. Una página personalizada que sorprende desde el primer segundo.',
    features: ['Página de entrega con diseño exclusivo para tu evento','Reproducción de video con estética de streaming','Galería de fotos con navegación elegante','Link privado para compartir solo con quien quieras','Acceso desde cualquier dispositivo'],
    btn_text: 'Consultar precio',
    btn_url: 'https://wa.me/541162557763?text=Hola%2C%20quiero%20info%20sobre%20Premiere',
    bg_image: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=900&auto=format&q=80'
  },
  servicios: {
    eyebrow: 'Nuestros servicios',
    title: 'Tres experiencias digitales,\nun solo proveedor',
    cards: [
      { name: 'Invitación Digital', desc: 'Invitación animada con cuenta regresiva, música de fondo, mapa interactivo y confirmación de asistencia. Sin papel, con estilo.', price: 'Desde $12.000' },
      { name: 'QR Fiestas', desc: 'Tus invitados escanean un QR y suben fotos en tiempo real. Una galería colaborativa con el espíritu del evento, disponible para todos.', price: 'Desde $15.000' },
      { name: 'Premiere', desc: 'Tu primer vistazo a las fotos y el video presentado con experiencia cinematográfica. Una entrega que se siente como estreno de película.', price: 'Desde $20.000' }
    ]
  },
  como_funciona: {
    eyebrow: 'Proceso',
    title: 'Simple, rápido\ny sin complicaciones',
    steps: [
      { name: 'Consultás', desc: 'Nos escribís por WhatsApp con la fecha y tipo de evento. Te respondemos el mismo día con disponibilidad y opciones.' },
      { name: 'Personalizamos', desc: 'Configuramos el servicio con los datos de tu evento: nombres, fecha, colores, música y todo el contenido que necesitás.' },
      { name: 'Lo recibís', desc: 'Te enviamos el link listo para compartir. Tus invitados solo necesitan abrirlo en su celular, sin instalar nada.' }
    ]
  },
  faq: {
    eyebrow: 'Preguntas frecuentes',
    title: '¿Tenés dudas?\nLas respondemos todas',
    items: [
      { q: '¿Cuánto tiempo antes debo contratar?', a: 'Recomendamos contactarnos con al menos 2 semanas de anticipación para tener tiempo de personalizar todo. Para fechas muy cercanas consultanos igual — hacemos lo posible para no dejar ningún evento sin servicio.' },
      { q: '¿Los servicios se pueden combinar?', a: 'Sí, y es lo que recomendamos. Podés contratar uno, dos o los tres servicios para el mismo evento. Al combinarlos obtenés un precio especial.' },
      { q: '¿Funciona en cualquier celular?', a: 'Sí. Todas las páginas están optimizadas para mobile — tus invitados solo necesitan abrir el link en su navegador, sea iPhone o Android. No hay nada que instalar.' },
      { q: '¿Cuánto tiempo permanece activo el servicio?', a: 'Por defecto 30 días desde la fecha del evento. Podemos extender el período si necesitás que esté disponible más tiempo para que todos los invitados puedan verlo.' },
      { q: '¿Puedo ver una demo antes de contratar?', a: '¡Claro! Consultanos por WhatsApp y te mandamos links de demo de cada servicio para que los explores antes de decidir. Sin compromiso.' }
    ]
  },
  cta_final: {
    title: '¿Listo para empezar?',
    desc: 'Escribinos con la fecha y el tipo de evento. Te respondemos el mismo día con disponibilidad, opciones y presupuesto.',
    btn_text: 'Consultá por WhatsApp',
    btn_url: 'https://wa.me/541162557763?text=Hola%2C%20me%20interesa%20un%20servicio%20de%20KUERRE'
  }
};
```

- [ ] **Step 3: Reemplazar `loadContentPage()`**

Localizar el bloque `function loadContentPage() { ... }` completo y reemplazar con:

```javascript
function loadContentPage() {
  const c = getContent();
  const d = CONTENT_DEFAULTS;
  function fill(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }

  // Global
  const g = c.global || {};
  fill('cnt-global-wa',       g.wa_number       || d.global.wa_number);
  fill('cnt-global-ig',       g.ig_url          || d.global.ig_url);
  fill('cnt-global-topbar',   g.topbar_left     || d.global.topbar_left);
  fill('cnt-global-nav-cta',  g.nav_cta_text    || d.global.nav_cta_text);
  fill('cnt-global-nav-cta-url', g.nav_cta_url  || d.global.nav_cta_url);
  fill('cnt-global-footer',   g.footer_copyright|| d.global.footer_copyright);

  // Hero
  const h = c.hero || {};
  fill('cnt-hero-eyebrow',  h.eyebrow   || d.hero.eyebrow);
  fill('cnt-hero-title',    h.title     || d.hero.title);
  fill('cnt-hero-desc',     h.desc      || d.hero.desc);
  fill('cnt-hero-btn1',     h.btn1_text || d.hero.btn1_text);
  fill('cnt-hero-btn1-url', h.btn1_url  || d.hero.btn1_url);
  fill('cnt-hero-btn2',     h.btn2_text || d.hero.btn2_text);
  fill('cnt-hero-bg',       h.bg_image  || d.hero.bg_image);

  // Trust
  const t = c.trust && c.trust.length ? c.trust : d.trust;
  [0,1,2,3].forEach(i => {
    fill('cnt-trust-num-'   + i, (t[i] || d.trust[i]).num);
    fill('cnt-trust-label-' + i, (t[i] || d.trust[i]).label);
  });

  // Feature sections
  [['invitaciones','cnt-inv'],['qr','cnt-qr'],['premiere','cnt-pm']].forEach(([key, pfx]) => {
    const s = c[key] || {};
    const df = d[key];
    fill(pfx + '-label',   s.label    || df.label);
    fill(pfx + '-title',   s.title    || df.title);
    fill(pfx + '-desc',    s.desc     || df.desc);
    const feats = s.features && s.features.length ? s.features : df.features;
    [0,1,2,3,4].forEach(i => fill(pfx + '-feat-' + i, feats[i] || ''));
    fill(pfx + '-btn',     s.btn_text || df.btn_text);
    fill(pfx + '-btn-url', s.btn_url  || df.btn_url);
    fill(pfx + '-bg',      s.bg_image || df.bg_image);
  });

  // Servicios
  const svc = c.servicios || {};
  fill('cnt-svc-eyebrow', svc.eyebrow || d.servicios.eyebrow);
  fill('cnt-svc-title',   svc.title   || d.servicios.title);
  const cards = svc.cards && svc.cards.length ? svc.cards : d.servicios.cards;
  [0,1,2].forEach(i => {
    fill('cnt-svc-name-'  + i, (cards[i] || d.servicios.cards[i]).name);
    fill('cnt-svc-desc-'  + i, (cards[i] || d.servicios.cards[i]).desc);
    fill('cnt-svc-price-' + i, (cards[i] || d.servicios.cards[i]).price);
  });

  // Cómo Funciona
  const cf = c.como_funciona || {};
  fill('cnt-cf-eyebrow', cf.eyebrow || d.como_funciona.eyebrow);
  fill('cnt-cf-title',   cf.title   || d.como_funciona.title);
  const steps = cf.steps && cf.steps.length ? cf.steps : d.como_funciona.steps;
  [0,1,2].forEach(i => {
    fill('cnt-cf-step-name-' + i, (steps[i] || d.como_funciona.steps[i]).name);
    fill('cnt-cf-step-desc-' + i, (steps[i] || d.como_funciona.steps[i]).desc);
  });

  // FAQ
  const faq = c.faq || {};
  fill('cnt-faq-eyebrow', faq.eyebrow || d.faq.eyebrow);
  fill('cnt-faq-title',   faq.title   || d.faq.title);
  renderFaqEditor(faq.items && faq.items.length ? faq.items : d.faq.items);

  // CTA Final
  const cta = c.cta_final || {};
  fill('cnt-cta-title',   cta.title    || d.cta_final.title);
  fill('cnt-cta-desc',    cta.desc     || d.cta_final.desc);
  fill('cnt-cta-btn',     cta.btn_text || d.cta_final.btn_text);
  fill('cnt-cta-btn-url', cta.btn_url  || d.cta_final.btn_url);
}
```

- [ ] **Step 4: Reemplazar `saveContentSection()`**

Localizar el bloque `function saveContentSection(section) { ... }` completo y reemplazar con:

```javascript
function saveContentSection(section) {
  const c = getContent();
  function v(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

  if (section === 'global') {
    c.global = {
      wa_number:       v('cnt-global-wa'),
      ig_url:          v('cnt-global-ig'),
      topbar_left:     v('cnt-global-topbar'),
      nav_cta_text:    v('cnt-global-nav-cta'),
      nav_cta_url:     v('cnt-global-nav-cta-url'),
      footer_copyright:v('cnt-global-footer')
    };
  } else if (section === 'hero') {
    c.hero = {
      eyebrow:   v('cnt-hero-eyebrow'),
      title:     v('cnt-hero-title'),
      desc:      v('cnt-hero-desc'),
      btn1_text: v('cnt-hero-btn1'),
      btn1_url:  v('cnt-hero-btn1-url'),
      btn2_text: v('cnt-hero-btn2'),
      bg_image:  v('cnt-hero-bg')
    };
  } else if (section === 'trust') {
    c.trust = [0,1,2,3].map(i => ({
      num:   v('cnt-trust-num-'   + i),
      label: v('cnt-trust-label-' + i)
    }));
  } else if (section === 'invitaciones') {
    c.invitaciones = {
      label:    v('cnt-inv-label'),
      title:    v('cnt-inv-title'),
      desc:     v('cnt-inv-desc'),
      features: [0,1,2,3,4].map(i => v('cnt-inv-feat-' + i)),
      btn_text: v('cnt-inv-btn'),
      btn_url:  v('cnt-inv-btn-url'),
      bg_image: v('cnt-inv-bg')
    };
  } else if (section === 'qr') {
    c.qr = {
      label:    v('cnt-qr-label'),
      title:    v('cnt-qr-title'),
      desc:     v('cnt-qr-desc'),
      features: [0,1,2,3,4].map(i => v('cnt-qr-feat-' + i)),
      btn_text: v('cnt-qr-btn'),
      btn_url:  v('cnt-qr-btn-url'),
      bg_image: v('cnt-qr-bg')
    };
  } else if (section === 'premiere') {
    c.premiere = {
      label:    v('cnt-pm-label'),
      title:    v('cnt-pm-title'),
      desc:     v('cnt-pm-desc'),
      features: [0,1,2,3,4].map(i => v('cnt-pm-feat-' + i)),
      btn_text: v('cnt-pm-btn'),
      btn_url:  v('cnt-pm-btn-url'),
      bg_image: v('cnt-pm-bg')
    };
  } else if (section === 'servicios') {
    c.servicios = {
      eyebrow: v('cnt-svc-eyebrow'),
      title:   v('cnt-svc-title'),
      cards:   [0,1,2].map(i => ({
        name:  v('cnt-svc-name-'  + i),
        desc:  v('cnt-svc-desc-'  + i),
        price: v('cnt-svc-price-' + i)
      }))
    };
  } else if (section === 'como') {
    c.como_funciona = {
      eyebrow: v('cnt-cf-eyebrow'),
      title:   v('cnt-cf-title'),
      steps:   [0,1,2].map(i => ({
        name: v('cnt-cf-step-name-' + i),
        desc: v('cnt-cf-step-desc-' + i)
      }))
    };
  } else if (section === 'faq') {
    c.faq = {
      eyebrow: v('cnt-faq-eyebrow'),
      title:   v('cnt-faq-title'),
      items:   collectFaqItems()
    };
  } else if (section === 'cta') {
    c.cta_final = {
      title:    v('cnt-cta-title'),
      desc:     v('cnt-cta-desc'),
      btn_text: v('cnt-cta-btn'),
      btn_url:  v('cnt-cta-btn-url')
    };
  }

  setContent(c);
  toast('Guardado ✓');
}
```

- [ ] **Step 5: Agregar funciones FAQ (`renderFaqEditor`, `addFaqItem`, `collectFaqItems`)**

Localizar la línea `function saveContentSection(section) {` y agregar ANTES de ella:

```javascript
function renderFaqEditor(items) {
  const container = document.getElementById('cnt-faq-list');
  if (!container) return;
  container.innerHTML = (items || []).map((item, i) => `
    <div class="settings-section" style="margin-bottom:12px;padding:16px" id="faq-row-${i}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--gray)">Pregunta ${i+1}</span>
        <button onclick="removeFaqItem(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:16px;line-height:1">✕</button>
      </div>
      <div class="form-group"><label class="form-label">Pregunta</label><input class="form-input" id="faq-q-${i}" value="${(item.q||'').replace(/"/g,'&quot;')}"></div>
      <div class="form-group"><label class="form-label">Respuesta</label><textarea class="form-textarea" id="faq-a-${i}">${item.a||''}</textarea></div>
    </div>`).join('');
  container.dataset.count = (items || []).length;
}

function addFaqItem() {
  const c = getContent();
  const items = (c.faq && c.faq.items) ? [...c.faq.items] : [...CONTENT_DEFAULTS.faq.items];
  // Collect current state from DOM before rendering
  const current = collectFaqItems();
  current.push({ q: '', a: '' });
  renderFaqEditor(current);
}

function removeFaqItem(idx) {
  const items = collectFaqItems().filter((_, i) => i !== idx);
  renderFaqEditor(items);
}

function collectFaqItems() {
  const count = parseInt(document.getElementById('cnt-faq-list').dataset.count || 0);
  const items = [];
  for (let i = 0; i < count; i++) {
    const q = document.getElementById('faq-q-' + i);
    const a = document.getElementById('faq-a-' + i);
    if (q && a) items.push({ q: q.value.trim(), a: a.value.trim() });
  }
  return items;
}
```

- [ ] **Step 6: Eliminar funciones CRP obsoletas del admin**

Las siguientes funciones ya no aplican a KUERRE y deben ser eliminadas (son el código CRP legacy). Buscar y eliminar cada bloque completo:

- `function renderStatsEditor(stats) { ... }`
- `function addStat() { ... }`
- `function removeStat(idx) { ... }`
- `function collectStats() { ... }`
- `function renderServicesEditor(svcs) { ... }`
- `function collectServices() { ... }`
- `function svcDragStart(...)`, `svcDragOver(...)`, `svcDrop(...)`
- `function toggleServiceVisibility(idx) { ... }`
- `function renderPricingEditor(tab) { ... }`
- `function switchPricingTab(tab, btn) { ... }`
- `function loadDestinations()`, `function setDest(...)`
- Variable `const SERVICES_DEFAULT = [...]`

Usar Grep para localizar cada función antes de eliminar. Solo eliminar si están en el bloque del content CMS (aprox líneas 4920–5350 del admin).

---

### Task 5: Bump versión, copiar a Productivo y commit

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\index.html` (bump versión)
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html` (bump versión)
- Copy: `Desarrollo/index.html` → `Productivo/index.html`
- Copy: `Desarrollo/admin.html` → `Productivo/admin.html`

**Interfaces:**
- Consumes: archivos modificados de Tasks 1–4
- Produce: commit en `main`

- [ ] **Step 1: Bump versión en index.html**

Buscar el número de versión actual con Grep (`V1\.` en index.html). Incrementarlo en +0.01.

- [ ] **Step 2: Bump versión en admin.html**

Buscar el número de versión actual con Grep (`V1\.` en admin.html). Incrementarlo en +0.01.

- [ ] **Step 3: Copiar a Productivo**

```powershell
Copy-Item "e:\CLAUDE\WEB KUERRE\Desarrollo\index.html" "e:\CLAUDE\WEB KUERRE\Productivo\index.html"
Copy-Item "e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html" "e:\CLAUDE\WEB KUERRE\Productivo\admin.html"
```

- [ ] **Step 4: Verificar en browser antes de commit**

- Abrir `Productivo/index.html` — debe cargar OK, sin errores en consola.
- Abrir `Productivo/admin.html` → login → ir a "Contenido" → verificar que los 10 tabs aparecen con los campos correctos poblados con los defaults.
- Editar un campo (ej: topbar text en Global), guardar, abrir el index → debe reflejar el cambio (requiere que el Worker esté activo).

- [ ] **Step 5: Commit**

```bash
git add Productivo/index.html Productivo/admin.html Desarrollo/index.html Desarrollo/admin.html
git commit -m "feat: CMS de contenido para index.html — admin edita textos e imágenes, index carga desde CF KV

- 10 tabs en admin: Global, Hero, Trust Bar, Invitaciones, QR Fiestas, Premiere, Servicios, Cómo Funciona, FAQ, CTA Final
- applyContent() en index lee crd_content del Worker y aplica al DOM
- Defaults precargados con el contenido original del index
- Fallback: HTML hardcodeado si Worker no responde

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
