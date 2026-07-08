// ═══════════════════════════════════════════
// Setup.gs — Inicialización única del sistema
// Ejecutar UNA sola vez: setupSistema()
// ═══════════════════════════════════════════

function setupSistema() {
  Logger.log('=== INICIANDO SETUP ===');

  // 1. Crear spreadsheet del sistema
  const ss = SpreadsheetApp.create('Sistema de Contratos — KUERRE');
  const id = ss.getId();
  PropertiesService.getScriptProperties().setProperty('SYSTEM_SHEET_ID', id);
  Logger.log('Sheet creado: ' + ss.getUrl());

  // 2. Crear hojas
  _crearHojaContratos(ss);
  _crearHojaNumeracion(ss);
  _crearHojaClausulas(ss);
  _crearHojaConfig(ss);
  _crearHojaSolicitudes(ss);
  const hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1) ss.deleteSheet(hoja1);

  // 3. Crear carpetas en Drive
  const carpetas = _crearCarpetas();

  // 4. Actualizar CONFIG con IDs de carpetas
  _insertConfigValue(ss, 'CARPETA_BODAS_ID',  carpetas.BODA);
  _insertConfigValue(ss, 'CARPETA_XV_ID',     carpetas.XV);
  _insertConfigValue(ss, 'CARPETA_CUMPLE_ID', carpetas.CUMPLE);

  // 5. Mover el sheet a Drive raíz del proyecto
  DriveApp.getFolderById(CFG.DRIVE_ROOT_ID)
    .addFile(DriveApp.getFileById(id));

  Logger.log('=== SETUP COMPLETO ===');
  Logger.log('SYSTEM_SHEET_ID guardado en PropertiesService.');
  Logger.log('PRÓXIMO PASO: en hoja CONFIG, completar LOGO_DRIVE_FILE_ID con el ID del logo en Drive.');
}

// ──── Hoja CONTRATOS ────

function _crearHojaContratos(ss) {
  const sheet = ss.insertSheet('CONTRATOS', 0);
  const headers = [
    'NUMERO','TIPO','FECHA_GENERACION',
    'CLIENTE_PRINCIPAL','CLIENTE_2_O_QUINCEANERA',
    'FECHA_EVENTO','SALON_LUGAR',
    'PRECIO_TOTAL','CUOTAS','ESTADO',
    'LINK_DOC','LINK_PDF','NOTAS'
  ];
  const hRow = sheet.getRange(1, 1, 1, headers.length);
  hRow.setValues([headers]);
  hRow.setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 70);
  sheet.setColumnWidth(2, 80);
  sheet.setColumnWidth(4, 180);
  sheet.setColumnWidth(11, 300);
  sheet.setColumnWidth(12, 300);
}

// ──── Hoja NUMERACION ────

function _crearHojaNumeracion(ss) {
  const sheet = ss.insertSheet('NUMERACION');
  sheet.getRange('A1:B1').setValues([['TIPO','ULTIMO_NUMERO']]);
  sheet.getRange('A1:B1').setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold');
  // Numeración propia de KUERRE — arranca en 1001
  sheet.getRange('A2:B4').setValues([
    ['BODA',  1000],
    ['XV',    1000],
    ['CUMPLE', 1000]
  ]);
}

// ──── Hoja CLAUSULAS ────

function _crearHojaClausulas(ss) {
  const sheet = ss.insertSheet('CLAUSULAS');
  const headers = ['ID','TIPO','ORDEN','TITULO','CUERPO','ACTIVO'];
  sheet.getRange(1, 1, 1, 6).setValues([headers]);
  sheet.getRange(1, 1, 1, 6).setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(4, 200);
  sheet.setColumnWidth(5, 500);

  const clausulas = _clausulasIniciales();
  sheet.getRange(2, 1, clausulas.length, 6).setValues(clausulas);
}

