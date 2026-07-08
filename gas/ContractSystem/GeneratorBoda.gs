// ═══════════════════════════════════════════
// GeneratorBoda.gs — Generación de contrato de Boda
// ═══════════════════════════════════════════

/**
 * @param {Object} d - datos del formulario
 *   d.numero         {number}
 *   d.ciudad         {string}  ciudad donde se firma
 *   d.diaFirma       {string}  'YYYY-MM-DD'
 *   d.novia          {nombre, dni, telefono, email}
 *   d.novio          {nombre, dni, domicilio, telefono, email}
 *   d.civil          {fecha:'YYYY-MM-DD', horario, direccion}
 *   d.religiosa      {fecha:'YYYY-MM-DD', horario, direccion}
 *   d.fiesta         {fecha:'YYYY-MM-DD', horarioInicio, lugar, direccion}
 *   d.contacto       {nombre, telefono, relacion}
 *   d.nombrePaquete  {string}
 *   d.servicios      [{descripcion, pesos}]
 *   d.precioTotal    {number}
 *   d.formasPago     {string[]}
 * @returns {Object} {docUrl, pdfUrl}
 */
function generarContratoBoda(d) {
  // KUERRE: sin carpeta staging — el admin mueve doc y PDF a la carpeta Contrato del cliente
  const titulo    = `Contrato ${d.numero} — Boda — ${d.novia.nombre} & ${d.novio.nombre}`;

  const doc  = DocumentApp.create(titulo);
  const body = doc.getBody();
  body.setMarginTop(72).setMarginBottom(72).setMarginLeft(72).setMarginRight(72);

  // ── Encabezado ──
  _insertLogo(body);
  _p(body, 'CONTRATO DE SERVICIOS DE FOTOGRAFÍA Y VIDEO', {
    align: DocumentApp.HorizontalAlignment.CENTER,
    bold: true, size: 13
  });
  _p(body, 'Kuerre', {
    align: DocumentApp.HorizontalAlignment.CENTER,
    size: 11
  });
  _normal(body, '');

  // ── Tabla de datos del evento ──
  const tablaData = [
    ['Evento',            'Boda / Casamiento'],
    ['Novia',             d.novia.nombre],
    ['DNI Novia',         d.novia.dni],
    ['Teléfono Novia',    d.novia.telefono],
    ['Email Novia',       d.novia.email],
    ['Novio',             d.novio.nombre],
    ['DNI Novio',         d.novio.dni],
  ];
  if (d.novio.domicilio) tablaData.push(['Domicilio',           d.novio.domicilio]);
  tablaData.push(
    ['Teléfono Novio',    d.novio.telefono],
    ['Email Novio',       d.novio.email]
  );
  if (d.civil && d.civil.fecha) {
    tablaData.push(
      ['Civil — Fecha',      fechaLarga(d.civil.fecha)],
      ['Civil — Horario',    d.civil.horario + ' hs'],
      ['Civil — Dirección',  d.civil.direccion]
    );
  }
  if (d.religiosa && d.religiosa.fecha) {
    tablaData.push(
      ['Religiosa — Fecha',      fechaLarga(d.religiosa.fecha)],
      ['Religiosa — Horario',    d.religiosa.horario + ' hs'],
      ['Religiosa — Dirección',  d.religiosa.direccion]
    );
  }
  tablaData.push(
    ['Fiesta — Fecha',           fechaLarga(d.fiesta.fecha)],
    ['Fiesta — Horario de inicio', d.fiesta.horarioInicio + ' hs'],
    ['Fiesta — Salón',           d.fiesta.lugar],
    ['Fiesta — Dirección',       d.fiesta.direccion]
  );
  if (d.contacto && d.contacto.nombre) {
    const contactoVal = d.contacto.nombre
      + (d.contacto.relacion ? ' (' + d.contacto.relacion + ')' : '')
      + ' — Tel: ' + d.contacto.telefono;
    tablaData.push(['Contacto durante el evento', contactoVal]);
  }
  tablaData.push(
    ['Prestador',               CFG.PRESTADOR.empresa],
    ['Domicilio del prestador', CFG.PRESTADOR.domicilio],
    ['Contacto del prestador',  CFG.PRESTADOR.telefono + ' · ' + CFG.PRESTADOR.email]
  );

  const tabla = body.appendTable(tablaData);
  tabla.setBorderColor('#cccccc');
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
  body.appendParagraph(
    `En la ciudad de ${d.ciudad}, a los ${parseInt(dia, 10)} días del mes de ${mesNombre} de ${y}, se celebra el presente contrato de prestación de servicios entre ` +
    `${CFG.PRESTADOR.nombre}, DNI ${CFG.PRESTADOR.dni}, titular de ${CFG.PRESTADOR.empresa}, con domicilio en ${CFG.PRESTADOR.domicilio}, teléfono ${CFG.PRESTADOR.telefono}, correo electrónico ${CFG.PRESTADOR.email}, en adelante denominado EL PRESTADOR, por una parte; ` +
    `y por la otra ${d.novia.nombre}, DNI ${d.novia.dni}, y ${d.novio.nombre}, DNI ${d.novio.dni}, en adelante denominados LOS CONTRATANTES, ` +
    `quienes acuerdan celebrar el presente contrato de servicios de fotografía y video sujeto a las siguientes cláusulas.`
  );
  _normal(body, '');

  // ── 1. OBJETO DEL CONTRATO ──
  _sectionTitle(body, '1. OBJETO DEL CONTRATO');
  _normal(body,
    `EL PRESTADOR se compromete a brindar servicios profesionales de fotografía y video de boda, ` +
    `cubriendo las distintas instancias del evento detalladas anteriormente, bajo un enfoque ` +
    `documental, emocional y autoral, conforme a su experiencia, criterio técnico y estilo artístico.`
  );
  _normal(body, '');

  // ── 2. SERVICIO CONTRATADO ──
  _sectionTitle(body, `2. SERVICIO CONTRATADO — PAQUETE ${(d.nombrePaquete || '').toUpperCase()}`);
  _normal(body, `LOS CONTRATANTES contratan el PAQUETE ${d.nombrePaquete || ''}, el cual incluye:`);
  _normal(body, '');
  ['Cobertura fotográfica y de video del Civil, Ceremonia Religiosa y Fiesta.',
   'Fotografías ILIMITADAS, editadas profesionalmente en alta calidad.',
   'Registro audiovisual integral del evento, con edición profesional.',
   'Entrega del material sin marcas de agua.',
   'Entrega final mediante pendrive en máxima calidad y caja personalizada.']
    .forEach(item => _bullet(body, item));
  if (d.servicios && d.servicios.length > 0) {
    _normal(body, '');
    _normal(body, 'Servicios adicionales incluidos:');
    d.servicios.forEach(s => _bullet(body, s.descripcion));
  }
  _normal(body, '');
  _normal(body,
    'La selección, edición y narrativa final del material quedará a criterio profesional del PRESTADOR, respetando su estilo documental y autoral.'
  );
  _normal(body, '');

  // ── 3. PLAZOS DE ENTREGA ──
  _sectionTitle(body, '3. PLAZOS DE ENTREGA');
  _normal(body, getClausulas('BODA').find(c => c.id === 'CL_B01')?.cuerpo ||
    'El material final será entregado en formato digital en un plazo estimado de 30 a 45 días corridos posteriores a la fecha del evento.');
  _normal(body, '');

  // ── 4. PRECIO Y FORMAS DE PAGO ──
  _sectionTitle(body, '4. PRECIO Y FORMAS DE PAGO');
  _normal(body, `El precio total del servicio es de: ${formatMoney(d.precioTotal)} (${numeroALetras(d.precioTotal)}).`);
  _normal(body, '');
  _normal(body, 'Forma de pago:');
  const pagoItems = (d.formasPago && d.formasPago.length > 0)
    ? d.formasPago
    : [`30% del valor total en concepto de seña y reserva de fecha, al momento de la firma del presente contrato.`,
       `70% del valor total faltante una semana previa al evento.`];
  pagoItems.forEach(item => _bullet(body, item));
  _normal(body, '');
  _normal(body, 'El pago total se congela al momento de la firma del presente contrato, quedando confirmada la contratación del servicio.');
  _normal(body, 'Las cuotas podrán abonarse mediante transferencia bancaria, efectivo u otro medio acordado entre las partes.');
  _normal(body, 'El total del servicio debe quedar cancelado 1 semana antes del evento.');
  _normal(body, '');

  // ── Cláusulas 5 en adelante (desde la hoja CLAUSULAS) ──
  const clausulas = getClausulas('BODA').filter(c => c.id !== 'CL_B01');
  let nro = 5;
  clausulas.forEach(c => {
    _sectionTitle(body, `${nro}. ${c.titulo}`);
    _normal(body, '');
    c.cuerpo.split('\n').forEach(linea => {
      if (linea.trim().startsWith('•')) {
        _bullet(body, linea.replace(/^•\s*/, ''));
      } else if (linea.trim()) {
        _normal(body, linea);
      }
    });
    _normal(body, '');
    nro++;
  });

  // ── Cláusula: SESIÓN DE EXTERIORES ──
  _sectionTitle(body, `${nro}. SESIÓN DE EXTERIORES`);
  _normal(body, 'En caso de incluirse sesión de exteriores (pre boda), la misma deberá realizarse con un mínimo de 20 (veinte) días de anticipación a la fecha del evento.');
  _normal(body, '');
  _normal(body, 'En caso de lluvia u otras condiciones climáticas adversas en la fecha acordada para la sesión de exteriores, la misma podrá posponerse a una nueva fecha a convenir de mutuo acuerdo entre ambas partes, sin costo adicional alguno.');
  _normal(body, '');
  nro++;

  // ── Cláusula final: ACEPTACIÓN ──
  _sectionTitle(body, `${nro}. ACEPTACIÓN`);
  _normal(body, 'Ambas partes declaran haber leído, entendido y aceptado todas las cláusulas del presente contrato.');
  _normal(body, 'En prueba de conformidad se firman dos ejemplares del mismo tenor y a un solo efecto.');
  _normal(body, '');
  _normal(body, 'FIRMAS');
  _normal(body, '');

  // ── Firmas (3 columnas: prestador, novia, novio) ──
  const tablaFirmas = body.appendTable([
    ['Firma del Prestador',             'Firma de la Novia',          'Firma del Novio'],
    ['', '', ''],
    ['', '', ''],
    [`Aclaración: ${CFG.PRESTADOR.nombre}`, `Aclaración: ${d.novia.nombre}`, `Aclaración: ${d.novio.nombre}`],
    [`DNI: ${CFG.PRESTADOR.dni}`,           `DNI: ${d.novia.dni}`,           `DNI: ${d.novio.dni}`],
  ]);
  tablaFirmas.setBorderWidth(0);

  _normal(body, '');
  _p(body, 'Fecha: ___ / ___ / _______', { align: DocumentApp.HorizontalAlignment.CENTER });

  // Guardar y mover a Drive
  doc.saveAndClose();

  const pdfUrl = _exportarPDF(doc.getId(), DriveApp.getRootFolder(), d.numero);

  return {
    docUrl: `https://docs.google.com/document/d/${doc.getId()}/edit`,
    pdfUrl: pdfUrl
  };
}

function _exportarPDF(docId, carpeta, numero) {
  try {
    const blob    = DriveApp.getFileById(docId).getAs('application/pdf');
    blob.setName(`Contrato ${numero}.pdf`);
    const pdfFile = carpeta.createFile(blob);
    return pdfFile.getUrl();
  } catch (e) {
    Logger.log('Error exportando PDF: ' + e.message);
    return '';
  }
}
