// ═══════════════════════════════════════════
// Code.gs — Web App entry point
// ═══════════════════════════════════════════

function doGet(e) {
  _sysSheetId     = (e && e.parameter && e.parameter.systemSheetId)  || null;
  _presupuestosId = (e && e.parameter && e.parameter.presupuestosId) || null;
  const action   = (e && e.parameter && e.parameter.action)   || '';
  const callback = (e && e.parameter && e.parameter.callback) || '';

  let result = null;

  if (action === 'getServicios')   result = getServiciosParaForm();
  if (action === 'getContratos')   result = getContratos();
  if (action === 'getSolicitudes') result = getSolicitudes();
  if (action === 'getCalendars')   result = getCalendars();
  if (action === 'nextNumber') {
    const tipo = (e.parameter.tipo || 'BODA').toUpperCase();
    result = peekLastNumber(tipo) + 1;
  }
  if (action === 'setupKuerre') {
    // Setup unico e idempotente: crea la planilla motor y las carpetas de contratos
    const existing = PropertiesService.getScriptProperties().getProperty('SYSTEM_SHEET_ID');
    if (existing) {
      result = { ok: true, alreadySetup: true, systemSheetId: existing };
    } else {
      setupSistema();
      result = { ok: true, systemSheetId: PropertiesService.getScriptProperties().getProperty('SYSTEM_SHEET_ID') };
    }
  }
  if (action === 'getDriveFolder') {
    const folderId = (e && e.parameter && e.parameter.folder) || '';
    result = folderId ? getDriveFolderFiles(folderId) : [];
  }
  if (action === 'syncCalendar') {
    const eventsJson  = (e && e.parameter && e.parameter.events)     || '[]';
    const calendarId  = (e && e.parameter && e.parameter.calendarId) || null;
    try { result = syncCalendar(JSON.parse(eventsJson), calendarId); }
    catch(err) { result = { ok: false, error: err.message }; }
  }

  // Si hay resultado JSON (con o sin JSONP)
  if (result !== null) {
    if (callback) {
      // JSONP — permite llamadas cross-origin desde admin.html externo
      return ContentService
        .createTextOutput(callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return _jsonResponse(result);
  }

  if (action === 'form') {
    return HtmlService
      .createHtmlOutputFromFile('FormCliente')
      .setTitle('Solicitud de Servicio — Cristian Romero Digital')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Sin action → formulario de solicitud para clientes
  return HtmlService
    .createHtmlOutputFromFile('FormCliente')
    .setTitle('Solicitud de Servicio — Cristian Romero Digital')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function _jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    _sysSheetId     = data.systemSheetId     || null;
    _presupuestosId = data.presupuestosId    || null;
    if (data.action === 'getServicios')   return _jsonResponse(getServiciosParaForm());
    if (data.action === 'getContratos')   return _jsonResponse(getContratos());
    if (data.action === 'getSolicitudes') return _jsonResponse(getSolicitudes());
    if (data.action === 'nextNumber') {
      const tipo = (data.tipo || 'BODA').toUpperCase();
      return _jsonResponse(peekLastNumber(tipo) + 1);
    }
    if (data.action === 'guardarSolicitud') {
      return ContentService
        .createTextOutput(JSON.stringify(guardarSolicitud(data.formData)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'marcarSolicitudUsada') {
      marcarSolicitudUsada(data.id);
      return ContentService.createTextOutput('{"ok":true}').setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'subirContratoPDF') {
      return ContentService
        .createTextOutput(JSON.stringify(subirContratoPDF(data.base64, data.nombre, data.driveClienteId || '', data.clienteNombre || '')))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'syncCalendar') {
      return ContentService
        .createTextOutput(JSON.stringify(syncCalendar(data.events || [], data.calendarId || null)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'fullSync') {
      return _jsonResponse(fullSyncCalendar(data));
    }
    if (data.action === 'upsertCalendarEvent') {
      return _jsonResponse(upsertCalendarEvent(data.event || {}, data.calendarId || null));
    }
    if (data.action === 'deleteCalendarEvent') {
      return _jsonResponse(deleteCalendarEvent(data.gcal_id || '', data.calendarId || null));
    }
    if (data.action === 'getCalendars') {
      return _jsonResponse(getCalendars());
    }
    if (data.action === 'createCalendar') {
      const name = data.name || 'Nuevo Calendario';
      const cal  = CalendarApp.createCalendar(name);
      return _jsonResponse({ ok: true, id: cal.getId(), name: cal.getName() });
    }
    if (data.action === 'deleteContrato') {
      return ContentService
        .createTextOutput(JSON.stringify(deleteContrato(data.numero)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'trashFiles') {
      return ContentService
        .createTextOutput(JSON.stringify(trashFiles(data.docId || null, data.pdfId || null)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    if (data.action === 'moverArchivo') {
      return ContentService
        .createTextOutput(JSON.stringify(moverArchivoACarpeta(data.fileId, data.carpetaId)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const resultado = crearContrato(data);
    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Llamadas desde el HTML client-side via google.script.run
function serverGetServicios() {
  return getServiciosParaForm();
}

function serverCrearContrato(formJson)    { return crearContrato(formJson); }
function serverGetNextNumber(tipo)        { return peekLastNumber(tipo) + 1; }
function serverGetContratos()             { return getContratos(); }
function serverDeleteContrato(numero)     { return deleteContrato(numero); }
function serverGuardarSolicitud(data)     { return guardarSolicitud(data); }
function serverGetSolicitudes()           { return getSolicitudes(); }
function serverMarcarSolicitudUsada(id)   { marcarSolicitudUsada(id); }
