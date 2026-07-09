# Catálogo de estilos + formulario del cliente — Diseño

**Fecha:** 2026-07-09
**Marca:** Solo Kuerre
**Objetivo:** Página pública donde el cliente elige el estilo de su invitación de un catálogo curado y completa los datos faltantes (portada, horarios, trivia, carruseles). Al enviar, todo se aplica directo a su invitación. El cliente nunca ve el link de la invitación hasta que Cristian se lo entrega.

## Decisiones tomadas (con el usuario)

1. **Demos genéricas, no la invitación del cliente** — preserva el valor percibido del trabajo de diseño. Datos ficticios + fotos stock.
2. **Catálogo curado de 20 estilos con nombre propio** — 12 clásicos + 8 sociales. No se exponen las combinaciones crudas.
3. **Todo se aplica directo** al enviar el formulario (estilo + datos). El control de valor está en que el link de la invitación no se comparte hasta que Cristian quiera.
4. **Bloqueado tras enviar** — el formulario es de un solo uso. Cambios posteriores van por WhatsApp y los aplica Cristian desde el admin.
5. **El admin puede cambiar el estilo después** — selector de los 20 presets en el modal de invitación; pisa solo campos de estilo, nunca el contenido.
6. Video de portada: límite 50 MB.

## Arquitectura

### Archivos nuevos (WEB KUERRE)

| Archivo | Propósito |
|---------|-----------|
| `Desarrollo/estilos.html` | Página wizard 3 pasos (catálogo → formulario → generar). Branding Kuerre, mobile-first, CSS/JS inline. |
| `Desarrollo/estilos-catalogo.json` | Fuente única de los 20 estilos. Consumido por estilos.html y por el admin (fetch). |

Deploy: Desarrollo → Productivo → main + sync worktree gh-pages (flujo estándar Kuerre).

### estilos-catalogo.json

```json
{
  "estilos": [
    {
      "id": "noir",
      "nombre": "Noir",
      "modelo": "clasico",
      "descripcion": "Elegancia oscura con detalles dorados",
      "config": {
        "color_esquema": "negro", "estilo_aero": false,
        "formato": "clasico",
        "env_color": "negro", "env_particulas": "estrellas", "env_particulas_tam": 3,
        "text_styles": { "hero-names": { "font": "Cormorant Garamond" } }
      }
    },
    {
      "id": "lavanda-social",
      "nombre": "Lavanda",
      "modelo": "social",
      "config": { "color_tema": "lavanda", "hero_emoji": "💜" }
    }
  ],
  "demo": {
    "clasico": { "novios": "Valentina", "titulo": "¡Mis 15!", "fecha_display": "…", "media_url": "<stock R2>" },
    "social": { "…": "…" }
  },
  "textos": {
    "final": "¡Gracias, {nombre}! ✦ Vamos a preparar tu invitación con mucho amor y te contactamos apenas esté lista."
  },
  "trivia_pool": [
    { "pregunta": "¿Cuál es mi color favorito?", "distractores": ["Rosa", "Azul", "Violeta", "Negro", "Rojo"] }
  ]
}
```

- `config` de cada estilo = **solo campos de estilo** (paleta, formato, fx, aero, sobre, partículas, fuentes / color_tema, emoji). Nunca campos de contenido.
- `trivia_pool`: ~15 preguntas, cada una con 4-5 distractores predefinidos.
- Fotos stock de las demos: curadas de Pexels, subidas a R2 (`estilos-demo/…`) servidas vía worker — sin hotlinks.

### estilos.html — wizard

**Paso 1 — Catálogo.** Grilla de 20 cards. Cada card: iframe de `invite.html` / `invite-social.html` con `?c=base64(demoConfig + estilo.config)`, escalado a miniatura (transform scale, base 390×844 — mismo patrón del editor hero del admin). Lazy-load con IntersectionObserver (máx 2-3 iframes cargando a la vez). Tap → demo fullscreen navegable con botón volver. Botón "Elegir este estilo".

**Paso 2 — Formulario** (campos según `modelo` del estilo elegido):
- Común: fecha display + fecha ISO, hora evento, hora fin, lugar + dirección + link Maps, dresscode + nota, regalo (texto, alias, banco, titular, CBU), fecha límite RSVP, música YouTube, **portada** (foto o video, upload).
- Clásico además: subtítulo (presets existentes), texto presentación, ceremonia (hora/lugar/dirección — solo si tipo casamiento), playlist Spotify.
- Social además: frase emotiva, **trivia**, **carrusel 1 y 2** (multi-upload de fotos).

