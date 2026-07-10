# Catálogo de Estilos + Formulario del Cliente — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `estilos.html` (Kuerre) donde el cliente elige un estilo de un catálogo de 20 presets con demos vivas y completa los datos de su invitación; al enviar, todo se aplica a `invite_cfg_{slug}` y el formulario queda bloqueado. El admin gana selector de presets, badge y link copiable.

**Architecture:** Página estática nueva en WEB KUERRE (gh-pages) + JSON de catálogo compartido + 3 endpoints nuevos en el worker Kuerre (estado / media / completar) + feature en CORE admin (URL-agnóstico, sin patch de marca). Las demos son iframes de invite.html / invite-social.html con config inline `?c=base64` (datos ficticios + fotos stock).

**Tech Stack:** Vanilla HTML/CSS/JS inline (convención del repo), Cloudflare Worker (worker/src/index.js), KV `KUERRE_KV`, R2 `MEDIA`, D1 `KUERRE_DB`, GAS `uploadFoto` para Drive.

**Spec:** `docs/superpowers/specs/2026-07-09-estilos-catalogo-cliente-design.md`

## Global Constraints

- Todo CSS/JS **inline** en el HTML. Sin frameworks, sin npm en las páginas.
- Trabajar en `WEB KUERRE\Desarrollo\`; `Productivo\` + gh-pages solo en la task de deploy.
- Worker: URL pública `https://kuerre-worker.cristian-romero-digital.workers.dev`. Deploy con `npx wrangler deploy` desde `WEB KUERRE\worker\`.
- Branding Kuerre: fondo claro `#f6f6f8`, acento violeta `#9060b8` / `#7a4aa0`, tipografía Montserrat + Cormorant Garamond.
- Límites upload: imagen 15 MB, video 50 MB.
- **El formulario NO permite editar nombres, fecha ni tipo** (el admin recalcula el slug desde `novios`+`fecha_display`+id — cambiarlos rompería los links). El worker además los descarta del merge (defensa en profundidad).
- Las demos usan `rsvp_activo:false` (que nadie confirme asistencia a una demo).
- Versión kuerre admin: bump `V1.80` → `V1.81` en `CORE\brands\kuerre\config.json` (patch 1).
- No tocar CRP: no se corre `build-admin.cjs crp`, no se deploya CRP.
- Commits: mensajes descriptivos, con `git commit -F archivo` si el mensaje contiene rutas (guard del sandbox).

---

### Task 1: `estilos-catalogo.json` — catálogo de 20 estilos, demos, textos y pool de trivia

**Files:**
- Create: `e:\CLAUDE\WEB KUERRE\Desarrollo\estilos-catalogo.json`

**Interfaces:**
- Produces: JSON con claves `estilos[]` (`{id, nombre, modelo, descripcion, demo, config}`), `demo` (`clasico_xv`, `clasico_boda`, `social`), `textos.final`, `trivia_pool[]` (`{pregunta, distractores[]}`). Consumido por estilos.html (Task 6) y admin (Task 8).
- Los campos dentro de `config` usan **exactamente** los nombres que consume invite.html / invite-social.html (`color_esquema`, `estilo_aero`, `formato`, `wedding_fx`, `wedding_script`, `env_mostrar`, `env_color`, `env_particulas`, `env_particulas_tam`, `text_styles`, `color_tema`, `hero_emoji`).

- [ ] **Step 1: Crear el archivo con este contenido completo**

