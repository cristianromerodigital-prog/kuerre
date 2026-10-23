# Mejoras RSVP + seguridad de invitaciones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar dos agujeros de seguridad (XSS en invitaciones, RSVP público sin validar ni límite) y sumar al panel RSVP la gestión de mesas (capacidad 10, cantidad configurable), resúmenes, duplicados, orden y aviso de conflicto entre dispositivos. **Sin refresco automático** (descartado por el usuario).

**Architecture:** Toda regla de negocio vive en el Worker (`worker/src/index.js`) y se aplica en una sola sentencia SQL cuando hay concurrencia (capacidad de mesa, conflicto de edición, tope de respuestas). Las páginas (`invite.html`, `invite-social.html`, `rsvp-panel.html`) dejan de interpolar datos en `innerHTML` y arman los nodos con DOM. El panel no hace polling: la lista se actualiza al abrir, al editar y cuando el Worker avisa un conflicto.

**Tech Stack:** Cloudflare Worker + D1 (SQLite) + KV + Rate Limiting binding; HTML/JS vanilla inline (convención del repo).

**Spec:** el pedido del usuario en conversación del 2026-10-23 (lista de 11 mejoras aprobada con "hacé todos", "hasta 10 invitados por mesa").

## Global Constraints

- CSS y JS inline en el HTML; edits parciales; no tocar funciones ajenas al pedido.
- Capacidad de mesa: **10** invitados confirmados (`asistencia='si'`) por mesa.
- Cantidad de mesas por evento: default **20**, rango **1–60**, configurable desde el panel RSVP.
- Toda URL que venga de config del cliente se usa solo si es `https://`; si no, se descarta.
- Límites del POST público `/rsvp/{slug}`: `nombre`/`apellido` 1–80 chars, `restricciones` ≤ 300, `mensaje` ≤ 1000, `asistencia ∈ {si,no}`, máx **10 envíos por minuto por IP+slug**, máx **2000 respuestas por slug**.
- Deploy: D1 migración → Worker → páginas (gh-pages). Bump admin V1.99 → V2.00 si se toca admin.

## Review Focus

- Dos personas asignan el último lugar de una mesa a la vez → solo una entra, la otra ve "Mesa llena" (Task 3, test `capacidad concurrente`).
- Bajar la cantidad de mesas con invitados sentados en mesas que desaparecen → se rechaza con la lista de mesas ocupadas (Task 3, test `reducir mesas ocupadas`).
- Dos dispositivos editan al mismo invitado → el segundo recibe "Otra persona cambió a X" y la lista se recarga, sin pisar el cambio del primero (Task 4, test `conflicto en el panel`).
- Invitación vieja sin `https` en `media_url` (ej. `http://` o ID suelto de Drive) → hoy funciona; tras el fix debe seguir viéndose si el admin la convierte (lh3) — verificar con Barack y una config con `http://` (Task 1).
- Nombre con tildes/mayúsculas distintas ("José Pérez" vs "jose perez") → se marca como posible duplicado (Task 5).

---

### Task 1: XSS — invitaciones arman portada, mapa, Spotify, carrusel y nombres con DOM

**Files:** Modify `Desarrollo/invite.html` (renderHero ~1185-1210, renderLugar ~1274-1280, renderSpotify ~1345), `Desarrollo/invite-social.html` (~546-555, buildCarrusel ~601); `worker/src/index.js` completar (~1161).

**Interfaces:** Produces `safeHttpsUrl(u: string): string` (devuelve `u` si `new URL(u).protocol === 'https:'`, si no `''`), inline en cada página.

- [ ] Test: página de prueba con `cfg` que trae `media_url: 'x" onerror="window.__pwn=1'`, `novios: '<img src=x onerror=window.__pwn=1> & Y'`, `lugar_maps_embed: 'javascript:window.__pwn=1'`, `spotify_url: 'https://open.spotify.com/x"><img src=x onerror=window.__pwn=1>'`, carrusel con la misma carga → `window.__pwn` queda `undefined` y no hay `<img>` inyectados. Con la config real de Barack la portada (video) sigue cargando.
- [ ] Implementar con `createElement` + propiedades (`src`, `textContent`), sin cambiar estilos ni ids.
- [ ] Worker `completar`: descartar del `incoming` toda clave terminada en `_url`/`_embed` o en `carousel_images_*` cuyo valor no pase `https://` (los arrays se filtran ítem por ítem).
- [ ] Commit `fix(seguridad): invitaciones sin interpolar config en innerHTML`.

### Task 2: RSVP público — validación, rate limit y tope

**Files:** `worker/src/index.js` (POST `/rsvp/{slug}` ~2040), `worker/wrangler.toml`, `Desarrollo/invite.html` (inputs del form: `maxlength`).

**Interfaces:** binding `env.RSVP_LIMITER` (`[[ratelimits]] name="RSVP_LIMITER" namespace_id="1001" simple={limit=10, period=60}`).

