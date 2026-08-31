# Marca blanca — reventa del combo por estudios externos

Fecha: 2026-08-29
Estado: diseño aprobado, pendiente plan de implementación

## Problema

Un estudio externo quiere revender el Combo Digital Premium (Invitación + QR Fiestas +
Entrega) como si fuera propio. Hoy la marca del sistema es global y única: `crd_settings` y
`crd_site_logo` en KV alimentan `/site/config`, todas las páginas públicas leen ese mismo
config, y además hay ~16 apariciones de "KUERRE" y 3 del WhatsApp de Cristian escritas
directamente en el HTML. No existe noción de dueño: un solo usuario/password de admin y
ninguna tabla con columna de tenant.

## Alcance

**Incluye:** logo, nombre de marca, slogan, WhatsApp, Instagram y web por evento, en las 4
páginas públicas de Kuerre.

**No incluye:**
- Colores, tipografías ni estilos de invitación por partner (siguen siendo los de Kuerre).
- Dominio propio del partner: los links siguen siendo `kuerre.com.ar/...`.
- Login del estudio: Cristian sigue siendo el único operador (ver Fase 2).
- Agregar botones de contacto donde hoy no existen — cada pieza conserva los que ya tiene.
- WEB CRP: las páginas públicas no son compartidas entre marcas, CRP no se toca.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Modelo operativo | Cristian opera, marca por evento | El estudio vende, no administra. Menos superficie, entrega valor ya |
| Preparación futura | Modelo de datos multi-tenant-ready | `partner_id` ya es la clave de tenant: la Fase 2 agrega auth, no migra datos |
| Dominio | Sigue `kuerre.com.ar` | Evita custom domains por partner y asistencia DNS a cada estudio |
| Personalización | Logo + nombre + slogan + WhatsApp + IG + web | El diseño de las piezas es el diferencial de Kuerre, no se cede |
| Cobertura de botones | Cada pieza como está hoy | No tocar diseños que ya funcionan |

## Modelo de datos

```sql
CREATE TABLE IF NOT EXISTS partners (
  id         TEXT PRIMARY KEY,          -- generado server-side (crypto.randomUUID)
  slug       TEXT NOT NULL UNIQUE,
  nombre     TEXT NOT NULL,
  slogan     TEXT DEFAULT '',           -- ej. "Fotografía & Video de Eventos"
  logo_key   TEXT DEFAULT '',           -- key en R2: partners/{id}/logo.{ext}
  whatsapp   TEXT DEFAULT '',
  instagram  TEXT DEFAULT '',
  web        TEXT DEFAULT '',
  activo     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE solicitudes ADD COLUMN partner_id TEXT NOT NULL DEFAULT 'kuerre';
```

**Kuerre es un partner más**: fila sembrada con `id='kuerre'`, `slug='kuerre'`, poblada desde
el `crd_settings` + `crd_site_logo` actuales. Así ninguna página tiene rama de marca: siempre
resuelve un partner, a veces es el propio. La Configuración actual sigue existiendo y es la
que edita esa fila.

**Por qué `partner_id` va en `solicitudes` y no en el hub `eventos`:** `solicitudes` es el
registro de cliente del que ya cuelgan las 3 piezas (`invite_slug`, `fiesta_id`, y la entrega
por `entrega_configs.id = solicitudes.id`), existe siempre, y permite resolver cualquiera de
las 3 en una sola query. `eventos.evento_id` es NULL en las filas viejas.

**Restricción conocida:** una pieza creada suelta, fuera del modal de cliente, no tiene
partner y cae en Kuerre. El flujo actual siempre arranca del cliente, así que en la práctica
no aparece; si en el futuro molesta, se resuelve agregando `partner_id` a `eventos_foto` y
`entrega_configs` con precedencia sobre el del cliente.

**Logo en R2** (`partners/{id}/logo.{ext}`), no data-URI en KV como el logo actual. Se sirve
por `/api/partners/{slug}/logo` con `Cache-Control: public, max-age=86400`.