```json
{
  "version": 1,
  "textos": {
    "final": "¡Gracias, {nombre}! ✦ Vamos a preparar tu invitación con mucho amor y te contactamos apenas esté lista.",
    "bloqueada": "Tus datos ya fueron enviados y estamos trabajando en tu invitación. Si querés cambiar algo, escribinos por WhatsApp."
  },
  "estilos": [
    { "id": "noir", "nombre": "Noir", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Elegancia oscura con dorado",
      "config": { "modelo": "clasico", "color_esquema": "negro", "estilo_aero": false, "formato": "clasico", "env_mostrar": true, "env_color": "negro", "env_particulas": "estrellas", "env_particulas_tam": 3 } },
    { "id": "perla", "nombre": "Perla", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Luminoso y limpio",
      "config": { "modelo": "clasico", "color_esquema": "blanco", "estilo_aero": false, "formato": "clasico", "env_mostrar": true, "env_color": "dorado", "env_particulas": "puntos", "env_particulas_tam": 3,
        "text_styles": { "hero-names": { "font": "Playfair Display" } } } },
    { "id": "champagne", "nombre": "Champagne", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Cálido y romántico",
      "config": { "modelo": "clasico", "color_esquema": "champagne", "estilo_aero": false, "formato": "clasico", "env_mostrar": true, "env_color": "dorado", "env_particulas": "puntos", "env_particulas_tam": 3 } },
    { "id": "zafiro", "nombre": "Zafiro", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Azul y plata",
      "config": { "modelo": "clasico", "color_esquema": "azul", "estilo_aero": false, "formato": "clasico", "env_mostrar": true, "env_color": "azul", "env_particulas": "estrellas", "env_particulas_tam": 3,
        "text_styles": { "hero-names": { "font": "Cinzel" } } } },
    { "id": "noir-aero", "nombre": "Noir Aero", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Oscuro con vidrio esmerilado",
      "config": { "modelo": "clasico", "color_esquema": "negro", "estilo_aero": true, "formato": "clasico", "env_mostrar": true, "env_color": "negro", "env_particulas": "puntos", "env_particulas_tam": 3 } },
    { "id": "cristal", "nombre": "Cristal", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Blanco glassmorphism",
      "config": { "modelo": "clasico", "color_esquema": "blanco", "estilo_aero": true, "formato": "clasico", "env_mostrar": true, "env_color": "azul", "env_particulas": "puntos", "env_particulas_tam": 3 } },
    { "id": "oro-real", "nombre": "Oro Real", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Champagne con caligrafía",
      "config": { "modelo": "clasico", "color_esquema": "champagne", "estilo_aero": true, "formato": "clasico", "env_mostrar": true, "env_color": "dorado", "env_particulas": "estrellas", "env_particulas_tam": 4,
        "text_styles": { "hero-names": { "font": "Great Vibes" } } } },
    { "id": "medianoche", "nombre": "Medianoche", "modelo": "clasico", "demo": "clasico_xv", "descripcion": "Azul profundo aero",
      "config": { "modelo": "clasico", "color_esquema": "azul", "estilo_aero": true, "formato": "clasico", "env_mostrar": true, "env_color": "azul", "env_particulas": "puntos", "env_particulas_tam": 3 } },
    { "id": "the-wedding", "nombre": "The Wedding", "modelo": "clasico", "demo": "clasico_boda", "descripcion": "Portada wedding con glow",
      "config": { "modelo": "clasico", "color_esquema": "negro", "estilo_aero": false, "formato": "wedding", "wedding_fx": "glow", "wedding_script": "The Wedding", "env_mostrar": true, "env_color": "negro", "env_particulas": "estrellas", "env_particulas_tam": 3 } },
    { "id": "wedding-blanc", "nombre": "Wedding Blanc", "modelo": "clasico", "demo": "clasico_boda", "descripcion": "Wedding luminoso con blur",
      "config": { "modelo": "clasico", "color_esquema": "blanco", "estilo_aero": false, "formato": "wedding", "wedding_fx": "blur", "wedding_script": "The Wedding", "env_mostrar": true, "env_color": "dorado", "env_particulas": "puntos", "env_particulas_tam": 3 } },
    { "id": "wedding-champagne", "nombre": "Wedding Champagne", "modelo": "clasico", "demo": "clasico_boda", "descripcion": "Wedding cálido dorado",
      "config": { "modelo": "clasico", "color_esquema": "champagne", "estilo_aero": false, "formato": "wedding", "wedding_fx": "glow", "wedding_script": "The Wedding", "env_mostrar": true, "env_color": "dorado", "env_particulas": "estrellas", "env_particulas_tam": 3 } },
    { "id": "wedding-azul", "nombre": "Wedding Azul", "modelo": "clasico", "demo": "clasico_boda", "descripcion": "Wedding nocturno sobrio",
      "config": { "modelo": "clasico", "color_esquema": "azul", "estilo_aero": false, "formato": "wedding", "wedding_fx": "sombra", "wedding_script": "The Wedding", "env_mostrar": true, "env_color": "azul", "env_particulas": "estrellas", "env_particulas_tam": 3 } },
    { "id": "mauve", "nombre": "Mauve", "modelo": "social", "demo": "social", "descripcion": "Rosado vintage",
      "config": { "modelo": "social", "color_tema": "mauve", "hero_emoji": "🌸" } },
    { "id": "lavanda", "nombre": "Lavanda", "modelo": "social", "demo": "social", "descripcion": "Violeta suave",
      "config": { "modelo": "social", "color_tema": "lavanda", "hero_emoji": "💜" } },
    { "id": "durazno", "nombre": "Durazno", "modelo": "social", "demo": "social", "descripcion": "Cálido y dulce",
      "config": { "modelo": "social", "color_tema": "durazno", "hero_emoji": "🍑" } },
    { "id": "menta", "nombre": "Menta", "modelo": "social", "demo": "social", "descripcion": "Verde fresco",
      "config": { "modelo": "social", "color_tema": "menta", "hero_emoji": "🌿" } },
    { "id": "celeste", "nombre": "Celeste", "modelo": "social", "demo": "social", "descripcion": "Cielo sereno",
      "config": { "modelo": "social", "color_tema": "celeste", "hero_emoji": "🦋" } },
    { "id": "coral", "nombre": "Coral", "modelo": "social", "demo": "social", "descripcion": "Vibrante y alegre",
      "config": { "modelo": "social", "color_tema": "coral", "hero_emoji": "🌺" } },
    { "id": "champagne-social", "nombre": "Champagne Social", "modelo": "social", "demo": "social", "descripcion": "Dorado festivo",
      "config": { "modelo": "social", "color_tema": "champagne", "hero_emoji": "✨" } },
    { "id": "rosa-empolvado", "nombre": "Rosa Empolvado", "modelo": "social", "demo": "social", "descripcion": "Rosa delicado",
      "config": { "modelo": "social", "color_tema": "rosa-empolvado", "hero_emoji": "🎀" } }
  ],
  "demo": {
    "clasico_xv": {
      "tipo": "quinces", "modelo": "clasico", "novios": "Valentina", "titulo": "¡Mis 15!",
      "fecha_display": "14 de Noviembre, 2026", "fecha_iso": "2026-11-14",
      "presentacion": "Con todo nuestro amor te invitamos a celebrar sus quince años",
      "media_url": "estilos-demo/demo-xv.jpg", "media_type": "image",
      "recepcion_hora": "21:00", "fin_fiesta_hora": "04:00",
      "lugar_nombre": "Salón Los Álamos", "lugar_direccion": "Av. Libertador 1234, Buenos Aires", "lugar_maps": "",
      "dresscode": "Elegante", "dresscode_nota": "",
      "regalo_texto": "Tu presencia es el mejor regalo. Pero si insistís, acá está el dato:", "alias_mp": "valen.quince", "alias_banco": "Mercado Pago", "alias_titular": "Familia García",
      "env_slogan": "Compartí este momento especial", "rsvp_activo": false, "youtube_audio": "", "spotify_url": ""
    },
    "clasico_boda": {
      "tipo": "casamiento", "modelo": "clasico", "novios": "Sofía & Nicolás", "titulo": "¡Nos casamos!",
      "fecha_display": "14 de Noviembre, 2026", "fecha_iso": "2026-11-14",
      "presentacion": "Con inmensa alegría los invitamos a celebrar nuestro casamiento",
      "media_url": "estilos-demo/demo-boda.jpg", "media_type": "image",
      "ceremonia_hora": "18:00", "ceremonia_lugar": "Iglesia San José", "ceremonia_direccion": "Av. Rivadavia 1234, CABA",
      "recepcion_hora": "21:00", "fin_fiesta_hora": "04:00", "recepcion_lugar": "Salón Los Álamos",
      "lugar_nombre": "Salón Los Álamos", "lugar_direccion": "Av. Libertador 1234, Buenos Aires", "lugar_maps": "",
      "dresscode": "Formal", "dresscode_nota": "Evitar el color blanco",
      "regalo_texto": "Tu presencia es el mejor regalo. Pero si insistís, acá está el dato:", "alias_mp": "sofi.nico", "alias_banco": "Mercado Pago", "alias_titular": "Sofía Pérez",
      "env_slogan": "Compartí este momento especial con nosotros", "rsvp_activo": false, "youtube_audio": "", "spotify_url": ""
    },
    "social": {
      "modelo": "social", "tipo": "quinces", "novios": "Valentina", "titulo": "MIS 15",
      "fecha_display": "14 DE NOVIEMBRE 2026", "fecha_iso": "2026-11-14",
      "media_url": "estilos-demo/demo-social.jpg", "media_type": "image",
      "recepcion_hora": "21:00", "lugar_nombre": "Salón Los Álamos", "lugar_direccion": "Av. Libertador 1234, Buenos Aires", "lugar_maps": "",
      "dresscode": "Elegante", "dresscode_nota": "El color ROSA se reserva para la quinceañera",
      "frase_emotiva": "Hay momentos que no se pueden borrar, y este quiero vivirlo con vos.",
      "carousel_images_1": ["estilos-demo/demo-c1.jpg", "estilos-demo/demo-c2.jpg", "estilos-demo/demo-c3.jpg"],
      "carousel_images_2": [],
      "trivia_preguntas": [
        { "pregunta": "¿Cuál es mi color favorito?", "opciones": ["Rosa", "Lila", "Negro", "Celeste"], "correcta": 1, "activa": true },
        { "pregunta": "¿Qué música no puede faltar en mi fiesta?", "opciones": ["Cumbia", "Pop", "Reggaetón", "Rock"], "correcta": 2, "activa": true }
      ],
      "regalo_texto": "Nada es más importante que tu presencia. Pero si querés regalarme algo:", "alias_mp": "valen.quince", "alias_banco": "Mercado Pago", "alias_titular": "Familia García",
      "album_url": "", "rsvp_activo": false, "youtube_audio": ""
    }
  },
  "trivia_pool": [
    { "pregunta": "¿Cuál es mi color favorito?", "distractores": ["Rosa", "Azul", "Violeta", "Negro", "Rojo", "Verde"] },
    { "pregunta": "¿Cuál es mi comida favorita?", "distractores": ["Pizza", "Sushi", "Milanesa con puré", "Hamburguesa", "Pastas", "Asado"] },
    { "pregunta": "¿Qué música no puede faltar en la fiesta?", "distractores": ["Reggaetón", "Cumbia", "Pop", "Rock nacional", "Electrónica", "Cuarteto"] },
    { "pregunta": "¿Cuál es mi serie favorita?", "distractores": ["Stranger Things", "Friends", "The Office", "Grey's Anatomy", "Élite", "Merlina"] },
    { "pregunta": "¿Qué hago cuando estoy nerviosa/o?", "distractores": ["Me río sin parar", "Como de todo", "Hablo sin parar", "Me quedo en silencio", "Camino de un lado a otro"] },
    { "pregunta": "¿Cuál es mi estación del año favorita?", "distractores": ["Verano", "Primavera", "Otoño", "Invierno"] },
    { "pregunta": "¿Qué superpoder elegiría?", "distractores": ["Volar", "Ser invisible", "Leer mentes", "Teletransportarme", "Detener el tiempo"] },
    { "pregunta": "¿Cuál es mi postre favorito?", "distractores": ["Helado", "Chocotorta", "Flan", "Cheesecake", "Brownie", "Tiramisú"] },
    { "pregunta": "¿A qué le tengo miedo?", "distractores": ["Arañas", "Alturas", "Oscuridad", "Payasos", "Truenos"] },
    { "pregunta": "¿Cuál es mi emoji más usado?", "distractores": ["😂", "❤️", "😍", "🙄", "✨", "🥺"] },
    { "pregunta": "¿Qué app uso más?", "distractores": ["TikTok", "Instagram", "WhatsApp", "YouTube", "Spotify"] },
    { "pregunta": "¿Qué hago en mi tiempo libre?", "distractores": ["Dormir", "Ver series", "Salir con amigos", "Escuchar música", "Hacer deporte", "Leer"] },
    { "pregunta": "¿Cuál es mi animal favorito?", "distractores": ["Perro", "Gato", "Caballo", "Delfín", "Conejo"] },
    { "pregunta": "¿Qué no puede faltar en mi mochila o cartera?", "distractores": ["Auriculares", "Maquillaje", "Celular", "Snacks", "Perfume"] },
    { "pregunta": "¿Cuál es mi artista favorito?", "distractores": ["Taylor Swift", "Bad Bunny", "Duki", "María Becerra", "Tini", "Coldplay"] }
  ]
}
```

- [ ] **Step 2: Validar el JSON**

Run (PowerShell): `node -e "const c=require('e:/CLAUDE/WEB KUERRE/Desarrollo/estilos-catalogo.json'); console.log(c.estilos.length, 'estilos,', c.estilos.filter(e=>e.modelo==='clasico').length, 'clasicos,', c.trivia_pool.length, 'trivia');"`
Expected: `20 estilos, 12 clasicos, 15 trivia`

- [ ] **Step 3: Commit** (repo `e:\CLAUDE\WEB KUERRE`)

```
git add "Desarrollo/estilos-catalogo.json"
git commit -F <archivo con mensaje: "Catalogo de 20 estilos de invitacion + demos + pool de trivia">
```

---

### Task 2: Fotos stock para las demos

**Files:**
- Create: `e:\CLAUDE\WEB KUERRE\Desarrollo\estilos-demo\demo-xv.jpg`, `demo-boda.jpg`, `demo-social.jpg`, `demo-c1.jpg`, `demo-c2.jpg`, `demo-c3.jpg`

**Interfaces:**
- Produces: 6 JPGs optimizados (~1080px de ancho, <300 KB c/u) referenciados por los paths relativos del catálogo (Task 1).

- [ ] **Step 1: Descargar candidatas de Pexels (sin API key, regex del HTML — técnica ya usada en el proyecto)**

Bash (por cada término: `quinceanera dress`, `wedding couple`, `birthday party lights`, `party friends`, `party dance`, `elegant table event`):

```bash
cd "/e/CLAUDE/WEB KUERRE/Desarrollo" && mkdir -p estilos-demo
curl -sL "https://www.pexels.com/search/quinceanera%20dress/" -H "User-Agent: Mozilla/5.0" \
  | grep -oE 'https://images\.pexels\.com/photos/[0-9]+/[^"?]+\.jpeg' | sort -u | head -5
# elegir una URL vertical del listado y bajarla:
curl -sL "<URL-elegida>?auto=compress&w=1080" -o estilos-demo/demo-xv.jpg
```

Repetir para `demo-boda.jpg` (wedding couple), `demo-social.jpg` (retrato fiesta vertical), `demo-c1/2/3.jpg` (fotos de fiesta variadas).

- [ ] **Step 2: Verificar peso y dimensiones**

Run: `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 estilos-demo/demo-xv.jpg` (por cada archivo)
Expected: ancho ≤1080. Si algún archivo pesa >300 KB: `ffmpeg -i in.jpg -vf "scale=1080:-2" -q:v 4 out.jpg` y reemplazar.

- [ ] **Step 3: Verificación visual** — abrir cada JPG y confirmar que es apropiado (vertical para portadas, sin marcas de agua, estética acorde).

- [ ] **Step 4: Commit**

