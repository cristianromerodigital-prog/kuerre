// ═══════════════════════════════════════════
// ContractManager.gs — Orquestador principal
// ═══════════════════════════════════════════

/**
 * Punto de entrada desde el formulario.
 * Recibe el JSON del form, delega al generador correcto,
 * registra en Sheet y devuelve resultado.
 */
function crearContrato(formJson) {
  try {
    const data   = typeof formJson === 'string' ? JSON.parse(formJson) : formJson;
    const tipo   = data.tipo;
    const isEdit = !!data.editMode;
    const numero = isEdit ? data.numero : getNextContractNumber(tipo);
    data.numero  = numero;

    let resultado;

    if (tipo === 'BODA') {
      resultado = generarContratoBoda(data);
      const reg = { numero, tipo, clientePrincipal: data.novia.nombre, cliente2: data.novio.nombre,
        fechaEvento: fechaLarga(data.fiesta.fecha), lugar: data.fiesta.lugar,
        precioTotal: data.precioTotal, docUrl: resultado.docUrl, pdfUrl: resultado.pdfUrl, formData: data };
      isEdit ? actualizarFilaContrato(numero, resultado, data) : registrarContrato(reg);

    } else if (tipo === 'XV') {
      resultado = generarContratoXV(data);
      const reg = { numero, tipo, clientePrincipal: data.cliente.nombre, cliente2: data.quinceanera.nombre,
        fechaEvento: fechaLarga(data.evento.fecha), lugar: data.evento.salon,
        precioTotal: data.precioTotal, cuotas: data.cuotas, docUrl: resultado.docUrl, pdfUrl: resultado.pdfUrl, formData: data };
      isEdit ? actualizarFilaContrato(numero, resultado, data) : registrarContrato(reg);

    } else if (tipo === 'CUMPLE') {
      resultado = generarContratoCumple(data);
      const reg = { numero, tipo, clientePrincipal: data.cliente.nombre,
        fechaEvento: fechaLarga(data.evento.fecha), lugar: data.evento.salon,
        precioTotal: data.precioTotal, cuotas: data.cuotas || 1, docUrl: resultado.docUrl, pdfUrl: resultado.pdfUrl, formData: data };
      isEdit ? actualizarFilaContrato(numero, resultado, data) : registrarContrato(reg);

    } else {
      throw new Error('Tipo de contrato desconocido: ' + tipo);
    }

    return {
      ok:      true,
      numero:  numero,
      docUrl:  resultado.docUrl,
      pdfUrl:  resultado.pdfUrl,
      mensaje: `Contrato ${numero} ${isEdit ? 'actualizado' : 'generado'} correctamente.`
    };

  } catch (e) {
    Logger.log('ERROR en crearContrato: ' + e.message + '\n' + e.stack);
    return { ok: false, error: e.message };
  }
}

/**
 * Contrato de Cumpleaños — estructura simplificada (basada en XV sin quinceañera).
 * Usa las cláusulas CUMPLE de la hoja.
 */