## Resolución de marca (worker)

Un único endpoint público, sin auth, que devuelve solo campos públicos:

```
GET /brand?scope=invite|fiesta|entrega&id=<slug|fiestaId|folderId>
→ { nombre, slogan, logo_url, whatsapp, instagram, web }
```

| scope | resolución |
|---|---|
| `invite` | `SELECT partner_id FROM solicitudes WHERE invite_slug = ?` |
| `fiesta` | `SELECT partner_id FROM solicitudes WHERE fiesta_id = ?` |
| `entrega` | `entrega_configs WHERE folder_id = ?` → `solicitudes.id` → `partner_id` |

Sin match, partner inactivo o partner inexistente → se devuelve el partner `kuerre`. Nunca
devuelve 404: una página pública siempre tiene marca que mostrar.

El endpoint vive en `WEB KUERRE/worker/src/index.js` (feature exclusiva de Kuerre, no del
CORE compartido).

### Seguridad

- No hay endpoint público que liste partners ni que exponga campos internos. El ABM completo
  va detrás del JWT de admin.
- El `id` del partner se genera server-side (`crypto.randomUUID()`), nunca se acepta del
  cliente, y no se usa `INSERT OR REPLACE`.
- El upload de logo se valida contra un allowlist de mime (`image/png`, `image/jpeg`,
  `image/webp`, `image/svg+xml`), sin confiar en el `Content-Type` del browser, y se sirve con
  `X-Content-Type-Options: nosniff`.
- `PATCH /solicitudes/{id}/partner` verifica que el `partner_id` recibido exista y esté activo
  antes de escribir.

## Admin

Sección nueva **Marcas** en el sidebar (debajo de Configuración), en `CORE/src/admin.html`,
detrás de un flag `modules.partners` en `CORE_OPTIONS` — `true` en el worker de Kuerre,
`false` en CRP.

- ABM: nombre, slogan, logo (upload), WhatsApp, Instagram, web, activo.
- La fila `kuerre` se muestra pero no se puede borrar.

En el modal de cliente, selector en el header:

```
Juan & Sofía · Contrato #142        Marca: [ Kuerre ▾ ]
```

Guarda con `PATCH /solicitudes/{id}/partner`. Es el único cambio en el flujo diario de
Cristian: un clic por cliente, y solo cuando el cliente es de un revendedor.

Cambiar la marca después afecta las 3 piezas al instante; los links ya repartidos siguen
sirviendo y no hay que regenerar nada.

## Páginas públicas

Archivos afectados (todos en `WEB KUERRE/Productivo/`, con su espejo en `Desarrollo/`):
`invite.html`, `invite-social.html`, `fiestas.html`, `entrega.html`, `premiere.html`.

En cada una:

1. Marcar los nodos de marca con `data-brand="nombre|slogan|logo|web|ig|wa"` en lugar del
   texto "KUERRE" hardcodeado.
2. Una función `applyBranding(brand)` común que consume `/brand` y completa esos nodos. Cada
   botón se oculta si el partner no cargó ese dato.
3. Reemplaza a las lecturas sueltas que hoy hace cada página por su cuenta
   (`/site/config` en fiestas, `crd_settings` directo en invite/entrega/premiere).

### Slots de slogan

Ya existen en el HTML, no hay que inventar lugar nuevo:

| Página | Slot | Contenido hardcodeado hoy |
|---|---|---|
| Entrega | `.footer-tagline` (`entrega.html:374`) | "Fotografía & Video de Eventos" |
| Entrega | `#hero-brand` (`entrega.html:251`) | "KUERRE · Fotografía" — pasa a `nombre · slogan` |
| Premiere | `.footer-tagline` (`premiere.html:460`) | "Fotografía & Video de Eventos · Buenos Aires" |
| QR Fiestas | 2da línea de `#tv-brand` (`fiestas.html:248`) | quedó duplicada como "KUERRE" por el rename CRD→KUERRE; ese era el descriptor |