```
git add "Desarrollo/estilos-demo"
git commit -F <mensaje: "Fotos stock Pexels para demos del catalogo de estilos">
```

---

### Task 3: Worker — endpoints `/invite/{slug}/estado` y `/invite/{slug}/completar`

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js` (insertar después del bloque `invCfgMatch` POST, línea ~832, antes del comentario `── KV públicas de solo lectura`)

**Interfaces:**
- Consumes: helpers existentes `json()`, KV key `invite_cfg_{slug}`, KV `crd_invites` (lista `[{id, tipo, config, slug, created}]`), tabla D1 `config` (mirror de `crd_invites`).
- Produces:
  - `GET /invite/{slug}/estado` → `{ existe:true, form_completado:bool, nombre:string, tipo:string, estilo_elegido:string|null }` (404 si no existe)
  - `POST /invite/{slug}/completar` body `{ estilo_id:string, config:object }` → `{ ok:true }` | 404 | 409 si ya completado

- [ ] **Step 1: Insertar el código**

```js
      // ── Estilos: estado del formulario del cliente ─────────────────────────
      const invEstadoMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})\/estado$/);
      if (invEstadoMatch && method === 'GET') {
        const raw = await env.KUERRE_KV.get('invite_cfg_' + invEstadoMatch[1]);
        if (!raw) return json({ error: 'Not found' }, 404);
        let c; try { c = JSON.parse(raw); } catch { return json({ error: 'Config inválida' }, 500); }
        return json({
          existe: true,
          form_completado: !!c.form_completado,
          nombre: c.novios || '',
          tipo: c.tipo || 'otro',
          estilo_elegido: c.estilo_elegido || null
        });
      }

      // ── Estilos: el cliente completa estilo + datos (un solo uso) ──────────
      const invCompletarMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})\/completar$/);
      if (invCompletarMatch && method === 'POST') {
        const cSlug = invCompletarMatch[1];
        const raw = await env.KUERRE_KV.get('invite_cfg_' + cSlug);
        if (!raw) return json({ error: 'Invitación no encontrada' }, 404);
        let existing; try { existing = JSON.parse(raw); } catch { return json({ error: 'Config inválida' }, 500); }
        if (existing.form_completado) return json({ error: 'Ya completado' }, 409);
        const body = await request.json().catch(() => null);
        if (!body || typeof body.config !== 'object' || !body.estilo_id) return json({ error: 'Body inválido' }, 400);
        // Campos que el cliente NO puede pisar: identidad del slug y flags del sistema
        const incoming = { ...body.config };
        ['novios', 'fecha_display', 'fecha_iso', 'tipo', 'form_completado', 'estilo_elegido',
         'logo_dark', 'logo_light', 'logo_filter', 'emailjs_key', 'emailjs_service', 'gsheet_url'].forEach(k => delete incoming[k]);
        const merged = {
          ...existing, ...incoming,
          form_completado: true,
          form_completado_at: new Date().toISOString(),
          estilo_elegido: String(body.estilo_id)
        };
        await env.KUERRE_KV.put('invite_cfg_' + cSlug, JSON.stringify(merged));
        // Reflejar en crd_invites para que el admin lo vea (entrada matcheada por slug)
        try {
          const invitesRaw = await env.KUERRE_KV.get('crd_invites');
          const invitesList = invitesRaw ? JSON.parse(invitesRaw) : [];
          const entry = invitesList.find(x => x.slug === cSlug);
          if (entry) {
            entry.config = merged;
            entry.tipo = merged.tipo || entry.tipo;
            const invitesStr = JSON.stringify(invitesList);
            await env.KUERRE_KV.put('crd_invites', invitesStr);
            await env.KUERRE_DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('crd_invites', invitesStr).run();
          }
        } catch (e) { console.log('completar: no se pudo reflejar en crd_invites', e.message); }
        return json({ ok: true });
      }
```

**Nota de orden:** estos `match` deben ir ANTES del bloque `invCfgMatch` existente NO es necesario — `invCfgMatch` usa regex con `$` tras el slug (`/^\/invite\/([a-z0-9-]{...})$/`), así que `/estado` y `/completar` no colisionan. Insertarlos inmediatamente después del bloque POST de `invCfgMatch` (línea ~832).

- [ ] **Step 2: Sintaxis OK**

Run: `node --check "e:\CLAUDE\WEB KUERRE\worker\src\index.js"`
Expected: sin salida (exit 0)

- [ ] **Step 3: Probar en local con wrangler dev** (o directo en prod tras deploy — el worker no tiene entorno de test)

```bash
cd "/e/CLAUDE/WEB KUERRE/worker" && npx wrangler deploy
BASE="https://kuerre-worker.cristian-romero-digital.workers.dev"
# crear invitación de prueba directo en KV via endpoint POST existente requiere CF_AUTH_TOKEN;
# usar una invitación real existente de prueba o crear con wrangler:
npx wrangler kv key put --remote --binding=KUERRE_KV "invite_cfg_test-estilos-plan" '{"tipo":"quinces","modelo":"clasico","novios":"Test Estilos","fecha_display":"01/12/2026","fecha_iso":"2026-12-01"}'
curl -s "$BASE/invite/test-estilos-plan/estado"
# → {"existe":true,"form_completado":false,"nombre":"Test Estilos","tipo":"quinces","estilo_elegido":null}
curl -s -X POST "$BASE/invite/test-estilos-plan/completar" -H "Content-Type: application/json" \
  --data-binary '{"estilo_id":"noir","config":{"color_esquema":"negro","dresscode":"Elegante","novios":"HACKED"}}'
# → {"ok":true}
curl -s "$BASE/invite/test-estilos-plan" | python -m json.tool
# → novios sigue "Test Estilos" (no HACKED), color_esquema negro, form_completado true, estilo_elegido "noir"
curl -s -X POST "$BASE/invite/test-estilos-plan/completar" -H "Content-Type: application/json" --data-binary '{"estilo_id":"perla","config":{}}'
# → {"error":"Ya completado"} con status 409
```

- [ ] **Step 4: Commit**

```
git add worker/src/index.js
git commit -F <mensaje: "Worker: endpoints estado y completar para formulario de estilos del cliente">
```

---

### Task 4: Worker — endpoint `/invite/{slug}/media` (upload R2 + Drive background)

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\worker\src\index.js` (insertar junto a los endpoints de Task 3)

**Interfaces:**
- Consumes: helpers existentes `json()`, `gasUploadBackground(gasUrl, folderId, buffer, filename, mimeType, idForErr, env)`, KV `fiestas_gas_url`, R2 `env.MEDIA`, ruta existente `GET /api/fotos/{key}` (sirve cualquier key de MEDIA), tabla `solicitudes` (columnas `invite_id`, `drive_invitacion_id`, `drive_carrusel1_id`, `drive_carrusel2_id`), `crd_invites` (entry `{id, slug}` — `entry.id` = solicitud id en minúscula).
- Produces: `POST /invite/{slug}/media` (multipart: `file`, `tipo` ∈ portada|carrusel1|carrusel2) → `{ ok:true, url }`. La URL es `{origin}/api/fotos/{key urlencoded}`.

- [ ] **Step 1: Insertar el código** (después del bloque `/completar` de Task 3)

```js
      // ── Estilos: upload de portada/carruseles del cliente → R2 + Drive ─────
      const invMediaUpMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})\/media$/);
      if (invMediaUpMatch && method === 'POST') {
        const mSlug = invMediaUpMatch[1];
        const raw = await env.KUERRE_KV.get('invite_cfg_' + mSlug);
        if (!raw) return json({ error: 'Invitación no encontrada' }, 404);
        let mCfg; try { mCfg = JSON.parse(raw); } catch { return json({ error: 'Config inválida' }, 500); }
        if (mCfg.form_completado) return json({ error: 'Formulario ya enviado' }, 409);
        const formData = await request.formData();
        const file = formData.get('file');
        const tipoMedia = String(formData.get('tipo') || '');
        if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'No se recibió archivo' }, 400);
        if (!['portada', 'carrusel1', 'carrusel2'].includes(tipoMedia)) return json({ error: 'Tipo inválido' }, 400);
        const isVideo = (file.type || '').startsWith('video/');
        const maxBytes = (isVideo ? 50 : 15) * 1024 * 1024;
        const buffer = await file.arrayBuffer();
        if (buffer.byteLength > maxBytes) return json({ error: `Archivo demasiado grande (máx ${isVideo ? 50 : 15}MB)` }, 400);
        const ext = ((file.name || (isVideo ? 'video.mp4' : 'foto.jpg')).split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const key = `invite-media/${mSlug}/${tipoMedia}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        await env.MEDIA.put(key, buffer, { httpMetadata: { contentType: file.type || 'image/jpeg' } });
        // Drive en background: carpeta según tipo, solicitud vinculada por crd_invites entry.id
        try {
          const invitesRaw = await env.KUERRE_KV.get('crd_invites');
          const entry = (invitesRaw ? JSON.parse(invitesRaw) : []).find(x => x.slug === mSlug);
          if (entry && entry.id) {
            const sol = await env.KUERRE_DB.prepare(
              'SELECT drive_invitacion_id, drive_carrusel1_id, drive_carrusel2_id FROM solicitudes WHERE LOWER(id) = ?'
            ).bind(String(entry.id).toLowerCase()).first();
            const folderId = sol && { portada: sol.drive_invitacion_id, carrusel1: sol.drive_carrusel1_id, carrusel2: sol.drive_carrusel2_id }[tipoMedia];
            if (folderId) {
              const gasUrl = await env.KUERRE_KV.get('fiestas_gas_url');
              if (gasUrl && ctx) ctx.waitUntil(gasUploadBackground(gasUrl, folderId, buffer, file.name || key.split('/').pop(), file.type || 'image/jpeg', 'invmedia_' + mSlug, env));
            }
          }
        } catch (e) { console.log('media: Drive background skip', e.message); }
        const workerOrigin = new URL(request.url).origin;
        return json({ ok: true, url: `${workerOrigin}/api/fotos/${encodeURIComponent(key)}` });
      }
