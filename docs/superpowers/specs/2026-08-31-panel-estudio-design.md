# Panel del estudio — acceso propio de cada marca revendedora

Fecha: 2026-08-31
Estado: diseño aprobado, pendiente plan de implementación

Continúa `2026-08-29-marca-blanca-partners-design.md`, que dejó anotada esta fase como
"Fase 2" y preparó el modelo de datos para ella.

## Problema

Hoy un estudio revendedor no tiene forma de ver en qué estado están sus eventos: le tiene
que preguntar a Cristian por WhatsApp si la invitación de un cliente ya está lista, o pedirle
que le reenvíe un link. Todo el estado del sistema vive en un admin al que solo entra él.

## Alcance

**Incluye:** un acceso con usuario y contraseña por marca, y un panel de **solo lectura**
donde el estudio ve sus clientes asignados, el estado de las tres piezas de cada uno y los
links para copiar.

**No incluye:**
- Crear o editar nada: ni clientes, ni invitaciones, ni QR, ni entregas. Todo eso lo sigue
  haciendo Cristian desde su admin.
- Contratos, precios, márgenes ni ningún dato comercial.
- Varios usuarios por estudio (ver "Lo que este diseño deja abierto").
- Cualquier cambio en el admin de WEB CRP: la feature es exclusiva de Kuerre.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Permisos | Solo lectura | Es lo que el estudio necesita para trabajar, y evita el problema de que las piezas viven en KV con claves globales sin dueño |
| Credenciales | Usuario y clave en la ficha de la marca | El ABM ya existe (sección Marcas): alta, baja y modificación salen gratis |
| Dónde vive el panel | Página nueva `estudio.html` | Esconder secciones del admin no es seguridad: sigue siendo la misma página con acceso a todos los endpoints |
| Datos visibles | Evento, contacto del cliente, estados y links | El estudio atiende a esa persona; lo comercial de Kuerre no le corresponde |
| Almacenamiento de la clave | Hash PBKDF2 con salt por marca | Hoy `admin_creds` guarda la contraseña en texto plano en KV; no se repite ese patrón |

## Modelo de datos

Tres columnas nuevas en `partners`, ninguna tabla nueva:

```sql
ALTER TABLE partners ADD COLUMN usuario     TEXT DEFAULT '';
ALTER TABLE partners ADD COLUMN pass_hash   TEXT DEFAULT '';
ALTER TABLE partners ADD COLUMN login_fails TEXT DEFAULT '';
```

- `usuario`: único entre marcas activas. Se valida al guardar, no con un índice UNIQUE, porque
  las marcas sin acceso configurado tienen `usuario = ''` y varias filas vacías son válidas.
- `pass_hash`: el formato es `pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>`, todo en una columna.
  El salt es distinto por marca. Nunca se guarda la contraseña.
- `login_fails`: `<intentos>|<timestamp_del_ultimo_fallo>`. Se usa para el bloqueo por
  intentos; se limpia en cada login exitoso.

La clave de dueño sigue siendo `solicitudes.partner_id`, que ya existe y ya está poblada.
No hay migración de datos: las marcas actuales quedan con los campos vacíos, o sea sin acceso,
hasta que Cristian les cargue uno.

## Autenticación

### `POST /partner/login`

Body `{ usuario, pass }`. Devuelve `{ token, marca: { nombre, logo_url } }` o un error.

- Busca la marca por `usuario` **y** `activo = 1`. Una marca desactivada no entra: el switch
  "Marca activa" que ya existe pasa a controlar también el acceso, sin perder el historial ni
  desasignar clientes.
- Deriva el hash de la contraseña recibida con el salt de esa fila y lo compara con
  `pass_hash` byte a byte en tiempo constante.
- El error es el mismo para usuario inexistente, contraseña incorrecta y marca desactivada:
  "Usuario o contraseña incorrectos". No se le dice a un atacante cuál de las tres falló.
- Emite un JWT con `{ role: 'partner', pid: <partner_id>, exp: ahora + 8h }`, firmado con el
  mismo `ADMIN_JWT_SECRET` que ya usa el admin (`signJWT` de `@crd/kuerre-core`).

### Bloqueo por intentos

A los **8 intentos fallidos** la cuenta queda bloqueada **15 minutos**. El contador se
incrementa con una sola sentencia SQL (`UPDATE ... SET login_fails = ...` calculado en la misma
sentencia), no con un leer-y-después-escribir, para que mandar muchos intentos en paralelo no
lo esquive. Un login exitoso lo limpia.

### `isPartner(request, env)`

Helper nuevo, espejo del `isAdmin` que ya existe: verifica el JWT y devuelve el `pid` si el rol
es `partner`, o `null`. Vive en el worker de Kuerre, no en CORE — la feature no es compartida.

**La regla central del diseño:** el `partner_id` sale **siempre del token**. Ningún endpoint de
partner acepta un id de marca por parámetro ni por body. Un estudio no puede pedir los datos de
otro porque no hay forma de nombrarlo.

## Endpoints

### `GET /partner/clientes`

Requiere JWT de partner. Reusa el mismo JOIN que ya alimenta la sección Clientes del admin
(`solicitudes` + `eventos` + `eventos_foto` + `entrega_configs`), con `WHERE s.partner_id = ?`
tomado del token.

