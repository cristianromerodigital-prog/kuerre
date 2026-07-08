// ═══════════════════════════════════════════
// GeneratorXV.gs — Generación de contrato de XV Años
// ═══════════════════════════════════════════

/**
 * @param {Object} d - datos del formulario
 *   d.numero            {number}
 *   d.quinceanera       {nombre, fechaNacimiento:'YYYY-MM-DD'}
 *   d.evento            {fecha:'YYYY-MM-DD', horaInicio, horaFin, salon, direccion, invitados}
 *   d.cliente           {nombre, dni, telefono, email}
 *   d.diaFirma          {string} 'YYYY-MM-DD'
 *   d.servicios         [{descripcion, pesos}]
 *   d.precioTotal       {number}
 *   d.cuotas            {number}
 * @returns {Object} {docUrl, pdfUrl}
 */
function generarContratoXV(d) {
  const carpetaId = getConfigValue('CARPETA_XV_ID');
  const carpeta   = DriveApp.getFolderById(carpetaId);
  const titulo    = `Contrato ${d.numero} — XV — ${d.quinceanera.nombre}`;

  const doc  = DocumentApp.create(titulo);
  const body = doc.getBody();
  body.setMarginTop(72).setMarginBottom(72).setMarginLeft(72).setMarginRight(72);

  // ── Encabezado ──
  _insertLogo(body);
  _p(body, 'CONTRATO DE SERVICIOS DE FOTOGRAFÍA Y VIDEO', {
    align: DocumentApp.HorizontalAlignment.CENTER,
    bold: true, size: 13
  });
  _p(body, 'Cristian Romero Digital', {
    align: DocumentApp.HorizontalAlignment.CENTER,
    size: 11
  });
  _normal(body, '');

  // ── Tabla de datos del evento ──
  const valorCuota = d.cuotas > 0 ? Math.round(d.precioTotal / d.cuotas) : d.precioTotal;

  const tablaData = [
    ['Evento',                     '15 años'],
    ['Quinceañera',                d.quinceanera.nombre],
    ['Fecha de nacimiento',        fechaLarga(d.quinceanera.fechaNacimiento)],
    ['Fecha del evento',           fechaLarga(d.evento.fecha)],
    ['Horario',                    `${d.evento.horaInicio} hs a ${d.evento.horaFin} hs`],
    ['Salón',                      d.evento.salon],
    ['Dirección',                  d.evento.direccion],
    ['Invitados aproximados',      String(d.evento.invitados)],
    ['Cliente',                    d.cliente.nombre],
    ['DNI',                        d.cliente.dni],
    ['Teléfono',                   d.cliente.telefono],
    ['Email',                      d.cliente.email],
    ['Prestador',                  CFG.PRESTADOR.empresa],
    ['Domicilio del prestador',    CFG.PRESTADOR.domicilio],
    ['Contacto del prestador',     `${CFG.PRESTADOR.telefono} · ${CFG.PRESTADOR.email}`],
  ];

  const tabla = body.appendTable(tablaData);
  tabla.setBorderColor('#cccccc');
  // Negrita en columna izquierda
  for (let i = 0; i < tablaData.length; i++) {
    tabla.getRow(i).getCell(0).editAsText().setBold(true);
  }

  _normal(body, '');
  const introText = body.appendParagraph(
    'El presente documento deja por escrito las condiciones del servicio profesional contratado para la cobertura fotográfica y audiovisual del evento detallado.'
  );
  introText.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  _normal(body, '');

  // Párrafo legal de apertura
  const [y, m, dia] = d.diaFirma.split('-');
  const mesNombre   = CFG.MESES[parseInt(m, 10) - 1];
  const introLegal  = body.appendParagraph(
    `En la ciudad de ${CFG.PRESTADOR.ciudad.split(',')[0]}, Provincia de Buenos Aires, a los ${parseInt(dia, 10)} días del mes de ${mesNombre} de ${y}, se celebra el presente contrato de prestación de servicios entre ` +
    `${CFG.PRESTADOR.nombre}, DNI ${CFG.PRESTADOR.dni}, titular de ${CFG.PRESTADOR.empresa}, con domicilio en ${CFG.PRESTADOR.domicilio}, teléfono ${CFG.PRESTADOR.telefono}, correo electrónico ${CFG.PRESTADOR.email}, en adelante denominado EL PRESTADOR, por una parte; ` +
    `y por la otra ${d.cliente.nombre}, DNI ${d.cliente.dni}, teléfono ${d.cliente.telefono}, correo electrónico ${d.cliente.email}, en adelante denominada EL CLIENTE, ` +
    `quienes acuerdan celebrar el presente contrato de servicios de fotografía y video sujeto a las siguientes cláusulas.`
  );
  
  _normal(body, '');

  // ── 1. OBJETO DEL CONTRATO ──
  _sectionTitle(body, '1. OBJETO DEL CONTRATO');
  _normal(body,
    `EL PRESTADOR se compromete a brindar servicios profesionales de fotografía y video en ocasión del cumpleaños de 15 años de ${d.quinceanera.nombre}, ` +
    `a realizarse el día ${fechaLarga(d.evento.fecha)} en el salón ${d.evento.salon}, ubicado en ${d.evento.direccion}, ante aproximadamente ${d.evento.invitados} invitados.`
  );
  _normal(body, '');

  // ── 2. SERVICIOS INCLUIDOS ──
  _sectionTitle(body, '2. SERVICIOS INCLUIDOS');
  _normal(body, 'Por el valor detallado en la cláusula 3 se incluyen los siguientes servicios:');
  _normal(body, 'Cobertura completa del evento en fotografía y video.');
  _normal(body, 'Fotos ilimitadas en alta calidad.');
  _normal(body, 'Video digital editado con los momentos destacados del evento.');
  _normal(body, 'Entrega digital de fotos y video mediante enlace online (Drive o plataforma similar).');
  _normal(body, '');
  _normal(body, 'Servicios presupuestados y detallados:');
  if (d.servicios && d.servicios.length > 0) {
    d.servicios.forEach(s => _bullet(body, s.descripcion));
  }
  _normal(body, '');

  // ── 3. PRECIO Y FORMAS DE PAGO ──
  _sectionTitle(body, '3. PRECIO Y FORMAS DE PAGO');
  _normal(body, `El precio total del servicio es de: ${formatMoney(d.precioTotal)} (${numeroALetras(d.precioTotal)}).`);
  _normal(body, '');
  _normal(body, 'Forma de pago:');
  const pagoItems = (d.formasPago && d.formasPago.length > 0)
    ? d.formasPago
    : d.cuotas > 1
      ? [`Primera cuota de ${formatMoney(valorCuota)} en concepto de seña y reserva de fecha, al momento de la firma del presente contrato.`]
      : [`100% del valor total al momento de la firma del presente contrato.`];
  pagoItems.forEach(item => _bullet(body, item));
  _normal(body, '');
  _normal(body, 'El pago total se congela al momento de la firma del presente contrato, quedando confirmada la contratación del servicio.');
  _normal(body, 'Las cuotas podrán abonarse mediante transferencia bancaria, efectivo u otro medio acordado entre las partes.');
  _normal(body, 'El total del servicio debe quedar cancelado 1 semana antes del evento.');
  _normal(body, '');

  // ── Cláusulas 4 en adelante (desde la hoja CLAUSULAS) ──
  const clausulas = getClausulas('XV');
  clausulas.forEach((c, idx) => {
    _sectionTitle(body, `${idx + 4}. ${c.titulo}`);
    _normal(body, '');
    c.cuerpo.split('\n').forEach(linea => {
      if (linea.trim().startsWith('•')) {
        _bullet(body, linea.replace(/^•\s*/, ''));
      } else if (linea.trim()) {
        _normal(body, linea);
      }
    });
    _normal(body, '');
  });

  // ── Cláusula SESIÓN DE EXTERIORES ──
  const numExt = 4 + clausulas.length;
  _sectionTitle(body, `${numExt}. SESIÓN DE EXTERIORES (BOOK)`);
  _normal(body, '');
  _normal(body, 'En caso de incluirse sesión de exteriores (book de XV), la misma deberá realizarse con un mínimo de 20 (veinte) días de anticipación a la fecha del evento.');
  _normal(body, '');
  _normal(body, 'En caso de lluvia u otras condiciones climáticas adversas en la fecha acordada para la sesión de exteriores, la misma podrá posponerse a una nueva fecha a convenir de mutuo acuerdo entre ambas partes, sin costo adicional alguno.');
  _normal(body, '');

  // ── Cláusula ACEPTACIÓN ──
  const numAcept = 4 + clausulas.length + 1;
  _sectionTitle(body, `${numAcept}. ACEPTACIÓN`);
  _normal(body, 'Ambas partes declaran haber leído, entendido y aceptado todas las cláusulas del presente contrato.');
  _normal(body, 'En prueba de conformidad se firman dos ejemplares del mismo tenor y a un solo efecto.');
  _normal(body, '');
  _normal(body, 'FIRMAS');
  _normal(body, '');

  const tablaFirmas = body.appendTable([
    ['Firma del Prestador',             'Firma del Cliente'],
    ['', ''],
    ['', ''],
    [`Aclaración: ${CFG.PRESTADOR.nombre}`, `Aclaración: ${d.cliente.nombre}`],
    [`DNI: ${CFG.PRESTADOR.dni}`,           `DNI: ${d.cliente.dni}`],
  ]);
  tablaFirmas.setBorderWidth(0);

  _normal(body, '');
  _p(body, 'Fecha: ___ / ___ / _______', { align: DocumentApp.HorizontalAlignment.CENTER });

  // ── REGISTRO DE PAGOS ──
  if (d.cuotas > 1) {
    _normal(body, '');
    _normal(body, '');
    _p(body, 'REGISTRO DE PAGOS', {
      align: DocumentApp.HorizontalAlignment.CENTER,
      bold: true, size: 12
    });
    _normal(body, '');

    const filasPago = [['Cuota', 'Valor', 'Fecha']];
    for (let i = 1; i <= d.cuotas; i++) {
      filasPago.push([String(i), formatMoney(valorCuota), '']);
    }
    const tablaPagos = body.appendTable(filasPago);
    // Header de la tabla en negrita
    const headerRow = tablaPagos.getRow(0);
    for (let c = 0; c < 3; c++) {
      headerRow.getCell(c).editAsText().setBold(true);
    }
    tablaPagos.setBorderColor('#cccccc');
  }

  // Guardar y mover a Drive
  doc.saveAndClose();
  const file = DriveApp.getFileById(doc.getId());
  carpeta.addFile(file);
  DriveApp.getRootFolder().removeFile(file);

  const pdfUrl = _exportarPDF(doc.getId(), carpeta, d.numero);

  return {
    docUrl: `https://docs.google.com/document/d/${doc.getId()}/edit`,
    pdfUrl: pdfUrl
  };
}