```

**Nota:** si la invitación no vino de una solicitud (o no está vinculada a Drive), el archivo queda solo en R2 — correcto según spec (no se pierde nada).

- [ ] **Step 2: Sintaxis OK** — `node --check "e:\CLAUDE\WEB KUERRE\worker\src\index.js"`

- [ ] **Step 3: Deploy + prueba con archivo real**

```bash
cd "/e/CLAUDE/WEB KUERRE/worker" && npx wrangler deploy
curl -s -X POST "$BASE/invite/test-estilos-plan/media" -F "tipo=portada" -F "file=@/e/CLAUDE/WEB KUERRE/Desarrollo/estilos-demo/demo-xv.jpg"
```
Expected: `{"ok":true,"url":"https://.../api/fotos/invite-media%2Ftest-estilos-plan%2Fportada_...jpg"}`. Nota: el slug de prueba fue completado en Task 3 → primero probar que devuelve 409, luego resetear el flag (`wrangler kv key put` con `form_completado` ausente) y probar upload OK. Abrir la URL devuelta en el browser y ver la imagen.

- [ ] **Step 4: Commit** — `git add worker/src/index.js` + mensaje "Worker: upload de portada y carruseles del cliente a R2 + Drive background"

---

### Task 5: Decode UTF-8-safe del parámetro `?c=` en invite.html e invite-social.html

Las demos pasan config con emojis (hero_emoji) y tildes por `?c=base64`. El decode actual (`JSON.parse(atob(...))`) rompe caracteres multibyte. Fix retrocompatible en ambos visores (Kuerre solamente).

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\invite.html` (función `parseConfig`, ~línea 584-590 — mismo contenido que Productivo)
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\invite-social.html` (función `parseConfig`, ~línea 402-414)

**Interfaces:**
- Produces: ambos visores aceptan `?c=` codificado con `btoa(bytes UTF-8)` (nuevo, usado por estilos.html Task 6) y siguen aceptando links legacy `btoa(latin1)`.

- [ ] **Step 1: En `invite.html`, reemplazar dentro de `parseConfig`:**

```js
  const raw = params.get('c');
  if (!raw) return null;
  try {
    return JSON.parse(atob(decodeURIComponent(raw)));
  } catch(e) {
    return null;
  }
```

por:

```js
  const raw = params.get('c');
  if (!raw) return null;
  try {
    const bin = atob(decodeURIComponent(raw));
    try {
      // Nuevo formato: bytes UTF-8 (soporta emojis y tildes). fatal:true fuerza el
      // fallback legacy cuando el base64 viene de btoa(latin1) de links viejos.
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
    } catch(e2) {
      return JSON.parse(bin);
    }
  } catch(e) {
    return null;
  }
```

- [ ] **Step 2: En `invite-social.html`, reemplazar:**

```js
  const raw = params.get('c');
  if (!raw) return null;
  try { return JSON.parse(atob(decodeURIComponent(raw))); } catch(e) { return null; }
```

por:

```js
  const raw = params.get('c');
  if (!raw) return null;
  try {
    const bin = atob(decodeURIComponent(raw));
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, ch => ch.charCodeAt(0)))); }
    catch(e2) { return JSON.parse(bin); }
  } catch(e) { return null; }
```

- [ ] **Step 3: Verificar en browser local** (`python -m http.server 8080` en `Desarrollo\`):

En consola del browser generar un link de prueba:
```js
const cfg = {modelo:'social', novios:'Valentina', titulo:'MIS 15', hero_emoji:'🌸', color_tema:'lavanda', fecha_iso:'2026-11-14', fecha_display:'14 DE NOVIEMBRE 2026'};
const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(cfg))));
location.href = 'invite-social.html?c=' + encodeURIComponent(b64);
```
Expected: la invitación carga con el emoji 🌸 intacto y tema lavanda. Repetir análogo en invite.html (formato clásico con tildes en textos).

- [ ] **Step 4: Commit** — mensaje "Decode UTF-8-safe del parametro c en invite e invite-social (retrocompatible)"

---

### Task 6: `estilos.html` — Paso 1: catálogo con demos vivas

**Files:**
- Create: `e:\CLAUDE\WEB KUERRE\Desarrollo\estilos.html`

**Interfaces:**
- Consumes: `estilos-catalogo.json` (Task 1), `invite.html`/`invite-social.html` con `?c=` UTF-8 (Task 5), `GET /invite/{slug}/estado` (Task 3).
- Produces: página con estado global `state = { catalogo, slug, estado, estiloElegido, datos, uploads }` y funciones `b64Cfg(obj)`, `demoUrl(estilo, {fullscreen})`, `irPaso(n)`, `elegirEstilo(id)` que Task 7 extiende.

- [ ] **Step 1: Crear la página completa** (estructura + estilos + paso 1; los contenedores de paso 2/3 quedan vacíos y los llena Task 7):

```html
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1">
<meta name="robots" content="noindex">
<title>Elegí el estilo de tu invitación — KUERRE</title>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Cormorant+Garamond:wght@300;400&display=swap" rel="stylesheet">
<style>
:root{--acc:#9060b8;--acc2:#7a4aa0;--bg:#f6f6f8;--card:#ffffff;--txt:#1a1a1a;--soft:rgba(0,0,0,.55);--border:rgba(0,0,0,.08)}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Montserrat',sans-serif;background:var(--bg);color:var(--txt);min-height:100vh;
  background-image:radial-gradient(ellipse 70% 55% at 15% 15%, rgba(192,144,224,.16) 0%, transparent 60%),radial-gradient(ellipse 55% 45% at 85% 80%, rgba(192,144,224,.12) 0%, transparent 60%);background-attachment:fixed}
