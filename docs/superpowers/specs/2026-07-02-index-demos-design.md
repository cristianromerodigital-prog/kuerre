# Index Kuerre — Demos vivas, QR escaneable, animaciones y modal demo

**Fecha:** 2026-07-02 · **Versión objetivo:** index V1.41 · **Aprobado por:** Cristian

## Objetivo
El index (landing) vende los 3 servicios con mockups CSS estáticos y la FAQ remite a WhatsApp para ver demos, cuando los tres productos reales ya funcionan (`invite.html`, `fiestas.html`, `premiere.html`). Se conecta el index con demos reales y se da vida a las pantallas.

## Componentes

### C. Reset nocturno del evento demo (worker) — primero
- Evento demo con slug/id `demo` en las tablas existentes (creado desde admin).
- Fotos seed subidas con prefijo de key `demo-seed/` en R2.
- `wrangler.toml`: `[triggers] crons = ["0 8 * * *"]` (05:00 ART).
- Handler `scheduled()` en `worker/src/index.js`: borra del evento demo toda foto cuya key NO empiece con `demo-seed/` — en R2 (`MEDIA`), `eventos_foto` y `foto_likes`.
- Endpoint `/invite/demo`: el worker devuelve la config del demo con `fecha` calculada dinámica (hoy + 21 días) para que el countdown nunca expire. No se toca el flujo de invitaciones reales.
- Redeploy del worker.

### A. Evento demo "Sofía & Mateo" + links en el index
- URLs demo: `invite.html?i=demo`, `fiestas.html?e=demo`, `premiere.html?e=demo`.
- ~15 fotos reales de eventos de Cristian como seed (las provee él).
- Index: botón secundario "Ver demo en vivo →" (estilo `.btn-secondary`) junto a cada "Consultar precio" en las 3 secciones feature (`#invitaciones`, `#qr-fiestas`, `#premiere`), `target="_blank"`.
- FAQ "¿Puedo ver una demo antes de contratar?": reescribir apuntando a los links de demo en la misma página.

### B. QR escaneable (sección QR Fiestas)
- QR como SVG estático inline (generado una vez, sin librería externa en runtime) apuntando a `https://kuerre.com.ar/fiestas.html?e=demo`.
- Copy: "Escanealo con tu celu y subí una foto ahora".
- Desktop: se muestra el QR. Mobile (≤900px): se oculta el QR y se muestra botón directo a la demo.

### D. Micro-animaciones en mockups (CSS/JS inline, IntersectionObserver)
- Card Invitación (`.scr-inv`): countdown real con JS hacia fecha futura (misma lógica hoy+21d, calculada client-side).
- Phones QR (card `.scr-qr` y phone-lg de la sección): fotos del grid aparecen en loop escalonado (fade-in) con badge "+1 foto" — simula subida en vivo.
- Phone Premiere: crossfade suave de thumbnails.
- Botón "Confirmar asistencia" del phone invite: pulse sutil.
- Animaciones arrancan al entrar en viewport; `prefers-reduced-motion` las desactiva.

### E. Modal demo on-click
- Clic en cualquier phone mockup (cards y phone-lg de features) → modal fullscreen con marco de teléfono + iframe de la demo real correspondiente.
- Iframe lazy: `src` se asigna recién al abrir; se limpia al cerrar.
- Botones: cerrar y "Abrir en pestaña nueva".
- Mobile (≤900px): el clic abre la demo directa en pestaña nueva, sin modal.

## Estrategia de trabajo
Todos los cambios del index se hacen en `Desarrollo/index2.html` (copia de `index.html`), sin tocar el index actual. Cuando Cristian apruebe el resultado, `index2.html` reemplaza a `index.html` y se elimina la copia.

## Orden de implementación
C → A → B → D → E. Bump `KVER`/`v1.40` → V1.41. Deploy (copiar a Productivo + push + gh-pages) solo cuando el usuario diga "subilo".

## Fuera de alcance
- Subida de foto demo "efímera" client-side (se eligió reset real con cron).
- Cambios de contenido/estructura del resto del index.
- Moderación activa de fotos demo (el cron nocturno es la mitigación aceptada).

## Verificación
- Cron: ejecutar `scheduled()` manualmente (wrangler dev --test-scheduled o trigger manual) y verificar que borra solo no-seed.
- Los 3 links demo abren y cargan el evento demo.
- Countdown de `invite.html?i=demo` siempre futuro.
- QR escaneado con celular abre la galería demo.
- Animaciones activas al scrollear; sin errores en consola; mobile OK.