function _clausulasIniciales() {
  // Extraídas textualmente de los contratos reales
  return [
    // ── CLÁUSULAS BODA ──
    ['CL_B01','BODA', 5,'PLAZOS DE ENTREGA',
     'El material final será entregado en formato digital en un plazo estimado de 30 a 45 días corridos posteriores a la fecha del evento. Dicho plazo podrá extenderse por causas de fuerza mayor debidamente justificadas.',
     true],
    ['CL_B02','BODA', 7,'CANCELACIÓN Y REPROGRAMACIÓN',
     'En caso de cancelación por parte de LOS CONTRATANTES, la seña abonada no será reembolsable.\nSi el evento fuera reprogramado y EL PRESTADOR no se encontrará disponible en la nueva fecha, éste podrá ofrecer un profesional alternativo de similares características o reintegrar los importes abonados, a su criterio.',
     true],
    ['CL_B03','BODA', 8,'FUERZA MAYOR',
     'EL PRESTADOR no será responsable por incumplimientos derivados de causas de fuerza mayor, tales como enfermedad, accidentes, condiciones climáticas extremas o hechos imprevisibles. En dichos casos, se compromete a buscar una solución profesional cuando sea posible.',
     true],
    ['CL_B04','BODA', 9,'DERECHOS DE AUTOR Y USO DE IMAGEN',
     'El material fotográfico y audiovisual es propiedad intelectual del PRESTADOR. LOS CONTRATANTES reciben derecho de uso personal y no comercial del material entregado. EL PRESTADOR podrá utilizar las imágenes y videos con fines de portfolio, redes sociales y difusión profesional, salvo negativa expresa por escrito por parte de LOS CONTRATANTES.',
     true],
    ['CL_B05','BODA',10,'CONDICIONES DE TRABAJO',
     'LOS CONTRATANTES se comprometen a:\n• Garantizar el acceso a las locaciones.\n• Facilitar el normal desarrollo del trabajo.\n• Designar un responsable durante el evento.\n• Evitar interferencias de terceros durante la cobertura.\n\nEL PRESTADOR no se responsabiliza por resultados afectados por iluminación deficiente, restricciones del lugar, comportamiento de invitados, uso de celulares u otros profesionales no coordinados.',
     true],
    ['CL_B06','BODA',11,'ILUMINACIÓN LÁSER',
     'Por razones de seguridad técnica, en caso de utilizarse luces láser durante la fiesta, EL PRESTADOR podrá suspender temporal o definitivamente la cobertura, a fin de proteger los sensores del equipo, sin que ello genere derecho a reclamo alguno.',
     true],
    ['CL_B07','BODA',12,'ACEPTACIÓN DEL ESTILO',
     'LOS CONTRATANTES declaran conocer y aceptar el estilo fotográfico y audiovisual, criterio de selección, edición, encuadre y narrativa visual del PRESTADOR. Queda prohibida la edición, modificación o alteración del material entregado.',
     true],

    // ── CLÁUSULAS XV ──
    ['CL_X01','XV', 4,'CANCELACIÓN',
     'En caso de cancelación por parte del CLIENTE, los montos abonados hasta el momento no serán reembolsables, ya que corresponden a la reserva de la fecha y planificación del servicio.\n\nSi EL PRESTADOR no pudiera cumplir con el servicio por causas de fuerza mayor, se reintegrará el dinero abonado o se ofrecerá un profesional alternativo para cubrir el evento, de común acuerdo con EL CLIENTE.',
     true],
    ['CL_X02','XV', 5,'DERECHOS DE IMAGEN Y VIDEO',
     'EL PRESTADOR se reserva el derecho de utilizar las imágenes y videos del evento en su portafolio profesional, redes sociales y material promocional, salvo que EL CLIENTE indique expresamente por escrito que no autoriza su difusión.\n\nLas imágenes y videos seguirán siendo propiedad intelectual del prestador, aunque EL CLIENTE recibe los derechos de uso personal del material entregado.',
     true],
    ['CL_X03','XV', 6,'OBLIGACIONES DEL CLIENTE',
     'EL CLIENTE se compromete a:\n• Brindar información precisa y completa sobre el evento.\n• Garantizar acceso al lugar del evento.\n• Facilitar la labor del prestador durante el evento.\n• Informar cualquier restricción o requerimiento especial relacionado con la cobertura fotográfica o audiovisual.',
     true],
    ['CL_X04','XV', 7,'PLAZOS DE ENTREGA',
     'El plazo estimado de entrega del material final será de 30 a 45 días posteriores al evento.\n\nEste plazo puede extenderse en temporadas de alta demanda o por situaciones ajenas al prestador.',
     true],
    ['CL_X05','XV', 8,'USO DE LUCES LÁSER',
     'En caso de que durante el evento se utilicen luces láser de alta potencia por parte del DJ o proveedores de iluminación, EL PRESTADOR se reserva el derecho de apagar temporalmente sus equipos cuando dichas luces estén encendidas.\n\nEsta medida se toma para proteger los sensores de los equipos profesionales, los cuales pueden sufrir daños permanentes por exposición directa a rayos láser.\n\nEsta situación no será considerada incumplimiento del servicio.',
     true],
    ['CL_X06','XV', 9,'INTERFERENCIAS DURANTE EL EVENTO',
     'EL PRESTADOR no será responsable por la pérdida de determinadas tomas cuando esto sea consecuencia de interferencias de terceros, tales como invitados, proveedores, personal del salón, DJ, iluminadores u otros factores ajenos al control del prestador.',
     true],
    ['CL_X07','XV',10,'FALLAS TÉCNICAS O FUERZA MAYOR',
     'En el improbable caso de que ocurra una falla técnica grave, daño de equipos, pérdida de material o cualquier situación de fuerza mayor que impida la entrega total o parcial del material, la responsabilidad de EL PRESTADOR se limitará únicamente al reintegro del monto abonado por el servicio.',
     true],
    ['CL_X08','XV',11,'MODIFICACIÓN DE HORARIOS',
     'Los horarios del evento se consideran estimativos.\n\nEn caso de retrasos o modificaciones que extiendan la jornada de trabajo más allá de lo previsto, EL PRESTADOR podrá evaluar la extensión del servicio, la cual podrá implicar un costo adicional acordado entre las partes.',
     true],
    ['CL_X09','XV',12,'CONSERVACIÓN DEL MATERIAL',
     'EL PRESTADOR realizará copias de seguridad del material registrado durante el evento por un período aproximado de 6 meses posteriores a la entrega final.\nTranscurrido dicho plazo, EL PRESTADOR no garantiza la conservación del material original ni la posibilidad de recuperar archivos.',
     true],

    // ── CLÁUSULAS CUMPLEAÑOS (base para usar como punto de partida) ──
    ['CL_C01','CUMPLE', 4,'CANCELACIÓN',
     'En caso de cancelación por parte del CLIENTE, los montos abonados hasta el momento no serán reembolsables, ya que corresponden a la reserva de la fecha y planificación del servicio.\n\nSi EL PRESTADOR no pudiera cumplir con el servicio por causas de fuerza mayor, se reintegrará el dinero abonado o se ofrecerá un profesional alternativo para cubrir el evento, de común acuerdo con EL CLIENTE.',
     true],
    ['CL_C02','CUMPLE', 5,'DERECHOS DE IMAGEN Y VIDEO',
     'EL PRESTADOR se reserva el derecho de utilizar las imágenes y videos del evento en su portafolio profesional, redes sociales y material promocional, salvo que EL CLIENTE indique expresamente por escrito que no autoriza su difusión.',
     true],
    ['CL_C03','CUMPLE', 6,'PLAZOS DE ENTREGA',
     'El plazo estimado de entrega del material final será de 30 a 45 días posteriores al evento. Este plazo puede extenderse en temporadas de alta demanda o por situaciones ajenas al prestador.',
     true],
    ['CL_C04','CUMPLE', 7,'FALLAS TÉCNICAS O FUERZA MAYOR',
     'En el improbable caso de que ocurra una falla técnica grave, daño de equipos, pérdida de material o cualquier situación de fuerza mayor que impida la entrega total o parcial del material, la responsabilidad de EL PRESTADOR se limitará únicamente al reintegro del monto abonado por el servicio.',
     true],
    ['CL_C05','CUMPLE', 8,'ILUMINACIÓN LÁSER',
     'Por razones de seguridad técnica, en caso de utilizarse luces láser durante el evento, EL PRESTADOR podrá suspender temporal o definitivamente la cobertura, a fin de proteger los sensores del equipo, sin que ello genere derecho a reclamo alguno.',
     true],
  ];
}