header{padding:28px 20px;text-align:center}
.logo{font-size:18px;letter-spacing:6px;text-transform:uppercase;color:var(--acc);font-weight:400}
h1{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:clamp(28px,5vw,44px);margin-top:14px}
.sub{font-size:13px;color:var(--soft);margin-top:8px;max-width:520px;margin-left:auto;margin-right:auto;line-height:1.7}
.steps{display:flex;justify-content:center;gap:8px;margin:22px 0 8px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--soft)}
.steps .st{padding:6px 12px;border-radius:20px;border:1px solid var(--border)}
.steps .st.on{background:var(--acc);color:#fff;border-color:var(--acc)}
main{max-width:1100px;margin:0 auto;padding:10px 16px 80px}
.filtros{display:flex;justify-content:center;gap:10px;margin:18px 0 26px}
.filtros button{padding:10px 22px;border:1px solid var(--border);background:var(--card);border-radius:22px;font-family:inherit;font-size:11px;letter-spacing:2px;text-transform:uppercase;cursor:pointer;color:var(--soft)}
.filtros button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:18px}
.card{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.05);transition:transform .2s,box-shadow .2s}
.card:hover{transform:translateY(-3px);box-shadow:0 14px 34px rgba(144,96,184,.18)}
.frame-wrap{position:relative;width:100%;aspect-ratio:390/700;overflow:hidden;background:#111;cursor:pointer}
.frame-wrap iframe{width:390px;height:700px;border:0;transform-origin:0 0;pointer-events:none;position:absolute;top:0;left:0}
.frame-wrap .ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-family:'Cormorant Garamond',serif;font-size:20px;background:linear-gradient(135deg,#2a2040,#4a3068)}
.frame-wrap .lupa{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.45);color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:14px}
.card-body{padding:14px}
.card-nombre{font-family:'Cormorant Garamond',serif;font-size:20px}
.card-desc{font-size:11px;color:var(--soft);margin:4px 0 12px}
.card-tag{display:inline-block;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--acc);border:1px solid rgba(144,96,184,.3);padding:3px 8px;border-radius:12px;margin-bottom:8px}
.btn{display:inline-block;width:100%;padding:12px;text-align:center;background:var(--acc);color:#fff;border:none;border-radius:8px;font-family:inherit;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer}
.btn:hover{background:var(--acc2)}
.btn-sec{background:none;color:var(--acc);border:1px solid var(--acc)}
#fullscreen{display:none;position:fixed;inset:0;z-index:100;background:rgba(20,10,35,.92);backdrop-filter:blur(6px)}
#fullscreen.open{display:flex;flex-direction:column;align-items:center;padding:16px}
#fullscreen .fs-bar{display:flex;gap:12px;align-items:center;margin-bottom:12px;width:100%;max-width:420px;justify-content:space-between}
#fullscreen .fs-nombre{color:#fff;font-family:'Cormorant Garamond',serif;font-size:22px}
#fullscreen iframe{width:min(420px,100%);flex:1;border:0;border-radius:14px;background:#000}
#fullscreen .fs-cerrar{background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-family:inherit;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer}
#fullscreen .fs-elegir{background:var(--acc);color:#fff;border:none;border-radius:8px;padding:10px 22px;font-family:inherit;font-size:10px;letter-spacing:2px;text-transform:uppercase;cursor:pointer}
.pantalla{max-width:560px;margin:60px auto;text-align:center;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:48px 32px}
.pantalla h2{font-family:'Cormorant Garamond',serif;font-weight:300;font-size:30px;margin-bottom:14px}
.pantalla p{font-size:13px;color:var(--soft);line-height:1.8}
.wa{display:inline-block;margin-top:22px;padding:12px 26px;background:#25D366;color:#fff;border-radius:8px;text-decoration:none;font-size:11px;letter-spacing:2px;text-transform:uppercase}
#paso-2,#paso-3{display:none;max-width:680px;margin:0 auto}
.form-sec{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:24px;margin-bottom:18px}
.form-sec h3{font-family:'Cormorant Garamond',serif;font-weight:400;font-size:20px;margin-bottom:16px;color:var(--acc2)}
.fg{margin-bottom:14px}
.fg label{display:block;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--soft);margin-bottom:6px}
.fg input,.fg textarea,.fg select{width:100%;padding:12px;border:1px solid var(--border);border-radius:8px;font-family:inherit;font-size:16px;background:#fff;color:var(--txt)}
.fg textarea{min-height:70px;resize:vertical}
.f2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:560px){.f2{grid-template-columns:1fr}}
.hint{font-size:10px;color:var(--soft);margin-top:4px}
.ro{background:#f2eef7 !important;color:var(--soft)}
.up-zone{border:2px dashed rgba(144,96,184,.4);border-radius:10px;padding:22px;text-align:center;font-size:12px;color:var(--soft);cursor:pointer}
.up-zone.ok{border-color:#0e9f4e;color:#0e9f4e}
.up-prev{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.up-prev img{width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border)}
.trivia-row{border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:12px}
.trivia-row .tq{font-size:13px;font-weight:500;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.trivia-row .tq button{background:none;border:none;color:var(--acc);cursor:pointer;font-size:16px;flex-shrink:0}
.resumen-item{display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid var(--border);font-size:12px}
.resumen-item b{color:var(--soft);font-weight:500;flex-shrink:0}
#toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#fff;border:1px solid rgba(204,68,68,.4);border-radius:10px;padding:14px 22px;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.15);opacity:0;pointer-events:none;transition:opacity .3s;z-index:200}
#toast.show{opacity:1}
</style>
</head>
<body>
<header>
  <div class="logo">Kuerre ✦</div>
  <h1 id="titulo-h1">Elegí el estilo de tu invitación</h1>
  <div class="sub" id="sub-h1">Cada estilo es una línea estética completa. Tocá una tarjeta para verla en vivo, y cuando encuentres la tuya, elegila.</div>
  <div class="steps" id="steps" style="display:none">
    <span class="st on" id="st-1">1 · Estilo</span><span class="st" id="st-2">2 · Tus datos</span><span class="st" id="st-3">3 · Confirmar</span>
  </div>
</header>
<main>
  <div id="paso-1">
    <div class="filtros">
      <button class="on" data-f="todos" onclick="filtrar('todos')">Todos</button>
      <button data-f="clasico" onclick="filtrar('clasico')">Clásicos</button>
      <button data-f="social" onclick="filtrar('social')">Social ✦</button>
    </div>
    <div class="grid" id="grid"></div>
  </div>
  <div id="paso-2"></div>
  <div id="paso-3"></div>
  <div id="pantalla-final" class="pantalla" style="display:none"></div>
  <div id="pantalla-bloqueada" class="pantalla" style="display:none"></div>
</main>
<div id="fullscreen">
  <div class="fs-bar">
    <span class="fs-nombre" id="fs-nombre"></span>
    <div style="display:flex;gap:8px">
      <button class="fs-elegir" id="fs-elegir">Elegir este estilo</button>
      <button class="fs-cerrar" onclick="cerrarFullscreen()">✕ Cerrar</button>
    </div>
  </div>
  <iframe id="fs-iframe"></iframe>
</div>
<div id="toast"></div>
<script>
// KUERRE estilos.html V1.00
const WORKER = 'https://kuerre-worker.cristian-romero-digital.workers.dev';
const WA_LINK = 'https://wa.me/5491162557763?text=' + encodeURIComponent('Hola! Quiero mi invitación digital ✦');
const state = { catalogo: null, slug: null, estado: null, estiloElegido: null, datos: {}, uploads: { portada: null, carrusel1: [], carrusel2: [] }, triviaSel: [] };

function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }

function b64Cfg(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return encodeURIComponent(btoa(bin));
}

function demoUrl(estilo, opts) {
  const base = state.catalogo.demo[estilo.demo];
  const cfg = { ...base, ...estilo.config };
  if (!(opts && opts.fullscreen)) cfg.env_mostrar = false; // miniaturas muestran la portada, no el sobre
  const page = estilo.modelo === 'social' ? 'invite-social.html' : 'invite.html';
  return page + '?c=' + b64Cfg(cfg) + '&preview=1';
}

function filtrar(f) {
  document.querySelectorAll('.filtros button').forEach(b => b.classList.toggle('on', b.dataset.f === f));
  document.querySelectorAll('.card').forEach(c => { c.style.display = (f === 'todos' || c.dataset.modelo === f) ? '' : 'none'; });
}

function renderCatalogo() {
  const grid = document.getElementById('grid');
  grid.innerHTML = state.catalogo.estilos.map(e => `
    <div class="card" data-modelo="${e.modelo}" data-id="${e.id}">
      <div class="frame-wrap" onclick="abrirFullscreen('${e.id}')">
        <div class="ph">${e.nombre}</div>
        <span class="lupa">🔍</span>
      </div>
      <div class="card-body">
        <span class="card-tag">${e.modelo === 'social' ? 'Social ✦' : 'Clásico'}</span>
        <div class="card-nombre">${e.nombre}</div>
        <div class="card-desc">${e.descripcion}</div>
        ${state.slug ? `<button class="btn" onclick="elegirEstilo('${e.id}')">Elegir este estilo</button>`
                     : `<a class="btn" style="text-decoration:none" href="${WA_LINK}">Lo quiero ✦</a>`}
      </div>
    </div>`).join('');
  // Lazy-mount de iframes al entrar al viewport
  const io = new IntersectionObserver(entries => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      const id = en.target.closest('.card').dataset.id;
      const estilo = state.catalogo.estilos.find(x => x.id === id);
      const ifr = document.createElement('iframe');
      ifr.loading = 'lazy';
      ifr.src = demoUrl(estilo);
      en.target.prepend(ifr);
      const fit = () => { ifr.style.transform = 'scale(' + (en.target.clientWidth / 390) + ')'; };
      fit(); new ResizeObserver(fit).observe(en.target);
    });
  }, { rootMargin: '200px' });
  document.querySelectorAll('.frame-wrap').forEach(w => io.observe(w));
}

function abrirFullscreen(id) {
  const estilo = state.catalogo.estilos.find(x => x.id === id);
  document.getElementById('fs-nombre').textContent = estilo.nombre;
  document.getElementById('fs-iframe').src = demoUrl(estilo, { fullscreen: true });
  const btn = document.getElementById('fs-elegir');
  btn.style.display = state.slug ? '' : 'none';
  btn.onclick = () => { cerrarFullscreen(); elegirEstilo(id); };
  document.getElementById('fullscreen').classList.add('open');
}
function cerrarFullscreen() {
  document.getElementById('fullscreen').classList.remove('open');
  document.getElementById('fs-iframe').src = 'about:blank';
}

function irPaso(n) {
  document.getElementById('paso-1').style.display = n === 1 ? '' : 'none';
  document.getElementById('paso-2').style.display = n === 2 ? '' : 'none';
  document.getElementById('paso-3').style.display = n === 3 ? '' : 'none';
  [1, 2, 3].forEach(i => document.getElementById('st-' + i).classList.toggle('on', i <= n));
  window.scrollTo({ top: 0 });
}

function elegirEstilo(id) {
  state.estiloElegido = state.catalogo.estilos.find(x => x.id === id);
  renderFormulario(); // Task 7
  irPaso(2);
}

async function init() {
  const res = await fetch('estilos-catalogo.json?t=' + Date.now());
  state.catalogo = await res.json();
  state.slug = new URLSearchParams(location.search).get('i');
  if (state.slug) {
    try {
      const er = await fetch(WORKER + '/invite/' + state.slug + '/estado');
      if (!er.ok) { state.slug = null; }
      else {
        state.estado = await er.json();
        if (state.estado.form_completado) { mostrarBloqueada(); return; }
        document.getElementById('steps').style.display = '';
        document.getElementById('titulo-h1').textContent = 'Hola' + (state.estado.nombre ? ', ' + state.estado.nombre : '') + ' ✦';
        document.getElementById('sub-h1').textContent = 'Elegí el estilo de tu invitación y después completá los datos de tu evento. Nosotros nos encargamos del resto.';
      }
    } catch (e) { state.slug = null; }
  }
  renderCatalogo();
}

function mostrarBloqueada() {
  document.getElementById('paso-1').style.display = 'none';
  const p = document.getElementById('pantalla-bloqueada');
  p.style.display = '';
  p.innerHTML = '<h2>¡Ya recibimos tus datos! ✦</h2><p>' + state.catalogo.textos.bloqueada + '</p><a class="wa" href="' + WA_LINK + '">Escribinos</a>';
}

init();
</script>
</body>
</html>
```

**Nota:** `renderFormulario()` se define en Task 7 — hasta entonces, definir un stub temporal `function renderFormulario(){}` justo antes de `init()` para que el paso 1 sea testeable solo.

- [ ] **Step 2: Probar en browser local** (`python -m http.server 8080` en `Desarrollo\`):
  - `http://localhost:8080/estilos.html` → grilla de 20 cards, iframes cargan al scrollear, miniaturas muestran cada estilo distinto, filtros Clásicos/Social funcionan, botón "Lo quiero ✦" (modo público) apunta a WhatsApp.
  - Tap en card → fullscreen navegable, cerrar OK.
  - `http://localhost:8080/estilos.html?i=test-estilos-plan` (con el slug de prueba NO completado) → saludo "Hola, Test Estilos ✦", steps visibles, botón "Elegir este estilo".
  - Con el slug completado → pantalla bloqueada.

- [ ] **Step 3: Commit** — mensaje "estilos.html paso 1: catalogo de 20 estilos con demos vivas en iframe"

---

### Task 7: `estilos.html` — Pasos 2 y 3: formulario, uploads, trivia y generar

**Files:**
- Modify: `e:\CLAUDE\WEB KUERRE\Desarrollo\estilos.html` (reemplazar el stub `renderFormulario` por el bloque completo)

