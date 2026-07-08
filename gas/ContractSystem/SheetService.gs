// ═══════════════════════════════════════════
// SheetService.gs — Lectura/escritura en Sheets
// ═══════════════════════════════════════════

// ──── Drive: lista archivos/carpetas de una carpeta ────

function getDriveFolderFiles(folderId) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const result = [];

    // Subcarpetas primero
    const subs = folder.getFolders();
    while (subs.hasNext()) {
      const sf = subs.next();
      result.push({ id: sf.getId(), name: sf.getName(), type: 'folder' });
    }

    // Archivos de imagen y video
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f    = files.next();
      const mime = f.getMimeType();
      const isImg   = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');
      if (!isImg && !isVideo) continue;
      result.push({
        id:   f.getId(),
        name: f.getName(),
        type: isVideo ? 'video' : 'image',
        size: f.getSize()
      });
    }

    // Carpetas primero, luego por nombre
    result.sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return  1;
      return a.name.localeCompare(b.name, 'es', { numeric: true });
    });
    return result;
  } catch (err) {
    return { error: err.message };
  }
}

// ──── Servicios (lee desde Presupuestos 2026) ────

function getServicios() {
  const ss    = SpreadsheetApp.openById(_presupuestosId || CFG.PRESUPUESTOS_ID);
  const sheet = ss.getSheetByName('Servicios');
  const data  = sheet.getDataRange().getValues();

  const servicios = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] || !row[1]) continue; // fila vacía

    const descripcion = String(row[1]).replace(/\s*\$\s*[\d.,]+/g, '').trim();
    const rawPesos    = row[3];
    const pesos       = typeof rawPesos === 'number'
      ? Math.round(rawPesos)
      : Number(String(rawPesos).replace(/\./g, '').replace(',', '.')) || 0;

    servicios.push({
      id:          String(row[0]).trim(),
      descripcion: descripcion,
      pesos:       pesos,
      raw:         String(row[1]).trim() // descripción original con precio
    });
  }
  return servicios;
}

// ──── Cláusulas ────

function getClausulas(tipo) {
  const data = getSysSheet().getSheetByName('CLAUSULAS').getDataRange().getValues();

  return data
    .slice(1)
    .filter(r => r[5] === true && r[1] === tipo)
    .sort((a, b) => Number(a[2]) - Number(b[2]))
    .map(r => ({ id: r[0], titulo: r[3], cuerpo: r[4] }));
}

// ──── Solicitudes de clientes ────

function guardarSolicitud(data) {
  const sheet = getSysSheet().getSheetByName('SOLICITUDES');
  if (!sheet) throw new Error('Hoja SOLICITUDES no existe. Ejecutá setupSistema().');
  const id     = 'SOL-' + Date.now();
  const fecha  = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
  const nombre = data.tipo === 'BODA' ? (data.novia && data.novia.nombre || '') : (data.cliente && data.cliente.nombre || '');
  sheet.appendRow([id, data.tipo, fecha, 'PENDIENTE', nombre, JSON.stringify(data)]);
  return { ok: true, id };
}

function getSolicitudes() {
  const sheet = getSysSheet().getSheetByName('SOLICITUDES');
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0] && r[3] === 'PENDIENTE').map(r => ({
    id: r[0], tipo: r[1], fecha: r[2], cliente: r[4],
    data: JSON.parse(r[5] || '{}')
  }));
}

function marcarSolicitudUsada(id) {
  const sheet = getSysSheet().getSheetByName('SOLICITUDES');
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === id) { sheet.getRange(i + 1, 4).setValue('USADA'); return; }
  }
}

// ──── Historial de contratos ────

function getContratos() {
  const sheet = getSysSheet().getSheetByName('CONTRATOS');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1).filter(r => r[0]).map(r => ({
    numero:      r[0],
    tipo:        r[1],
    fecha:       r[2],
    cliente:     r[3],
    cliente2:    r[4] || '',
    fechaEvento: r[5],
    precio:      r[7],
    docUrl:      r[10] || '',
    pdfUrl:      r[11] || '',
    formData:    JSON.parse(r[13] || '{}')
  }));
}

function deleteContrato(numero) {
  const sheet = getSysSheet().getSheetByName('CONTRATOS');
  if (!sheet) return { ok: false, error: 'Hoja CONTRATOS no encontrada' };
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(numero)) {
      try {
        const docId = String(data[i][10]).match(/\/d\/([^/]+)/)?.[1];
        const pdfId = String(data[i][11]).match(/\/d\/([^/]+)/)?.[1];
        if (docId) DriveApp.getFileById(docId).setTrashed(true);
        if (pdfId) DriveApp.getFileById(pdfId).setTrashed(true);
      } catch(e) {}
      sheet.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Contrato no encontrado' };
}

// ──── Registro de contratos ────

