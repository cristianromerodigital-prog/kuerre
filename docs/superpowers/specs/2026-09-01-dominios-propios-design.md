# KUERRE — Dominios propios (marca blanca de dominio)

## Contexto

Hoy las 5 piezas del cliente (`invite.html`, `invite-social.html`, `fiestas.html`,
`entrega.html`, `premiere.html`) son HTML estático servido por GitHub Pages bajo
`kuerre.com.ar`, que llama a `kuerre-worker` con URL absoluta y CORS `*`. La marca ya se
resuelve dinámicamente vía `/brand?scope=&id=` ([[project-kuerre-marca-blanca]]), pero
siempre bajo el dominio de Kuerre. Este spec agrega la posibilidad de que un **estudio**
(partner de marca blanca) o un **cliente final** (una pareja/evento puntual) cuelguen esas
piezas de su propio dominio.

Casos a cubrir:
- **Partner (estudio):** `eventos.suestudio.com` sirve las piezas de *todos* sus clientes,
  más su panel (`estudio.html`), catálogo de estilos y formulario de alta.
- **Cliente final:** `micaelayjuan.com` sirve las 3 piezas de *un solo* evento, sin slug en
  la URL — el dominio identifica directamente el evento.

## Arquitectura

### 1. Enrutamiento del dominio — Cloudflare for SaaS

El estudio/cliente crea `CNAME <su-hostname> → apps.kuerre.com.ar` (fallback origin nuevo,
en la zona `kuerre.com.ar`). Cada hostname se registra como **Custom Hostname** vía API de
Cloudflare; CF emite el SSL y enruta el tráfico a `kuerre-worker` conservando el `Host`
original.

`kuerre.com.ar` sigue serviéndose por GitHub Pages sin cambios — solo los dominios de
terceros terminan en el worker.

**Verificar antes de implementar:** límites y costo real de Cloudflare for SaaS (custom
hostnames) en la cuenta actual — no asumido en este spec, se chequea al armar el plan.

### 2. El worker pasa a servir páginas para dominios registrados

`kuerre-worker` importa `invite.html`, `invite-social.html`, `fiestas.html`, `entrega.html`,
`premiere.html`, `estudio.html`, `estilos.html`, `formulario.html` como Text module (mismo
patrón que ya usa `admin.html`). Nueva rama en el fetch handler: si el `Host` entrante está
en la tabla `custom_domains`, sirve el HTML correspondiente — byte-idéntico al de GitHub
Pages salvo la inyección de meta tags descrita en la sección 4.

**Tabla `custom_domains` (D1, `kuerre-db`):**

```
hostname    TEXT PRIMARY KEY
tipo        TEXT   -- 'partner' | 'client'
partner_id  TEXT   -- fila de `partners` (siempre, también para 'client': el estudio dueño)
solicitud_id TEXT  -- solo para tipo='client', fija el evento
activo      INTEGER DEFAULT 1
created_at  TEXT
```

**Contrato de rutas:**

| Tipo | Ruta | Sirve |
|---|---|---|
| partner | `/invite/{slug}` | invite.html o invite-social.html (según `modelo`) |
| partner | `/fiesta/{slug}` | fiestas.html |
| partner | `/entrega/{slug}` | entrega.html o premiere.html (según config del cliente) |
| partner | `/panel` | estudio.html |
| partner | `/estilos`, `/estilos/{slug}` | estilos.html |
| partner | `/formulario` | formulario.html |
| client | `/` | invite.html o invite-social.html |
| client | `/fiesta` | fiestas.html |
| client | `/entrega` | entrega.html o premiere.html |

Host no encontrado en `custom_domains` (CNAME mal apuntado o falta el insert) → 404
amigable, no error JSON crudo.

### 3. Bootstrap sin tocar la lógica de cada página

Se agrega `GET /site-context`, Host-aware: resuelve `Host` + path contra `custom_domains`,
sube a `partners`/`solicitudes` y devuelve los ids que cada página necesita — incluyendo
**qué plantilla corresponde** (`modelo: 'social'|'clasico'`, `entrega_modo:
'entrega'|'premiere'`), para que el worker no tenga que adivinar qué archivo servir.

Cada una de las 5 páginas gana un fallback mínimo en su boot: *si no vino `?i=` / `EVENT_ID`
/ `?folder=` en la URL, pedir `/site-context` antes de rendirse*. El fetch es same-origin
bajo el dominio custom, así que hereda el `Host` real sin configuración adicional. Patch
acotado en los 5 archivos (respeta la convención de JS inline duplicado del repo — no se
crea un helper compartido).

`/brand` gana la misma Host-awareness: si el `Host` es un partner registrado, la marca se
fuerza a ese partner sin necesitar `?partner=` — y esto aplica a piezas **reales**, no solo
demo (hoy `&partner=` está limitado a los ids de demo a propósito, ver
[[project-kuerre-marca-blanca]]).

### 4. Preview social (OG tags) inyectadas al servir

El worker deja de ser 100% pasivo al servir HTML bajo dominio custom: usando los datos ya
resueltos por `/site-context` (nombre del evento/pareja, fecha, foto de portada si existe),
inyecta `<meta property="og:title">`, `og:description` y `og:image` antes de devolver el
HTML. Acotado a esas 2-3 tags — el resto del documento se sirve intacto. Sin esto, compartir
un dominio vanity por WhatsApp/Instagram mostraría una preview genérica, justo en el
escenario donde más se comparte.

### 5. Alta y baja de dominio — manual (v1)

Sin UI de admin nueva. Un script (mismo patrón que la migración de contratos ya
documentada en [[project-kuerre-web]]) que:
- **Alta:** crea el Custom Hostname vía API de Cloudflare + inserta la fila en
  `custom_domains`.
- **Baja:** pone `activo=0` (o borra la fila) + elimina el Custom Hostname en Cloudflare.
  Necesario porque los dominios de cliente final (una boda puntual) no se renuevan — sin
  baja explícita se acumulan hostnames muertos indefinidamente. Cristian decide cuándo dar
  de baja, igual que decide el alta; no hay expiración automática.

Si el volumen de estudios crece, una fase 2 podría exponer el alta/baja en `estudio.html`
como autoservicio. No en este spec — YAGNI.

## Testing

- Verificación manual end-to-end por dominio registrado: `curl -H "Host: <dominio>"`, luego
  visita real una vez propague DNS — confirmar SSL, cada ruta del contrato, y que `/brand`
  resuelve al partner correcto sin `?partner=`.
- Confirmar que las rutas nuevas (`/invite/`, `/fiesta/`, `/entrega/`, `/panel`, etc.) no
  colisionan con las rutas de API existentes del worker — la rama Host-based se evalúa antes
  del resto del router, así que no debería haber colisión, pero se verifica con un caso de
  cada tipo.
- Caso de baja: desactivar un `custom_domains` y confirmar 404 amigable en vez de servir
  contenido stale.

## Gotchas para el plan de implementación

- **Sync worker↔páginas:** el worker sirve copias Text-importadas de los HTML. Cualquier
  deploy de página (invite/fiestas/entrega/premiere/estudio/estilos/formulario) tiene que
  re-deployar el worker también — igual que ya pasa con `admin.html`. Sumarlo al flujo de
  deploy documentado en [[project-kuerre-web]].
- `www.` y el apex son hostnames distintos para Cloudflare for SaaS — si un partner/cliente
  quiere ambos, son dos altas separadas.
