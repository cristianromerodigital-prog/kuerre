# Kuerre — CLAUDE.md

## Stack
Vanilla HTML/CSS/JS. Sin build system, sin frameworks, sin npm.

## Estructura
| Archivo | Propósito |
|---------|-----------|
| `index.html` | Landing pública (vende los 3 servicios) |
| `fiestas.html` | Galería colaborativa QR |
| `premiere.html` | Entrega estilo Netflix |
| `invite.html` | Invitación digital animada |
| `entrega.html` | Visor Drive (usado por premiere) |
| `admin.html` | Panel de gestión de eventos |
| `ContractForm.html` | Contratos digitales |

## Convenciones
- CSS y JS siempre inline dentro del HTML
- Secciones identificadas por id
- Login admin: client-side, credenciales hardcodeadas
- Bump versión V1.XX antes de cada push

## Infraestructura Cloudflare (separada de CRD)
- Worker: `Kuerre-worker` → URL definida tras deploy en Task 10
- KV namespace: prefijo `Kuerre_*`
- D1: `Kuerre-db`

## Identidad visual
- Fondo: #060d0f | Acento: #00c896 | Secundario: #00a0e0
- Tipografías: Inter + Cormorant Garamond
- Estilo: Aero glassmorphism (backdrop-filter: blur)

## Reglas de desarrollo
- Edits parciales con Edit tool — nunca reescribir archivo completo salvo que sea nuevo
- Grep de callers antes de tocar cualquier función
- No mezclar recursos con CRD (KV, D1, Worker separados)
- Copiar a Productivo/ + commit + push cuando el usuario diga "subilo"