function actualizarFilaContrato(numero, resultado, data) {
  const sheet = getSysSheet().getSheetByName('CONTRATOS');
  if (!sheet) return;
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(numero)) {
      try {
        const oldDocId = String(rows[i][10]).match(/\/d\/([^/]+)/)?.[1];
        const oldPdfId = String(rows[i][11]).match(/\/d\/([^/]+)/)?.[1];
        if (oldDocId) DriveApp.getFileById(oldDocId).setTrashed(true);
        if (oldPdfId) DriveApp.getFileById(oldPdfId).setTrashed(true);
      } catch(e) {}
      const ahora = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');
      sheet.getRange(i + 1, 3).setValue(ahora);
      sheet.getRange(i + 1, 8).setValue(data.precioTotal);
      sheet.getRange(i + 1, 10).setValue('ACTUALIZADO');
      sheet.getRange(i + 1, 11).setValue(resultado.docUrl);
      sheet.getRange(i + 1, 12).setValue(resultado.pdfUrl || '');
      sheet.getRange(i + 1, 14).setValue(JSON.stringify(data));
      return;
    }
  }
}

function registrarContrato(data) {
  const sheet = getSysSheet().getSheetByName('CONTRATOS');
  if (!sheet) throw new Error('Hoja CONTRATOS no existe. Ejecutá setupSistema() en el editor de Apps Script.');
  const ahora = Utilities.formatDate(new Date(), 'America/Argentina/Buenos_Aires', 'dd/MM/yyyy HH:mm');

  sheet.appendRow([
    data.numero,
    data.tipo,
    ahora,
    data.clientePrincipal,
    data.cliente2 || '',
    data.fechaEvento,
    data.lugar,
    data.precioTotal,
    data.cuotas || '',
    'GENERADO',
    data.docUrl,
    data.pdfUrl || '',
    '',
    JSON.stringify(data.formData || {})
  ]);
}

// ──── Upload PDF de contrato a Drive ────

function subirContratoPDF(base64, nombre, driveClienteId, clienteNombre) {
  var bytes = Utilities.base64Decode(base64);
  var blob  = Utilities.newBlob(bytes, 'application/pdf', nombre || 'contrato.pdf');

  var folder;
  var newFolderId = null;

  if (driveClienteId) {
    try { folder = DriveApp.getFolderById(driveClienteId); } catch(e) {}
  }

  if (!folder) {
    var rootId = PropertiesService.getScriptProperties().getProperty('DRIVE_ROOT_ID');
    var rootFolder;
    try { rootFolder = rootId ? DriveApp.getFolderById(rootId) : DriveApp.getRootFolder(); } catch(e) { rootFolder = DriveApp.getRootFolder(); }
    // Crear subcarpeta con el nombre del cliente
    var folderName = clienteNombre || ('Cliente ' + new Date().getTime());
    folder = rootFolder.createFolder(folderName);
    folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    newFolderId = folder.getId();
  }

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: file.getUrl(), fileId: file.getId(), newFolderId: newFolderId };
}

// ──── Borrar archivos de Drive (llamado desde Worker al eliminar contrato de D1) ────

function trashFiles(docId, pdfId) {
  try {
    if (docId) DriveApp.getFileById(docId).setTrashed(true);
    if (pdfId) DriveApp.getFileById(pdfId).setTrashed(true);
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
}

// ──── Mover archivo a otra carpeta (usado para reubicar doc/PDF de contrato) ────

function moverArchivoACarpeta(fileId, carpetaId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var dest = DriveApp.getFolderById(carpetaId);
    if (file.isTrashed()) file.setTrashed(false);
    var parents = file.getParents();
    while (parents.hasNext()) { parents.next().removeFile(file); }
    dest.addFile(file);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.toString() }; }
}

// ──── Gestión de calendarios ────

function createKuerreCalendar() {
  var cal = CalendarApp.createCalendar('Kuerre');
  Logger.log('ID: ' + cal.getId());
  return { id: cal.getId(), name: cal.getName() };
}

function listCalendars() {
  CalendarApp.getAllCalendars().forEach(function(c) {
    Logger.log(c.getName() + ' → ' + c.getId() + (c.isMyPrimaryCalendar() ? ' [PRIMARY]' : ''));
  });
}

function getCalendars() {
  return CalendarApp.getAllCalendars().map(function(c) {
    return { id: c.getId(), name: c.getName(), isDefault: c.isMyPrimaryCalendar() };
  });
}

// ──── Sincronización Google Calendar ────

function syncCalendar(events, calendarId) {
  var cal = calendarId
    ? CalendarApp.getCalendarById(calendarId)
    : CalendarApp.getDefaultCalendar();
  if (!cal) cal = CalendarApp.getDefaultCalendar();
  var synced = 0;

  events.forEach(function(ev) {
    if (!ev.fecha) return;
    try {
      var partes = ev.fecha.split('-');
      var horaParts = (ev.hora || '09:00').split(':');
      var inicio = new Date(
        parseInt(partes[0]),
        parseInt(partes[1]) - 1,
        parseInt(partes[2]),
        parseInt(horaParts[0]) || 9,
        parseInt(horaParts[1]) || 0
      );
      var fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
      var descripcion = ev.nombre + (ev.lugar ? '\n📍 ' + ev.lugar : '');

      // Evitar duplicados: buscar por título en el mismo día
      var existentes = cal.getEventsForDay(inicio, { search: ev.titulo });
      if (existentes.length === 0) {
        cal.createEvent(ev.titulo, inicio, fin, {
          description: descripcion,
          location: ev.lugar || ''
        });
        synced++;
      }
    } catch(e) {
      Logger.log('Error sync evento: ' + JSON.stringify(ev) + ' — ' + e.message);
    }
  });

  return { ok: true, synced: synced, total: events.length };
}

