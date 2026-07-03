# Rediseño estructural index2.html — Línea de tiempo "Antes / Durante / Después"

**Fecha:** 2026-07-03
**Archivo objetivo:** `Desarrollo/index2.html` (V1.41 → bump al terminar)

## Problema
La estructura actual (hero split + feature-splits alternados 50/50 + cards de servicios) es idéntica al template de la competencia que vende invitaciones. Además no comunica la idea central del producto: el evento no dura una noche — empieza con la invitación digital, se vive durante la fiesta con el QR interactivo y continúa semanas después con la entrega Premiere.

## Objetivo
Reestructurar la página como la **cronología de un evento**, sin tocar la paleta de colores, conservando intactos todos los elementos interactivos:
- Celulares mockup con `data-demo` → `openDemoModal()` (modal desktop / pestaña mobile)
- Video en el celu del hero (`/api/hero-video` + fallback logo)
- Animación QR "en vivo" (`qrLiveLoop` + badge `+1 foto`)
- Crossfade Premiere (`pmCrossfade`)
- QR escaneable de la sección QR Fiestas
- Countdown demo en la card de invitación
- Orquestación IntersectionObserver + prefers-reduced-motion

## Restricción dura: contrato de ids con el Worker
`loadSiteContent()` puebla textos desde `/site/config` por id: `hero-*`, `trust-*`, `inv-*`, `qr-*`, `pm-*`, `svc-*`, `step-*`, `cf-*`, `faq-*`, `cta-*`. **Todos esos ids deben sobrevivir a la reestructura.** Los elementos nuevos (encabezados de etapa, chips, línea de tiempo) usan ids/clases nuevos que el config no toca.

## Diseño

### 1. Hero (estructura se mantiene: texto + celu con video)
- Eyebrow default: `Antes · Durante · Después`
- Título default: `Tu evento no dura solo una noche`
- Sub default (texto aprobado por el usuario): "Empieza desde el momento en que compartís la invitación digital, se vive con tus invitados durante la fiesta a través del QR interactivo y continúa semanas después con la entrega Premiere, donde podés revivir y compartir cada recuerdo una y otra vez."
- Debajo de los CTAs: 3 chips clickeables `● Antes` / `● Durante` / `● Después` que scrollean a cada etapa (anchors `#invitaciones`, `#qr-fiestas`, `#premiere`).

### 2. Trust bar — sin cambios.

### 3. Timeline (núcleo del rediseño)
- Contenedor `.timeline` que envuelve las 3 secciones de servicio.
- Línea vertical continua con gradiente de la paleta existente; nodos `●` por etapa que se "encienden" al entrar en viewport (IntersectionObserver, reusar patrón existente).
- Cada etapa gana un encabezado de contexto grande (ids nuevos, no gestionados por config):
  - `SEMANAS ANTES` → Invitación Digital
  - `LA NOCHE DEL EVENTO` → QR Fiestas
  - `LAS SEMANAS SIGUIENTES` → Premiere
- Layout interno: se abandona el 50/50 alternado; cada etapa es una tarjeta anclada a la línea de tiempo (glassmorphism existente), con celu + texto + lista de features + CTAs. El contenido interno (ids, celus, demos, animaciones) se muda tal cual.
- Mobile: línea a la izquierda, tarjetas a ancho completo.

### 4. "La experiencia completa" (ex Servicios)
- Mismas 3 cards con mini-celus y precios (ids `svc-*` intactos).
- Título default nuevo orientado al combo.
- Franja de cierre nueva bajo las cards con el texto de la captura + CTA combo por WhatsApp.

### 5. Cómo funciona / FAQ / CTA final — sin cambios estructurales.

## Post-implementación
- Bump versión V1.41 → V1.42.
- Los textos guardados en KV (`crd_settings` del worker kuerre) pisan los defaults del HTML: listar al usuario qué claves conviene actualizar en el admin (hero, título servicios) para que acompañen la narrativa. No tocar KV sin pedido explícito.
- No se promociona a `index.html` ni se sube hasta que el usuario lo pida.

## Qué NO se hace
- No se cambia la paleta ni tipografías.
- No se tocan fiestas.html, premiere.html, invite.html ni el worker.
- No se elimina ninguna sección existente.