function generarContratoCumple(d) {
  const carpetaId = getConfigValue('CARPETA_CUMPLE_ID');
  const carpeta   = DriveApp.getFolderById(carpetaId);
  const titulo    = `Contrato ${d.numero} — Cumpleaños — ${d.cliente.nombre}`;

  const doc  = DocumentApp.create(titulo);
  const body = doc.getBody();
  body.setMarginTop(72).setMarginBottom(72).setMarginLeft(72).setMarginRight(72);

  _insertLogo(body);
  _p(body, 'CONTRATO DE SERVICIOS DE FOTOGRAFÍA Y VIDEO', {
    align: DocumentApp.HorizontalAlignment.CENTER, bold: true, size: 13
  });
  _p(body, 'Cristian Romero Digital', {
    align: DocumentApp.HorizontalAlignment.CENTER, size: 11
  });
  _normal(body, '');

  // Tabla de datos
  const tablaData = [
    ['Evento',             'Cumpleaños'],
    ['Festejado/a',        d.cliente.nombre],
    ['Fecha del evento',   fechaLarga(d.evento.fecha)],
    ['Horario',            `${d.evento.horaInicio} hs a ${d.evento.horaFin} hs`],
    ['Salón',              d.evento.salon],
    ['Dirección',          d.evento.direccion],
    ['Invitados aprox.',   String(d.evento.invitados || '')],
    ['Cliente',            d.cliente.nombre],
    ['DNI',                d.cliente.dni],
    ['Teléfono',           d.cliente.telefono],
    ['Email',              d.cliente.email],
    ['Prestador',          CFG.PRESTADOR.empresa],
    ['Contacto prestador', `${CFG.PRESTADOR.telefono} · ${CFG.PRESTADOR.email}`],
  ];
  const tabla = body.appendTable(tablaData);
  tabla.setBorderColor('#cccccc');
  for (let i = 0; i < tablaData.length; i++) {
    tabla.getRow(i).getCell(0).editAsText().setBold(false).setForegroundColor('#000000');
  }

  _normal(body, '');
  const [y, m, dia] = d.diaFirma.split('-');
  body.appendParagraph(
    `En la ciudad de ${CFG.PRESTADOR.ciudad.split(',')[0]}, Provincia de Buenos Aires, a los ${parseInt(dia, 10)} días del mes de ${CFG.MESES[parseInt(m, 10) - 1]} de ${y}, ` +
    `se celebra el presente contrato de servicios entre ${CFG.PRESTADOR.nombre}, DNI ${CFG.PRESTADOR.dni}, titular de ${CFG.PRESTADOR.empresa}, en adelante EL PRESTADOR; ` +
    `y ${d.cliente.nombre}, DNI ${d.cliente.dni}, en adelante EL CLIENTE.`
  ).editAsText().setBold(false).setForegroundColor('#000000');

  _normal(body, '');
  _sectionTitle(body, '1. OBJETO DEL CONTRATO');
  _normal(body,
    `EL PRESTADOR se compromete a brindar servicios profesionales de fotografía y video en ocasión del cumpleaños de ${d.cliente.nombre}, ` +
    `a realizarse el día ${fechaLarga(d.evento.fecha)} en el salón ${d.evento.salon}, ubicado en ${d.evento.direccion}.`
  );
  _normal(body, '');

  _sectionTitle(body, '2. SERVICIOS INCLUIDOS');
  if (d.servicios && d.servicios.length > 0) {
    d.servicios.forEach(s => _bullet(body, s.descripcion));
  }
  _normal(body, '');

  const valorCuota = (d.cuotas > 1) ? Math.round(d.precioTotal / d.cuotas) : d.precioTotal;
  _sectionTitle(body, '3. PRECIO Y FORMAS DE PAGO');
  _normal(body, `El precio total del servicio es de: ${formatMoney(d.precioTotal)} (${numeroALetras(d.precioTotal)}).`);
  _normal(body, '');
  _normal(body, 'Forma de pago:');
  const pagoItemsCumple = (d.formasPago && d.formasPago.length > 0)
    ? d.formasPago
    : [`100% del valor total al momento de la firma del presente contrato.`];
  pagoItemsCumple.forEach(item => _bullet(body, item));
  _normal(body, 'Las cuotas podrán abonarse mediante transferencia bancaria, efectivo u otro medio acordado entre las partes.');
  _normal(body, '');

  const clausulas = getClausulas('CUMPLE');
  clausulas.forEach((c, idx) => {
    _sectionTitle(body, `${idx + 4}. ${c.titulo}`);
    c.cuerpo.split('\n').forEach(linea => {
      if (linea.trim().startsWith('•')) _bullet(body, linea.replace(/^•\s*/, ''));
      else if (linea.trim()) _normal(body, linea);
    });
    _normal(body, '');
  });

  const numAcept = 4 + clausulas.length;
  _sectionTitle(body, `${numAcept}. ACEPTACIÓN`);
  _normal(body, 'Ambas partes declaran haber leído, entendido y aceptado todas las cláusulas del presente contrato.');
  _normal(body, '');
  body.appendTable([
    ['Firma del Prestador', 'Firma del Cliente'],
    ['', ''],
    ['', ''],
    [`Aclaración: ${CFG.PRESTADOR.nombre}`, `Aclaración: ${d.cliente.nombre}`],
    [`DNI: ${CFG.PRESTADOR.dni}`, `DNI: ${d.cliente.dni}`],
  ]).setBorderWidth(0);
  _p(body, 'Fecha: ___ / ___ / _______', { align: DocumentApp.HorizontalAlignment.CENTER });

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

// ──── Función auxiliar para listar servicios (llamada desde el form) ────

function getServiciosParaForm() {
  return getServicios().map(s => ({
    id:          s.id,
    descripcion: s.descripcion,
    pesos:       s.pesos,
    label:       `[${s.id}] ${s.descripcion}${s.pesos > 0 ? ' — ' + formatMoney(s.pesos) : ''}`
  }));
}