**Interfaces:**
- Consumes: `state` y helpers de Task 6, `POST /invite/{slug}/media` (Task 4), `POST /invite/{slug}/completar` (Task 3), `trivia_pool` del catálogo.
- Produces: config final del cliente enviada como `{estilo_id, config}` — `config` = `{...estilo.config, ...camposForm}` con nombres de campo idénticos a los que guarda el admin (`readInviteForm`).

- [ ] **Step 1: Reemplazar el stub por el código completo:**

```js
// ── PASO 2: FORMULARIO ──────────────────────────────────────────────────────
function fg(id, label, ph, tipo, hint) {
  return `<div class="fg"><label>${label}</label><${tipo === 'ta' ? 'textarea' : 'input'} id="${id}" ${tipo === 'date' ? 'type="date"' : ''} placeholder="${ph || ''}">${tipo === 'ta' ? '</textarea>' : ''}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

function renderFormulario() {
  const social = state.estiloElegido.modelo === 'social';
  const esBoda = state.estado.tipo === 'casamiento';
  let html = `<div class="form-sec"><h3>Estilo elegido: ${state.estiloElegido.nombre} ✦</h3>
    <div style="font-size:12px;color:var(--soft)">Podés volver a <a href="#" onclick="irPaso(1);return false" style="color:var(--acc)">cambiar el estilo</a> antes de confirmar.</div></div>`;

  html += `<div class="form-sec"><h3>Tu evento</h3>
    <div class="f2">
      <div class="fg"><label>Nombre</label><input class="ro" value="${state.estado.nombre}" readonly></div>
      <div class="fg"><label>Fecha</label><input class="ro" value="(la de tu contrato)" readonly></div>
    </div>
    <div class="hint" style="margin-bottom:14px">El nombre y la fecha ya los tenemos de tu contrato. Si hay que corregirlos, escribinos.</div>
    <div class="f2">${fg('f-hora', 'Hora de inicio', '21:00')}${fg('f-hora-fin', 'Hora de fin', '04:00')}</div>
    ${fg('f-lugar', 'Nombre del salón / lugar', 'Salón Los Álamos')}
    ${fg('f-lugar-dir', 'Dirección completa', 'Av. Libertador 1234, Buenos Aires')}
    ${fg('f-maps', 'Link de Google Maps (opcional)', 'https://maps.google.com/...', null, 'Buscá el lugar en Google Maps → Compartir → Copiar link')}
  </div>`;

  if (!social && esBoda) {
    html += `<div class="form-sec"><h3>Ceremonia (opcional)</h3>
      <div class="f2">${fg('f-cer-hora', 'Hora', '18:00')}${fg('f-cer-lugar', 'Lugar', 'Iglesia San José')}</div>
      ${fg('f-cer-dir', 'Dirección', 'Av. Rivadavia 1234, CABA')}
    </div>`;
  }

  html += `<div class="form-sec"><h3>Foto o video de portada</h3>
    <div class="hint" style="margin-bottom:10px">Es lo primero que van a ver tus invitados. Foto vertical o video corto (máx 50 MB).</div>
    <div class="up-zone" id="up-portada" onclick="document.getElementById('file-portada').click()">📷 Tocá para subir tu foto o video</div>
    <input type="file" id="file-portada" accept="image/*,video/mp4,video/quicktime" style="display:none" onchange="subirMedia(this, 'portada')">
    <div class="up-prev" id="prev-portada"></div>
  </div>`;

  html += `<div class="form-sec"><h3>Dresscode</h3>
    <div class="f2">${fg('f-dresscode', 'Vestimenta', 'Elegante / Formal')}${fg('f-dresscode-nota', 'Aclaración (opcional)', social ? 'El color ROSA se reserva para la quinceañera' : 'Evitar el color blanco')}</div>
  </div>`;

  html += `<div class="form-sec"><h3>Regalo (opcional)</h3>
    ${fg('f-regalo-texto', 'Texto', 'Tu presencia es el mejor regalo. Pero si insistís...', 'ta')}
    <div class="f2">${fg('f-alias', 'Alias (MP / banco)', 'mi.alias')}${fg('f-alias-banco', 'Banco / plataforma', 'Mercado Pago')}</div>
    <div class="f2">${fg('f-alias-titular', 'Titular', 'Nombre Apellido')}${fg('f-cbu', 'CBU (opcional)', '')}</div>
  </div>`;

  html += `<div class="form-sec"><h3>Confirmación de asistencia</h3>
    ${fg('f-rsvp-limite', 'Tus invitados pueden confirmar hasta el', '', 'date')}
  </div>`;

  html += `<div class="form-sec"><h3>Música (opcional)</h3>
    ${fg('f-youtube', 'Canción de fondo — link de YouTube', 'https://youtu.be/...', null, 'Suena mientras miran tu invitación.')}
    ${social ? '' : fg('f-spotify', 'Playlist colaborativa de Spotify', 'https://open.spotify.com/playlist/...', null, 'Tus invitados pueden sumar canciones.')}
  </div>`;

  if (!social) {
    html += `<div class="form-sec"><h3>Textos</h3>
      ${fg('f-presentacion', 'Texto de presentación', 'Con inmensa alegría los invitamos a celebrar...', 'ta')}
    </div>`;
  } else {
    html += `<div class="form-sec"><h3>Frase emotiva</h3>
      ${fg('f-frase', 'Una frase que te represente', 'Hay momentos que no se pueden borrar...', 'ta')}
    </div>`;
    html += `<div class="form-sec"><h3>Trivia — ¿Cuánto me conocés? ✦</h3>
      <div class="hint" style="margin-bottom:12px">Respondé estas 5 preguntas (solo la respuesta correcta — nosotros armamos las opciones). Tocá ↻ para cambiar una pregunta.</div>
      <div id="trivia-wrap"></div>
    </div>`;
    html += `<div class="form-sec"><h3>Tus fotos — carruseles (opcional)</h3>
      <div class="hint" style="margin-bottom:10px">Elegí tus fotos favoritas: se muestran en dos carruseles dentro de la invitación.</div>
      <label style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--soft)">Carrusel 1</label>
      <div class="up-zone" style="margin:6px 0 4px" onclick="document.getElementById('file-c1').click()">🖼 Subir fotos</div>
      <input type="file" id="file-c1" accept="image/*" multiple style="display:none" onchange="subirMedia(this, 'carrusel1')">
      <div class="up-prev" id="prev-carrusel1"></div>
      <label style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--soft);display:block;margin-top:14px">Carrusel 2</label>
      <div class="up-zone" style="margin:6px 0 4px" onclick="document.getElementById('file-c2').click()">🖼 Subir fotos</div>
      <input type="file" id="file-c2" accept="image/*" multiple style="display:none" onchange="subirMedia(this, 'carrusel2')">
      <div class="up-prev" id="prev-carrusel2"></div>
    </div>`;
  }

  html += `<button class="btn" onclick="irResumen()">Continuar → Revisar y confirmar</button>`;
  document.getElementById('paso-2').innerHTML = html;
  if (social) initTrivia();
}

// ── TRIVIA ──────────────────────────────────────────────────────────────────
function initTrivia() {
  const pool = [...state.catalogo.trivia_pool].sort(() => Math.random() - 0.5);
  state.triviaSel = pool.slice(0, 5).map(p => ({ ...p, respuesta: '' }));
  state._triviaResto = pool.slice(5);
  renderTrivia();
}
function renderTrivia() {
  document.getElementById('trivia-wrap').innerHTML = state.triviaSel.map((p, i) => `
    <div class="trivia-row">
      <div class="tq"><span>${i + 1}. ${p.pregunta}</span><button title="Cambiar pregunta" onclick="rotarTrivia(${i})">↻</button></div>
      <input placeholder="Tu respuesta" value="${p.respuesta.replace(/"/g, '&quot;')}" oninput="state.triviaSel[${i}].respuesta = this.value">
    </div>`).join('');
}
function rotarTrivia(i) {
  if (!state._triviaResto.length) { toast('No quedan más preguntas para rotar'); return; }
  state._triviaResto.push(state.triviaSel[i]);
  state.triviaSel[i] = { ...state._triviaResto.shift(), respuesta: '' };
  renderTrivia();
}
function armarTriviaPreguntas() {
  return state.triviaSel.filter(p => p.respuesta.trim()).map(p => {
    const resp = p.respuesta.trim();
    const dist = p.distractores.filter(d => d.toLowerCase() !== resp.toLowerCase()).sort(() => Math.random() - 0.5).slice(0, 3);
    const opciones = [resp, ...dist].sort(() => Math.random() - 0.5);
    return { pregunta: p.pregunta, opciones, correcta: opciones.indexOf(resp), activa: true };
  });
}

