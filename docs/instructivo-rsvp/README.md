# Instructivo del panel RSVP

PDF para los clientes que usan el panel de invitados (`Desarrollo/rsvp-panel.html`).

- `instructivo.html`: el contenido. Las imágenes están en `img/` (`logo.png` es el logo de la marca).
- `capturas.mjs`: vuelve a sacar las capturas con datos de ejemplo (evento "Ana y Juan").
  `node docs/instructivo-rsvp/capturas.mjs docs/instructivo-rsvp/img`
- Generar el PDF con Chrome:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --no-pdf-header-footer --virtual-time-budget=8000 --print-to-pdf="Instructivo.pdf" "file://$PWD/docs/instructivo-rsvp/instructivo.html"`

Si cambia el panel, regenerar las capturas y el PDF.