- [ ] Test (SQLite + bundle, como `patchtest.mjs`): asistencia `'quizas'` → 400; nombre de 81 chars → 400; mensaje de 1001 → 400; limiter mock que devuelve `{success:false}` → 429; con 2000 filas en el slug el insert 2001 → 409 y la tabla sigue en 2000; envío válido → 200.
- [ ] Implementar: validar, `env.RSVP_LIMITER.limit({ key: ip + ':' + slug })`, insert con `INSERT ... SELECT ... WHERE (SELECT COUNT(*) FROM rsvp_responses WHERE slug=?) < 2000` y `changes===0 → 409`.
- [ ] Commit `fix(seguridad): validar y limitar el RSVP publico`.

### Task 3: Mesas — capacidad 10, cantidad configurable, conflicto de edición

**Files:** `worker/src/index.js` (GET/PATCH `/rsvp/{slug}`, nuevo `PUT /rsvp/{slug}/config`), KV `rsvp_mesas:{slug}`.

**Interfaces:**
- GET `/rsvp/{slug}` agrega `mesas: number` (KV o 20) y `capacidad: 10`.
- PATCH acepta `prev: { asistencia, mesa }`; si la fila ya no coincide → `409 { error:'conflicto', actual: { asistencia, mesa, modificado_at } }`.
- PATCH mesa llena → `409 { error:'mesa_llena' }`; mesa > `mesas` → 400.
- `PUT /rsvp/{slug}/config` body `{ mesas }` (token o admin) → 200; si hay confirmados en mesas > nuevo valor → `409 { error:'mesas_ocupadas', mesas:[...] }`.

- [ ] Tests: `capacidad` (10 en mesa 3, el 11.º → `mesa_llena`); `capacidad concurrente` (dos PATCH `Promise.all` al último lugar → uno 200, otro 409); mover dentro de la misma mesa no cuenta doble; `conflicto` (prev desactualizado → 409 con `actual`); `reducir mesas ocupadas` → 409 con lista; mesa 21 con `mesas=20` → 400.
- [ ] Implementar la capacidad y el conflicto dentro del `WHERE` del UPDATE (sin SELECT previo).
- [ ] Commit `feat(rsvp): capacidad de mesa, cantidad configurable y deteccion de conflictos`.

### Task 4: Panel — resumen por mesa, filtro por mesa y selector con cupo

**Files:** `Desarrollo/rsvp-panel.html`.

**Interfaces:** consume `mesas`, `capacidad`, errores `mesa_llena`/`conflicto` de Task 3.

- [ ] Grilla de chips "Mesa N · x/10" (llena = rojo, con lugar = normal) + chip "Sin mesa (n)"; click filtra (`_mesaFilter`, se combina con buscador y filtro de asistencia); "Todas" limpia.
- [ ] `mesaOptions` muestra "Mesa N (x/10)" y deshabilita mesas llenas salvo la actual.
- [ ] Control "Cantidad de mesas" (1–60) que llama a `PUT config` y muestra el 409 con las mesas ocupadas.
- [ ] PATCH manda `prev: { asistencia, mesa }`; ante `conflicto` muestra "Otra persona cambió a X mientras editabas" y recarga la lista (test `conflicto en el panel`).
- [ ] Test en Chrome con 302 invitados de Barack (mock): contadores por mesa suman 150; filtrar Mesa 3 muestra solo esa; mesa llena aparece deshabilitada en otro invitado.
- [ ] Commit.

### Task 5: Panel — restricciones, duplicados y orden

**Files:** `Desarrollo/rsvp-panel.html`.

- [ ] Resumen "Para el catering" con conteo de restricciones de **confirmados** (split por `,`, trim, case-insensitive).
- [ ] Duplicados: clave = `nombre+apellido` en minúsculas sin tildes ni espacios extra; badge "Posible duplicado" en todas las filas de la clave repetida.
- [ ] Orden por click en encabezado (Nombre, Asistencia, Respondió el, Se modificó el, Mesa), asc/desc con indicador.
- [ ] Test: "José Pérez" y "jose  perez" marcados; resumen cuenta "Celíaco/a" de confirmados solamente; ordenar por Mesa deja "Sin mesa" al final.
- [ ] Commit.

### Task 6: Detalles — tipografía del panel y logo de marca en la tarjeta de WhatsApp

**Files:** `Desarrollo/rsvp-panel.html` (`@import` → `<link>` en `<head>`), `worker/src/index.js` (`handleInviteOg`: si la portada es video o no hay imagen, `og:image` = logo de la marca resuelto con `resolvePartnerId`; aceptar `HEAD` en `/api/partners/{slug}/logo`).

- [ ] Test: `/og/barack-…` devuelve `og:image` con `/api/partners/nijash/logo`; HEAD al logo → 200 `image/png`.
- [ ] Commit.

### Task 7: Deploy y verificación en producción

- [ ] Worker deploy; copiar páginas a `Productivo/` y `gh-pages`; push.
- [ ] Verificar en vivo: POST con asistencia inválida → 400; panel de Barack muestra chips por mesa; `/og/barack-…` con imagen.
- [ ] Los 300 invitados de prueba (ids 8–307) se borran **solo cuando el usuario lo pida**.