**Trivia UX:** se muestran 5 preguntas al azar del pool; la clienta escribe solo la respuesta correcta; botón "cambiar pregunta" rota por otra no usada. Al generar, cada pregunta se arma como `{pregunta, opciones: [respuesta + 3 distractores mezclados], correcta: idx}` (formato existente `trivia_preguntas` de invite-social). Si la respuesta coincide con un distractor, ese distractor se excluye.

**Paso 3 — Generar.** Resumen de lo cargado (sin preview de invitación) → botón "Generar mi invitación" → POST `/completar` → pantalla final personalizada (texto de `textos.final` del catálogo, con nombre del cliente).

**Acceso:** `estilos.html?i={slug}` (slug de la invitación, mismo patrón que invite/entrega — el slug es el token). Sin `?i=` → catálogo público con CTA WhatsApp en lugar de "Elegir". Al cargar con slug: GET `/invite/{slug}/estado`; si `form_completado` → pantalla "ya enviado, contactanos por WhatsApp para cambios".

### Worker Kuerre — endpoints nuevos (worker/src/index.js)

| Endpoint | Método | Función |
|----------|--------|---------|
| `/invite/{slug}/estado` | GET | `{ existe, form_completado, nombre, tipo, modelo? }` — datos mínimos para el wizard (nombre para la pantalla final, tipo para campos condicionales). |
| `/invite/{slug}/media` | POST multipart | Campo `tipo`: `portada\|carrusel1\|carrusel2`. Guarda en R2 (`invite-media/{slug}/…`) y `ctx.waitUntil` → GAS `uploadFoto` a la carpeta Drive del cliente según tipo: `drive_invitacion_id` / `drive_carrusel1_id` / `drive_carrusel2_id` (de la solicitud vinculada por `invite_slug`). Reutiliza el patrón R2+Drive existente de fiestas. Límites: imagen 15 MB, video 50 MB. Rechaza si `form_completado`. Devuelve URL servible (worker/R2). |
| `/invite/{slug}/completar` | POST JSON | Body: `{ estilo_id, config_parcial }`. **Merge** sobre `invite_cfg_{slug}` (spread: existente ← estilo ← datos), marca `form_completado: true` y `estilo_elegido: id`. Actualiza también la entrada en `crd_invites` (lista del admin). **Rechaza (409) si ya estaba completado.** |

Notas:
- El PUT `/invite/{slug}` existente (admin) no cambia.
- Carruseles: las URLs de las fotos subidas van en los campos de carrusel de la config (mismo formato que arma el admin con `_invCarousel1/2`).

### Admin (CORE — patch solo-kuerre, `brands/kuerre`)

1. **Selector "Estilo ✦"** en el modal de invitación: fetch de `estilos-catalogo.json`, dropdown/grid con los 20 presets. Al elegir uno, aplica sus campos de estilo sobre el form actual (no toca contenido). Sirve para: cambio de opinión del cliente, y para armar invitaciones desde cero en segundos.
2. **Badge** en la card de invitación cuando `form_completado`: "✦ Cliente completó — estilo: {nombre}".
3. **Botón "Copiar link de estilos"** (`{base estilos}?i={slug}`) para mandar por WhatsApp.
4. Regla cross-brand: los cambios van como patches de `brands/kuerre` en build-admin; no tocan CRP. Bump de versión kuerre.

## Manejo de errores

- Upload falla → retry manual (botón), el form no avanza sin portada subida OK. Carruseles son opcionales.
- `/completar` con slug inexistente o ya completado → mensaje claro en pantalla (no genérico).
- Drive en background falla → mismo patrón existente: error a KV `drive_sync_err_*` (la foto ya está en R2, no se pierde).
- iframe de demo no carga → card muestra placeholder con nombre del estilo (la elección sigue funcionando).

## Testing / verificación

1. Catálogo público sin `?i=` (CTA WhatsApp, sin submit).
2. Flujo completo con slug de prueba: elegir estilo clásico → form → uploads → generar → verificar `invite_cfg_{slug}` mergeada, `form_completado`, foto en R2 y en carpeta Drive correcta.
3. Ídem con estilo social: trivia (5 preguntas, opciones bien armadas) + carruseles.
4. Reingreso con slug completado → pantalla bloqueada.
5. Admin: cambiar estilo con el selector → contenido intacto, solo estilo pisado.
6. Segunda llamada a `/completar` → 409.

## Fuera de alcance

- CRP (se evalúa portar después — preguntar alcance llegado el caso).
- Notificación push/WhatsApp automática a Cristian al completar (se ve el badge en admin; se puede agregar después).
- Reedición por el cliente tras enviar.
