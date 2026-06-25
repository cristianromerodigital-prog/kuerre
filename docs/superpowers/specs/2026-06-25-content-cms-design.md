# WEB KUERRE — CMS de Contenido para index.html

**Fecha:** 2026-06-25  
**Proyecto:** WEB KUERRE (`e:\CLAUDE\WEB KUERRE\`)  
**Archivos afectados:** `Desarrollo/admin.html`, `Desarrollo/index.html`

---

## Objetivo

Que todo el contenido visible del `index.html` (textos, imágenes de fondo, URLs de WhatsApp) sea editable desde el admin, sin tocar código. Mismo patrón que WEB CRP.

---

## Enfoque: DOM injection con IDs (Enfoque A)

- El admin guarda el contenido en `crd_content` (localStorage + CF KV via `syncToCloud`).
- El index lee `crd_content` del Worker al cargar y aplica cada valor al elemento con su ID.
- Si el Worker falla o no hay contenido guardado → el HTML hardcodeado actúa de fallback.

---

## Cambios en `admin.html`

### 1. Reemplazar el bloque HTML `<div class="page" id="page-content">`

El bloque actual es un clon de CRP (tabs para "Sobre Mí", "Precios", etc.) que no corresponde a KUERRE. Se reemplaza íntegro con tabs KUERRE-específicos.

#### Tabs y campos

**Global**
- Número WA (sin `+` ni espacios, ej. `541162557763`) → `cnt-global-wa`
- URL Instagram → `cnt-global-ig`
- Texto topbar izquierda → `cnt-global-topbar`
- Copyright footer → `cnt-global-footer`
- Texto botón nav "Consultar" → `cnt-global-nav-cta`

**Hero**
- Eyebrow → `cnt-hero-eyebrow`
- Título → `cnt-hero-title`
- Descripción → `cnt-hero-desc`
- Texto botón 1 → `cnt-hero-btn1`
- URL botón 1 (WA) → `cnt-hero-btn1-url`
- Texto botón 2 → `cnt-hero-btn2`
- Imagen de fondo (URL) → `cnt-hero-bg`

**Trust Bar**
- 4 filas fijas, cada una: Número (`cnt-trust-num-0..3`) + Etiqueta (`cnt-trust-label-0..3`)

**Invitaciones**
- Label → `cnt-inv-label`
- Título → `cnt-inv-title`
- Descripción → `cnt-inv-desc`
- 5 features → `cnt-inv-feat-0..4`
- Texto botón → `cnt-inv-btn`
- URL botón WA → `cnt-inv-btn-url`
- Imagen de fondo (URL) → `cnt-inv-bg`

**QR Fiestas** (misma estructura, prefijo `cnt-qr-*`)

**Premiere** (misma estructura, prefijo `cnt-pm-*`)

**Servicios**
- Eyebrow → `cnt-svc-eyebrow`
- Título sección → `cnt-svc-title`
- 3 cards fijas: Nombre (`cnt-svc-name-0..2`), Descripción (`cnt-svc-desc-0..2`), Precio (`cnt-svc-price-0..2`)

**Cómo Funciona**
- Eyebrow → `cnt-cf-eyebrow`
- Título → `cnt-cf-title`
- 3 pasos fijos: Nombre (`cnt-cf-step-name-0..2`), Descripción (`cnt-cf-step-desc-0..2`)

**FAQ**
- Eyebrow → `cnt-faq-eyebrow`
- Título → `cnt-faq-title`
- Lista dinámica: cada item tiene pregunta + respuesta. Botones "+ Agregar" y "✕ Eliminar".
- Se renderiza con `renderFaqEditor(items)`.

**CTA Final**
- Título → `cnt-cta-title`
- Descripción → `cnt-cta-desc`
- Texto botón → `cnt-cta-btn`
- URL botón WA → `cnt-cta-btn-url`

### 2. Reemplazar funciones JS

Funciones a reemplazar (actualmente son clon de CRP):

| Función | Qué hace |
|---------|----------|
| `getContent()` | Lee `crd_content` de localStorage. Sin cambios en firma. |
| `setContent(data)` | Guarda en localStorage + syncToCloud. Sin cambios en firma. |
| `switchContentTab(tab, btn)` | Muestra/oculta `.cnt-panel`. Sin cambios en firma. |
| `loadContentPage()` | Lee `getContent()` y puebla todos los inputs con sus defaults del backup. |
| `saveContentSection(section)` | Lee inputs del tab activo, actualiza el objeto, llama `setContent()`. |
| `renderFaqEditor(items)` | Renderiza la lista de Q&A con inputs + botón eliminar. |
| `addFaqItem()` | Agrega fila vacía a la lista. |
| `collectFaqItems()` | Lee todos los inputs de FAQ y devuelve array `[{q,a}]`. |

**Defaults en `loadContentPage()`:** usar los valores del backup `content-backup-2026-06-25.json` como valores por defecto (si el campo del KV está vacío, se muestra el valor original del index).

### 3. Activar `page-content` en `showPage()`

Ya existe en el admin: `if (id === 'content') { loadContentPage(); }` — no requiere cambios.

---

## Cambios en `index.html`

### 1. Agregar IDs a elementos editables

No se modifica ninguna estructura HTML. Solo se agrega el atributo `id` a los elementos que ya existen.

| Elemento | ID a agregar |
|----------|-------------|
| `<span class="topbar-left">` | `topbar-text` |
| `<a class="nav-cta">` (en nav + mobile) | `nav-cta-link`, `mobile-cta-link` |
| `.hero-bg` (div background) | `hero-bg` |
| `.hero-eyebrow` | `hero-eyebrow` |
| `<h1 class="hero-title">` | `hero-title` |
| `<p class="hero-sub">` | `hero-desc` |
| Btn1 del hero (WA) | `hero-btn1` |
| Btn2 del hero (Ver servicios) | `hero-btn2` |
| 4 `.trust-num` | `trust-num-0` .. `trust-num-3` |
| 4 `.trust-label` | `trust-label-0` .. `trust-label-3` |
| `.feat-label` en #invitaciones | `inv-label` |
| `<h2>` en #invitaciones | `inv-title` |
| `<p class="feat-desc">` en #invitaciones | `inv-desc` |
| 5 `<li>` en #invitaciones | `inv-feat-0` .. `inv-feat-4` |
| Botón CTA en #invitaciones | `inv-btn` |
| `.feat-visual-bg` en #invitaciones | `inv-bg` |
| Ídem QR Fiestas | `qr-label`, `qr-title`, `qr-desc`, `qr-feat-0..4`, `qr-btn`, `qr-bg` |
| Ídem Premiere | `pm-label`, `pm-title`, `pm-desc`, `pm-feat-0..4`, `pm-btn`, `pm-bg` |
| `.sec-label` en #servicios | `svc-eyebrow` |
| `<h2>` en #servicios | `svc-title` |
| 3 `.card-name` | `svc-name-0` .. `svc-name-2` |
| 3 `.card-desc` | `svc-desc-0` .. `svc-desc-2` |
| 3 `.card-price` | `svc-price-0` .. `svc-price-2` |
| `.sec-label` en #como-funciona | `cf-eyebrow` |
| `<h2>` en #como-funciona | `cf-title` |
| 3 `.step-name` | `step-name-0` .. `step-name-2` |
| 3 `.step-desc` | `step-desc-0` .. `step-desc-2` |
| `.sec-label` en #faq | `faq-eyebrow` |
| `<h2>` en #faq | `faq-title` |
| Contenedor `.faq-item`s | `faq-list` (en el `<section id="faq">`) |
| `<h2 class="cta-title">` | `cta-title` |
| `<p class="cta-sub">` | `cta-desc` |
| Botón CTA final | `cta-btn` |
| `<footer>` texto copyright | `footer-copyright` |

### 2. Agregar bloque JS de init de contenido

Dentro del `<script>` existente (donde ya está el fetch de `/site/config`), agregar un segundo fetch:

```js
(async function() {
  try {
    const c = await fetch('https://kuerre-worker.cristian-romero-digital.workers.dev/crd_content')
                .then(r => r.ok ? r.json() : null);
    if (!c) return;
    applyContent(c);
  } catch(e) {}
})();
```

`applyContent(c)` aplica cada sección:
- **Textos simples:** `el.textContent = value`
- **Títulos con `<br>`:** `el.innerHTML = value.replace(/\n/g, '<br>')`
- **Imágenes de fondo:** `el.style.backgroundImage = "url('" + url + "')"`
- **Links WA:** `el.href = "https://wa.me/" + c.global.wa_number + "?text=" + encodeURIComponent(texto)`
- **FAQ dinámico:** regenerar los `.faq-item` con `innerHTML` aplicando el array `c.faq.items`

---

## Flujo completo

```
Admin edita tab → saveContentSection() → setContent() → localStorage + syncToCloud('crd_content')
                                                                    ↓
                                                       CF KV: crd_content = JSON

index.html carga → fetch /crd_content → applyContent(c) → DOM actualizado
                                           ↓ fallo
                                       HTML fallback (valores hardcodeados originales)
```

---

## Qué NO cambia

- La estructura visual de `index.html` (CSS, clases, layout).
- Los mockups de teléfono (decorativos, hardcodeados).
- El resto del admin (portfolio, entregas, invites, etc.).
- El KV key `crd_content` (ya está en `CF_SYNC_KEYS`).
- La función `syncToCloud` y la infraestructura de auth.

---

## Orden de implementación

1. Modificar `index.html`: agregar IDs + bloque `applyContent`.
2. Modificar `admin.html`: reemplazar `page-content` HTML + funciones JS.
3. Cargar defaults del backup en `loadContentPage()`.
4. Verificar en browser que admin guarda y index refleja.
5. Copiar a `Productivo/` + push.