// ──── Sync bidireccional Google Calendar ────

function _calGet(calendarId) {
  var cal = calendarId ? CalendarApp.getCalendarById(calendarId) : CalendarApp.getDefaultCalendar();
  return cal || CalendarApp.getDefaultCalendar();
}

function _calInicio(fecha, hora) {
  var p = fecha.split('-');
  var h = (hora || '09:00').split(':');
  return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]), parseInt(h[0]) || 9, parseInt(h[1]) || 0);
}

function _fmtFecha(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function _fmtHora(d) {
  return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
}

function upsertCalendarEvent(ev, calendarId) {
  var cal = _calGet(calendarId);
  var inicio = _calInicio(ev.fecha, ev.hora);
  var fin = new Date(inicio.getTime() + 2 * 60 * 60 * 1000);
  var existente = null;
  if (ev.gcal_id) {
    try { existente = cal.getEventById(ev.gcal_id); } catch (e) {}
  }
  if (!existente) {
    // Adoptar evento legacy creado por el syncCalendar viejo (mismo título, mismo día).
    // Comparación exacta en JS: el param {search} de getEventsForDay falla con títulos con emoji.
    var candidatos = cal.getEventsForDay(inicio).filter(function(x){ return x.getTitle() === ev.titulo; });
    if (candidatos.length) existente = candidatos[0];
  }
  if (existente) {
    existente.setTitle(ev.titulo);
    existente.setTime(inicio, fin);
    existente.setLocation(ev.lugar || '');
    return { ok: true, gcal_id: existente.getId() };
  }
  var nuevo = cal.createEvent(ev.titulo, inicio, fin, { location: ev.lugar || '' });
  return { ok: true, gcal_id: nuevo.getId() };
}

function deleteCalendarEvent(gcalId, calendarId) {
  var cal = _calGet(calendarId);
  try {
    var ev = cal.getEventById(gcalId);
    if (ev) ev.deleteEvent();
  } catch (e) {}
  return { ok: true };
}

function fullSyncCalendar(payload) {
  var cal = _calGet(payload.calendarId);
  var system = payload.system || [];
  var knownExternal = payload.known_external_ids || [];
  var created = [], deleted = [], moved = [];
  var externalsNew = [], externalsUpdated = [], externalsGone = [];
  var systemIds = {};

  system.forEach(function(ev) {
    try {
      if (!ev.gcal_id) {
        var r = upsertCalendarEvent(ev, payload.calendarId);
        created.push({ key: ev.key, gcal_id: r.gcal_id });
        systemIds[r.gcal_id] = true;
        return;
      }
      systemIds[ev.gcal_id] = true;
      var gEv = null;
      try { gEv = cal.getEventById(ev.gcal_id); } catch (e) {}
      if (!gEv) { deleted.push(ev.key); return; }
      var f = _fmtFecha(gEv.getStartTime());
      var h = gEv.isAllDayEvent() ? '' : _fmtHora(gEv.getStartTime());
      if (f !== ev.fecha || (h && ev.hora && h !== ev.hora)) {
        moved.push({ key: ev.key, fecha: f, hora: h || ev.hora });
      }
    } catch (e) {
      Logger.log('fullSync system error ' + ev.key + ': ' + e.message);
    }
  });

  var knownSet = {};
  knownExternal.forEach(function(gid) {
    knownSet[gid] = true;
    var gEv = null;
    try { gEv = cal.getEventById(gid); } catch (e) {}
    if (!gEv) { externalsGone.push(gid); return; }
    externalsUpdated.push({
      gcal_id: gid,
      titulo: gEv.getTitle(),
      fecha: _fmtFecha(gEv.getStartTime()),
      hora: gEv.isAllDayEvent() ? '' : _fmtHora(gEv.getStartTime()),
      lugar: gEv.getLocation() || ''
    });
  });

  var hoy = new Date();
  var desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  var hasta = new Date(hoy.getFullYear() + 2, hoy.getMonth(), 1);
  var vistos = {};
  cal.getEvents(desde, hasta).forEach(function(gEv) {
    var gid = gEv.getId();
    if (systemIds[gid] || knownSet[gid] || vistos[gid]) return;
    vistos[gid] = true;
    externalsNew.push({
      gcal_id: gid,
      titulo: gEv.getTitle(),
      fecha: _fmtFecha(gEv.getStartTime()),
      hora: gEv.isAllDayEvent() ? '' : _fmtHora(gEv.getStartTime()),
      lugar: gEv.getLocation() || ''
    });
  });

  return { ok: true, created: created, deleted: deleted, moved: moved, externals_new: externalsNew, externals_updated: externalsUpdated, externals_gone: externalsGone };
}