// ── UPLOADS ─────────────────────────────────────────────────────────────────
async function subirMedia(input, tipo) {
  const files = [...input.files];
  if (!files.length) return;
  const zone = document.getElementById(tipo === 'portada' ? 'up-portada' : 'file-' + (tipo === 'carrusel1' ? 'c1' : 'c2')).previousElementSibling || document.getElementById('up-portada');
  for (const file of files) {
    const isVideo = file.type.startsWith('video/');
    if (file.size > (isVideo ? 50 : 15) * 1024 * 1024) { toast(`"${file.name}" supera el máximo (${isVideo ? 50 : 15} MB)`); continue; }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', tipo);
    toast('Subiendo ' + file.name + '…');
    try {
      const r = await fetch(WORKER + '/invite/' + state.slug + '/media', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error al subir');
      if (tipo === 'portada') {
        state.uploads.portada = { url: j.url, media_type: isVideo ? 'video' : 'image' };
        document.getElementById('up-portada').classList.add('ok');
        document.getElementById('up-portada').textContent = '✓ ' + file.name + ' — tocá para cambiar';
        document.getElementById('prev-portada').innerHTML = isVideo ? '' : `<img src="${j.url}">`;
      } else {
        state.uploads[tipo].push(j.url);
        document.getElementById('prev-' + tipo).innerHTML = state.uploads[tipo].map(u => `<img src="${u}">`).join('');
      }
    } catch (e) { toast('No se pudo subir ' + file.name + ': ' + e.message + '. Probá de nuevo.'); }
  }
  input.value = '';
}

// ── PASO 3: RESUMEN + GENERAR ───────────────────────────────────────────────
function v(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

function armarConfig() {
  const social = state.estiloElegido.modelo === 'social';
  const cfg = { ...state.estiloElegido.config };
  cfg.recepcion_hora = v('f-hora'); cfg.fin_fiesta_hora = v('f-hora-fin');
  cfg.lugar_nombre = v('f-lugar'); cfg.lugar_direccion = v('f-lugar-dir');
  cfg.lugar_maps = v('f-maps') || ((v('f-lugar') || v('f-lugar-dir')) ? 'https://maps.google.com/?q=' + encodeURIComponent([v('f-lugar'), v('f-lugar-dir')].filter(Boolean).join(', ')) : '');
  cfg.dresscode = v('f-dresscode'); cfg.dresscode_nota = v('f-dresscode-nota');
  cfg.regalo_texto = v('f-regalo-texto'); cfg.alias_mp = v('f-alias'); cfg.alias_banco = v('f-alias-banco');
  cfg.alias_titular = v('f-alias-titular'); cfg.cbu = v('f-cbu');
  cfg.rsvp_activo = true; cfg.rsvp_limite = v('f-rsvp-limite');
  cfg.youtube_audio = v('f-youtube');
  if (state.uploads.portada) { cfg.media_url = state.uploads.portada.url; cfg.media_type = state.uploads.portada.media_type; }
  if (social) {
    cfg.frase_emotiva = v('f-frase');
    cfg.trivia_preguntas = armarTriviaPreguntas();
    if (state.uploads.carrusel1.length) cfg.carousel_images_1 = state.uploads.carrusel1;
    if (state.uploads.carrusel2.length) cfg.carousel_images_2 = state.uploads.carrusel2;
  } else {
    cfg.presentacion = v('f-presentacion');
    cfg.spotify_url = v('f-spotify');
    if (state.estado.tipo === 'casamiento') {
      cfg.ceremonia_hora = v('f-cer-hora'); cfg.ceremonia_lugar = v('f-cer-lugar'); cfg.ceremonia_direccion = v('f-cer-dir');
    }
  }
  return cfg;
}

function irResumen() {
  if (!state.uploads.portada) { toast('Falta la foto o video de portada'); return; }
  if (!v('f-hora') || !v('f-lugar')) { toast('Completá al menos la hora y el lugar del evento'); return; }
  const cfg = armarConfig();
  const items = [
    ['Estilo', state.estiloElegido.nombre],
    ['Horario', cfg.recepcion_hora + (cfg.fin_fiesta_hora ? ' a ' + cfg.fin_fiesta_hora : '')],
    ['Lugar', [cfg.lugar_nombre, cfg.lugar_direccion].filter(Boolean).join(' — ')],
    ['Dresscode', [cfg.dresscode, cfg.dresscode_nota].filter(Boolean).join(' · ') || '—'],
    ['Portada', state.uploads.portada.media_type === 'video' ? 'Video subido ✓' : 'Foto subida ✓'],
    ['Regalo', cfg.alias_mp ? 'Alias: ' + cfg.alias_mp : '—'],
    ['Música', cfg.youtube_audio ? 'Sí ✓' : '—']
  ];
  if (state.estiloElegido.modelo === 'social') {
    items.push(['Trivia', cfg.trivia_preguntas.length + ' preguntas']);
    items.push(['Carruseles', (state.uploads.carrusel1.length + state.uploads.carrusel2.length) + ' fotos']);
  }
  document.getElementById('paso-3').innerHTML = `
    <div class="form-sec"><h3>Revisá antes de confirmar</h3>
      ${items.map(x => `<div class="resumen-item"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('')}
    </div>
    <div style="display:flex;gap:12px">
      <button class="btn btn-sec" onclick="irPaso(2)" style="flex:1">← Corregir algo</button>
      <button class="btn" id="btn-generar" onclick="generar()" style="flex:2">Generar mi invitación ✦</button>
    </div>
    <div class="hint" style="text-align:center;margin-top:12px">Después de confirmar no vas a poder editar desde acá — cualquier cambio, escribinos.</div>`;
  irPaso(3);
}

async function generar() {
  const btn = document.getElementById('btn-generar');
  btn.disabled = true; btn.textContent = 'Enviando…';
  try {
    const r = await fetch(WORKER + '/invite/' + state.slug + '/completar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estilo_id: state.estiloElegido.id, config: armarConfig() })
    });
    const j = await r.json();
    if (r.status === 409) { mostrarBloqueada(); document.getElementById('paso-3').style.display = 'none'; return; }
    if (!r.ok || !j.ok) throw new Error(j.error || 'Error al enviar');
    document.getElementById('paso-3').style.display = 'none';
    document.getElementById('steps').style.display = 'none';
    document.getElementById('titulo-h1').textContent = '';
    document.getElementById('sub-h1').textContent = '';
    const p = document.getElementById('pantalla-final');
    p.style.display = '';
    p.innerHTML = '<h2>✦</h2><p style="font-size:16px;line-height:1.9">' + state.catalogo.textos.final.replace('{nombre}', state.estado.nombre || '') + '</p>';
  } catch (e) {
    toast(e.message + ' — probá de nuevo');
    btn.disabled = false; btn.textContent = 'Generar mi invitación ✦';
  }
}
```

- [ ] **Step 2: Probar flujo completo en local contra worker prod** (resetear el flag del slug de prueba antes: re-put del KV sin `form_completado`):
  - Estilo social: form muestra trivia (5 preguntas, ↻ rota), carruseles, frase emotiva. Subir portada + 2 fotos de carrusel → previews aparecen.
  - Resumen correcto → Generar → pantalla final con nombre.
  - `curl -s "$BASE/invite/test-estilos-plan" | python -m json.tool` → config con estilo + datos + `trivia_preguntas` bien armadas (opciones incluyen la respuesta, `correcta` apunta a ella) + URLs de media.
  - Abrir `invite-social.html?i=test-estilos-plan` → la invitación se ve completa con el estilo elegido.
  - Recargar `estilos.html?i=test-estilos-plan` → pantalla bloqueada.
  - Repetir con un segundo slug de prueba y un estilo clásico (casamiento: aparece sección Ceremonia).

- [ ] **Step 3: Commit** — mensaje "estilos.html pasos 2 y 3: formulario del cliente, uploads, trivia y generacion"

---

### Task 8: Admin CORE — selector de presets, badge y link de estilos

**Files:**
- Modify: `e:\CLAUDE\CORE\src\admin.html`
- Modify: `e:\CLAUDE\CORE\brands\kuerre\config.json` (bump versión patch 1: `>V1.80<` → `>V1.81<`)

**Interfaces:**
- Consumes: `estilos-catalogo.json` vía URL derivada de `getInvBaseUrl()` (URL-agnóstico: en CRP el fetch da 404 y el selector queda oculto — cero impacto cross-brand). Funciones existentes: `setInvModelo`, `selectEnvColor`, `selectColorTema`, `invFormatoChange`, variables `_textStyles`, lista `getInvites()`.
- Produces: `applyEstiloPreset(id)`, `getEstilosUrl()`, `copyEstilosLink(invId)`, badge en `renderInvitesPage`.

- [ ] **Step 1: Agregar el bloque JS** (junto a las funciones de invitaciones, después de `setInvModelo`, ~línea 6507):

```js
// ── CATÁLOGO DE ESTILOS (estilos.html — solo marcas que lo tengan deployado) ──
let _estilosCatalogo = null;
function getEstilosBase() { return getInvBaseUrl().replace(/invite\.html.*$/, ''); }
async function loadEstilosCatalogo() {
  if (_estilosCatalogo !== null) return _estilosCatalogo;
  try {
    const r = await fetch(getEstilosBase() + 'estilos-catalogo.json?t=' + Date.now());
    _estilosCatalogo = r.ok ? await r.json() : false;
  } catch (e) { _estilosCatalogo = false; }
  const sel = document.getElementById('inv-estilo-preset');
  if (sel && _estilosCatalogo) {
    sel.innerHTML = '<option value="">— Elegir preset del catálogo —</option>' +
      _estilosCatalogo.estilos.map(e => `<option value="${e.id}">${e.nombre} (${e.modelo === 'social' ? 'Social ✦' : 'Clásico'})</option>`).join('');
    document.getElementById('inv-estilo-preset-wrap').style.display = '';
  }
  return _estilosCatalogo;
}
function applyEstiloPreset(id) {
  if (!id || !_estilosCatalogo) return;
  const estilo = _estilosCatalogo.estilos.find(x => x.id === id);
  if (!estilo) return;
  const c = estilo.config;
  setInvModelo(estilo.modelo);
  if (estilo.modelo === 'social') {
    if (c.color_tema) selectColorTema(c.color_tema);
    if (c.hero_emoji) document.getElementById('inv-hero-emoji').value = c.hero_emoji;
  } else {
    if (c.color_esquema) document.getElementById('inv-color-esquema').value = c.color_esquema;
    document.getElementById('inv-estilo-aero').checked = !!c.estilo_aero;
    if (c.formato) { document.getElementById('inv-formato').value = c.formato; invFormatoChange(); }
    if (c.wedding_fx) document.getElementById('inv-wedding-fx').value = c.wedding_fx;
    if (c.wedding_script) document.getElementById('inv-wedding-script').value = c.wedding_script;
    if (c.env_color) selectEnvColor(c.env_color);
    if (c.env_particulas) document.getElementById('inv-env-particulas').value = c.env_particulas;
    if (c.env_particulas_tam) {
      document.getElementById('inv-env-particulas-tam').value = c.env_particulas_tam;
      document.getElementById('inv-env-particulas-tam-val').textContent = c.env_particulas_tam;
    }
    if (c.text_styles) _textStyles = { ..._textStyles, ...c.text_styles };
  }
  toast('Estilo "' + estilo.nombre + '" aplicado — guardá para confirmar');
}
function copyEstilosLink(invId) {
  const inv = getInvites().find(i => i.id === invId);
  if (!inv) return;
  const nombre = toSlug(inv.config.novios || inv.config.titulo || 'invitacion');
  const fecha = toSlug(inv.config.fecha_display || inv.config.fecha_iso || '');
  const slug = nombre + (fecha ? '-' + fecha : '') + '-' + String(inv.id).slice(-4);
  navigator.clipboard.writeText(getEstilosBase() + 'estilos.html?i=' + slug);
  toast('Link de estilos copiado — mandáselo al cliente');
}
```

- [ ] **Step 2: Agregar el selector al modal** — en `src/admin.html`, después del bloque de botones CLÁSICO/SOCIAL (línea ~637, tras el `</div>` que cierra el flex de `inv-modelo-social`):

```html
            <div class="form-group" id="inv-estilo-preset-wrap" style="display:none;margin-bottom:24px">
              <label class="form-label">Estilo del catálogo ✦ <i class="tip" data-tip="Aplica un preset del catálogo de estilos (estilos.html). Solo pisa el diseño — los datos del evento quedan intactos.">?</i></label>
              <select class="form-input" id="inv-estilo-preset" onchange="applyEstiloPreset(this.value)"></select>
            </div>
```

Y en `openInviteModal` (línea ~6760, primera línea del cuerpo): agregar `loadEstilosCatalogo();`

- [ ] **Step 3: Badge + botón en la lista** — en `renderInvitesPage` (línea ~6739), reemplazar:

```js
    return `<div class="inv-card">
      <div>
        <div class="inv-card-badge">${tipos[inv.tipo] || 'Evento'}</div>
```

por:

```js
    const estiloNombre = inv.config.estilo_elegido && _estilosCatalogo
      ? ((_estilosCatalogo.estilos.find(x => x.id === inv.config.estilo_elegido) || {}).nombre || inv.config.estilo_elegido)
      : inv.config.estilo_elegido;
    return `<div class="inv-card">
      <div>
        <div class="inv-card-badge">${tipos[inv.tipo] || 'Evento'}</div>
        ${inv.config.form_completado ? `<div class="inv-card-badge" style="background:rgba(14,159,78,0.15);color:var(--green)">✦ Cliente completó${estiloNombre ? ' — ' + estiloNombre : ''}</div>` : ''}
```

y agregar el botón en `inv-card-actions` (después del botón "Copiar URL", línea ~6747):

```html
          <button class="btn-sm" onclick="copyEstilosLink('${inv.id}')" title="Link del catálogo de estilos para que el cliente elija y complete sus datos">Link estilos ✦</button>
```

y al inicio de `renderInvitesPage` (línea ~6664) agregar: `loadEstilosCatalogo().then(c => { if (c) renderInvitesPageBadges && 0; });` → **simplificar**: llamar `loadEstilosCatalogo()` y en su `.then` re-renderizar una sola vez si hay invitaciones con `estilo_elegido` sin nombre resuelto:

```js
  loadEstilosCatalogo().then(c => { if (c && !window._estilosRerender) { window._estilosRerender = true; renderInvitesPage(); window._estilosRerender = false; } });
```

(guard `_estilosRerender` evita loop: el segundo render encuentra `_estilosCatalogo` cacheado y no vuelve a entrar al `.then` asíncrono con re-render).

- [ ] **Step 4: Bump versión kuerre** — en `CORE\brands\kuerre\config.json` patch 1: `">V1.80<"` → `">V1.81<"`.

- [ ] **Step 5: Build y verificar**

```bash
cd "/e/CLAUDE/CORE" && node build-admin.cjs kuerre
```
Expected: `✅ kuerre built (2 files, target: ...)`. Verificar symlink `node_modules/@crd` si aplica (memoria kuerre-core). Abrir `WEB KUERRE\Desarrollo\admin.html` en browser: login → Invitaciones → botón "Link estilos ✦" en cards, selector de preset visible en el modal (con Desarrollo servido junto a estilos-catalogo.json vía server local), elegir preset "Noir" → paleta/negro/sobre aplicados en el form; badge verde en una invitación con `form_completado` (usar la de prueba).

- [ ] **Step 6: Commits**

- Repo `e:\CLAUDE\CORE`: `git add src/admin.html brands/kuerre/config.json` + mensaje "Admin: selector de presets del catalogo de estilos, badge cliente completo y link estilos (V1.81 kuerre)"
- Repo `e:\CLAUDE\WEB KUERRE`: `git add Desarrollo/admin.html` + mensaje "Build admin kuerre V1.81 con selector de estilos"

---

### Task 9: Deploy + verificación end-to-end

**Files:**
- Copy: `Desarrollo\estilos.html`, `estilos-catalogo.json`, `estilos-demo\*`, `invite.html`, `invite-social.html`, `admin.html` → `Productivo\`
- Deploy: worker (ya deployado en Tasks 3-4), gh-pages

- [ ] **Step 1: Copiar a Productivo**

```powershell
Copy-Item "e:\CLAUDE\WEB KUERRE\Desarrollo\estilos.html","e:\CLAUDE\WEB KUERRE\Desarrollo\estilos-catalogo.json","e:\CLAUDE\WEB KUERRE\Desarrollo\invite.html","e:\CLAUDE\WEB KUERRE\Desarrollo\invite-social.html","e:\CLAUDE\WEB KUERRE\Desarrollo\admin.html" "e:\CLAUDE\WEB KUERRE\Productivo\" -Force
Copy-Item "e:\CLAUDE\WEB KUERRE\Desarrollo\estilos-demo" "e:\CLAUDE\WEB KUERRE\Productivo\" -Recurse -Force
```
(Nota: verificar antes si `Productivo\admin.html` se genera por build — `brands/kuerre/config.json` outputs ya escriben ambos; en ese caso no copiar admin.html a mano.)

- [ ] **Step 2: Commit + push main + sync gh-pages** (flujo estándar kuerre: "subilo" = Productivo + main + worktree gh-pages)

```bash
cd "/e/CLAUDE/WEB KUERRE"
git add Productivo
git commit -F <mensaje: "Deploy: catalogo de estilos para clientes (estilos.html V1.00) + admin V1.81">
git push origin main
# sync gh-pages worktree (.worktrees/gh-pages):
cd .worktrees/gh-pages && git checkout gh-pages
cp ../../Productivo/estilos.html ../../Productivo/estilos-catalogo.json ../../Productivo/invite.html ../../Productivo/invite-social.html .
cp -r ../../Productivo/estilos-demo .
git add . && git commit -F <mensaje: "Deploy estilos.html + catalogo + demos + decode UTF-8 invites"> && git push origin gh-pages
```

- [ ] **Step 3: Verificación E2E en producción** (usar skill superpowers:verification-before-completion)

1. `https://kuerre.com.ar/estilos.html` → catálogo público, 20 demos vivas, CTA WhatsApp.
2. Crear invitación de prueba real desde el admin (o usar slug de prueba reseteado) → botón "Link estilos ✦" → abrir el link → flujo completo: elegir social "Lavanda" → form + portada + trivia + carrusel → generar → pantalla final.
3. Admin: badge "✦ Cliente completó — Lavanda", abrir modal → datos del cliente cargados, cambiar preset a "Mauve" → guardar → `invite-social.html?i={slug}` muestra tema mauve con los datos intactos.
4. Reabrir link de estilos → bloqueado.
5. Verificar en Drive: portada en carpeta Invitación del cliente, fotos en Carrusel 1 (si la invitación vino de una solicitud vinculada).
6. Limpiar: borrar invitaciones de prueba desde el admin y las keys KV `invite_cfg_test-estilos-plan*` (`npx wrangler kv key delete`).

- [ ] **Step 4: Actualizar memoria** — actualizar `project_kuerre_web.md` / `project_invite_sistema.md` con el sistema de estilos (página, endpoints, catálogo compartido, V1.81 admin).

---

## Self-Review (hecho al escribir el plan)

- **Spec coverage:** catálogo 20 estilos ✓ (T1), demos stock ✓ (T2), demos vivas iframe ✓ (T6), wizard form ✓ (T7), trivia pool+random+rotar ✓ (T1/T7), uploads R2+Drive por carpeta ✓ (T4), merge directo + bloqueo + 409 ✓ (T3/T7), admin selector+badge+link ✓ (T8), catálogo compartido single-source ✓ (T1/T8), pantalla final personalizada ✓ (T1/T7), deploy gh-pages ✓ (T9).
- **Desvíos del spec (justificados):** fotos stock en repo gh-pages en vez de R2 (más simple: CDN de Pages, versionadas con el catálogo, sin ruta nueva de worker). Fix UTF-8 de `?c=` agregado (T5) — necesario para emojis en demos, retrocompatible. Form no edita nombres/fecha (el admin deriva el slug de esos campos — cambiarlos rompería los links); el worker además los descarta.
- **Type consistency:** nombres de campos de config verificados contra `readInviteForm` (admin), `parseConfig`/render (invite.html, invite-social.html) y worker (`invite_cfg_`, `crd_invites` entries con `{id, tipo, config, slug}`). `trivia_preguntas: [{pregunta, opciones, correcta, activa}]` ✓. `carousel_images_1/2` ✓. `text_styles: {id: {font, size, weight, fx}}` ✓.