// ──── Hoja CONFIG ────

function _crearHojaSolicitudes(ss) {
  const sheet = ss.insertSheet('SOLICITUDES');
  const headers = ['ID','TIPO','FECHA','ESTADO','CLIENTE','DATA_JSON'];
  sheet.getRange(1, 1, 1, 6).setValues([headers]);
  sheet.getRange(1, 1, 1, 6).setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(6, 600);
}

function _crearHojaConfig(ss) {
  const sheet = ss.insertSheet('CONFIG');
  sheet.getRange('A1:B1').setValues([['CLAVE','VALOR']]);
  sheet.getRange('A1:B1').setBackground('#000000').setFontColor('#ffffff').setFontWeight('bold');
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 350);

  const config = [
    ['LOGO_DRIVE_FILE_ID',   ''],  // ← COMPLETAR con ID del logo
    ['CARPETA_BODAS_ID',     ''],
    ['CARPETA_XV_ID',        ''],
    ['CARPETA_CUMPLE_ID',    ''],
    ['SENA_PORCENTAJE',      '30'],
    ['SALDO_PORCENTAJE',     '70'],
    ['DIAS_ENTREGA_MIN',     '30'],
    ['DIAS_ENTREGA_MAX',     '45'],
  ];
  sheet.getRange(2, 1, config.length, 2).setValues(config);
}

function _insertConfigValue(ss, key, value) {
  const sheet = ss.getSheetByName('CONFIG');
  const data  = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
}

// ──── Carpetas Drive ────

function _crearCarpetas() {
  const root   = DriveApp.getFolderById(CFG.DRIVE_ROOT_ID);
  const result = {};

  [['BODA','Contratos — Bodas'], ['XV','Contratos — XV'], ['CUMPLE','Contratos — Cumpleaños']]
    .forEach(([key, nombre]) => {
      const iter = root.getFoldersByName(nombre);
      const folder = iter.hasNext() ? iter.next() : root.createFolder(nombre);
      result[key] = folder.getId();
      Logger.log(`Carpeta "${nombre}": ${folder.getId()}`);
    });

  return result;
}