La invitación no tiene slot de slogan y no se le agrega (su footer es una sola línea).
Si el partner no cargó slogan, el nodo se oculta y el `hero-brand` de entrega muestra solo el
nombre.

### Fallbacks hardcodeados a eliminar

Son la parte crítica: si quedan, un cliente de un revendedor termina escribiéndole a Cristian.

- `premiere.html:449` y `:461` — `wa.me/5491162557763` escrito en el HTML.
- `premiere.html:584` — `CONFIG.WSP_NUM`.
- `entrega.html:365` — botón de pedido de álbum con el número **y el nombre** de Cristian en
  el texto del mensaje ("Hola Cristian, quiero consultar sobre mi pedido de álbum"). El texto
  pasa a usar el nombre del partner.
- `entrega.html:406` — `CONFIG.WSP_NUM`.

Sin fallback: si el partner no tiene WhatsApp, el botón no se muestra.

### Colateral

`fiestas.html:283` tiene el link roto `https://cristianromeroKUERRE.com.ar` (artefacto del
rename CRD→KUERRE). Queda arreglado al volverse dinámico.

## Cobertura por pieza (lo que ve el invitado)

| Pieza | Elementos que cambian de marca |
|---|---|
| Invitación (clásica y social) | logo del footer, nombre, link web, link IG |
| QR Fiestas | logo en TV, logo flotante, nombre en hero y overlays, slogan en TV, link IG, link web |
| Entrega | title, hero (nombre · slogan), footer, slogan, logo, IG, web, WhatsApp (flotante + footer + pedido de álbum) |
| Premiere | title, nav, hero, footer, slogan, welcome, logo, web, WhatsApp (flotante + footer) |

Se mantiene la cobertura actual de cada pieza: no se agregan botones donde hoy no los hay
(invitación y QR siguen sin WhatsApp, Premiere sigue sin Instagram).

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| `/brand` falla o tarda | La página renderiza con la marca Kuerre por defecto, sin bloquear el contenido |
| Partner sin logo | Cae al logo de Kuerre en vez de dejar un hueco |
| Partner sin WhatsApp/IG/web | Ese botón no se renderiza |
| Partner sin slogan | El slot se oculta; `hero-brand` muestra solo el nombre, sin el `·` |
| Partner desactivado | Se resuelve como Kuerre |
| Slug/folder sin match | Se resuelve como Kuerre |

## Verificación

1. Migración aplicada: `partners` existe con la fila `kuerre` poblada desde `crd_settings`, y
   todas las filas de `solicitudes` tienen `partner_id = 'kuerre'`.
2. Regresión: un cliente sin tocar el selector muestra las 4 páginas exactamente igual que
   antes del cambio (comparar contra capturas previas).
3. Alta de un partner de prueba, asignado a un cliente de prueba: las 3 piezas muestran su
   logo, nombre, slogan y links.
   Repetir con un partner sin slogan: los slots se ocultan sin dejar huecos ni separadores
   colgando (`·` suelto en el `hero-brand` de entrega).
4. `grep -rn "5491162557763\|KUERRE" Productivo/{invite,invite-social,fiestas,entrega,premiere}.html`
   no devuelve texto de marca visible al invitado.
5. `/brand` con un slug inexistente devuelve la marca Kuerre, no un error.
6. El admin de CRP, rebuildeado con `build-admin.cjs all`, no muestra la sección Marcas.

## Fase 2 (fuera de alcance, para no cerrarse puertas)

El día que un estudio deba operar su propio panel:

- `partner_id` ya es la clave de tenant: `WHERE partner_id = ?` en cada query, sin migrar
  datos.
- Falta agregar: tabla de usuarios con `partner_id` y rol, login por usuario (hoy es un solo
  usuario/password global), y filtrado por partner en cada endpoint del admin.
- Recién ahí aplica la regla de aislamiento multi-tenant: owner explícito en el WHERE de todo
  SELECT/UPDATE/DELETE.