Devuelve, **campo por campo** (no `SELECT s.*`):

```
evento     nombre, tipo, fecha, salon
contacto   cliente_nombre, cliente_tel, cliente_email
estados    invitacion: 'lista' | 'pendiente'
           fiesta:     'activa' | 'pendiente'
           entrega:    'lista'  | 'pendiente'
links      invitacion, fiesta, entrega   (URLs completas, o '' si la pieza no existe)
```

El admin hace `SELECT s.*` y se trae todo. Acá la lista es explícita a propósito: el día que se
agregue una columna a `solicitudes` —una nota interna, un margen— no se filtra sola al panel.

Los links los arma el worker con la misma lógica de slugs que ya usa `resolvePartnerId`, no la
página: no quiero una segunda copia de esa lógica que se desincronice.

### `GET /partner/me`

Requiere JWT de partner. Devuelve `{ nombre, slogan, logo_url }` de la propia marca, para que el
panel muestre su identidad. Es el mismo objeto público que ya devuelve `partnerPublic`.

## Admin

Dos campos nuevos en el modal de marca de la sección **Marcas**, debajo de los switches:

```
Usuario de acceso   [ kanaudt ]
Contraseña          [ ········ ]   ✓ Acceso configurado
```

- Al **editar**, el campo de contraseña aparece **vacío**, no con la clave actual: no se puede
  mostrar porque solo se guarda el hash. Vacío significa "dejala como está"; con contenido, la
  reemplaza.
- Al lado, un indicador de si esa marca ya tiene acceso configurado o todavía no.
- Si el usuario elegido ya lo tiene otra marca, el guardado falla con un mensaje claro.
- Todo esto va detrás de `data-module="partners"`, como el resto de la sección, y los patches de
  `brands/crp/config.json` que eliminan el bloque en CRP hay que reanclarlos (ya pasó dos veces:
  matchean texto exacto).

## La página `estudio.html`

Nueva, en `WEB KUERRE/Desarrollo/`, con el mismo criterio del resto del sitio: HTML con CSS y JS
inline, sin build.

**Pantalla de login:** usuario, contraseña, y el error genérico. Nada más.

**Panel:** arriba el logo y el nombre del propio estudio —entra y ve su marca, no la de Kuerre—
y un botón de salir. Debajo, la lista de sus clientes con buscador por nombre. Cada fila:

```
XV de Delfina                          15/03/2027 · Salón Los Robles
Delfina Pérez · 11 5555 4444 · delfi@mail.com
[ Invitación lista ]  [ QR pendiente ]  [ Entrega lista ]
Copiar: invitación · QR · entrega
```

Los estados son los mismos chips de color que ya usa el admin. La sesión se guarda en su propia
clave de localStorage, separada de la del admin, y expira a las 8 horas.

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Usuario, clave o marca desactivada incorrectos | Mismo mensaje genérico, sin distinguir cuál falló |
| 8 fallos seguidos | Bloqueo de 15 minutos con mensaje explícito de cuánto falta |
| Token vencido o inválido | Vuelve al login con "Tu sesión expiró" |
| Marca sin clientes asignados | Estado vacío explicando que todavía no tiene eventos, no una tabla en blanco |
| Cliente sin alguna pieza creada | El chip queda en "pendiente" y el botón de copiar de esa pieza no se muestra |
| El worker no responde | Mensaje de error con botón de reintentar; nunca una pantalla en blanco |

## Verificación

1. Una marca con acceso configurado entra; la misma marca desactivada no entra.
2. Dos marcas distintas, cada una con clientes: cada panel muestra **solo** los suyos.
3. Con el token de la marca A en la mano, no existe forma de pedir los clientes de B — el
   endpoint no acepta un id de marca. Confirmarlo intentando agregar `?partner_id=` y variantes
   al request y verificando que se ignoran.
4. La respuesta de `/partner/clientes` no contiene ninguna columna fuera de la lista de arriba.
   Compararla contra el `SELECT s.*` del admin para confirmar que no se filtró nada.
5. 8 intentos fallidos bloquean; a los 15 minutos se libera; un login exitoso limpia el contador.
6. Cambiar la contraseña desde el admin invalida la anterior; dejar el campo vacío la conserva.
7. El admin de CRP, rebuildeado, no muestra los campos de acceso.

## Lo que este diseño deja abierto

- **Varios usuarios por estudio** (el dueño y su asistente con claves distintas): se resuelve
  moviendo `usuario` y `pass_hash` a una tabla `partner_users` con `partner_id`. Los clientes y
  los permisos no se tocan, porque la clave de dueño sigue siendo `partner_id`.
- **Que el estudio cambie su propia contraseña**: hoy la cambia Cristian desde el admin. Sumarlo
  es un endpoint más que recibe la clave vieja y la nueva.
- **Escritura desde el panel** (que el estudio cargue clientes o edite sus piezas): eso es lo que
  choca con las claves globales de KV (`crd_invites`, `invite_cfg_*`, `crd_entregas`), que no
  tienen dueño y se pisan entre marcas. Antes de habilitar cualquier escritura hay que resolver
  eso, y es un diseño aparte.
