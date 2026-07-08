// ═══════════════════════════════════════════
// Config.gs — Constantes y helpers globales
// ═══════════════════════════════════════════

// Variables de contexto por request (permiten multi-proyecto con un solo GAS)
var _sysSheetId    = null;
var _presupuestosId = null;

const CFG = {
  PRESUPUESTOS_ID: '',
  DRIVE_ROOT_ID:   '1te7B-sW6T-OzZepaUQe8kD2SiIdQsEzb',

  PRESTADOR: {
    nombre:    'Cristian Romero',
    dni:       '31.166.716',
    empresa:   'KUERRE',
    domicilio: 'Cuba 1691, Villa Luzuriaga',
    telefono:  '11-6255-7763',
    email:     'cristian.romero.digital@gmail.com',
    ciudad:    'Morón, Provincia de Buenos Aires'
  },

  MESES: ['enero','febrero','marzo','abril','mayo','junio',
          'julio','agosto','septiembre','octubre','noviembre','diciembre'],

  // Color azul institucional (igual al de los contratos)
  BLUE: '#1565C0'
};

// ──── Helpers de acceso a datos ────

function getSysSheet() {
  const id = _sysSheetId || PropertiesService.getScriptProperties().getProperty('SYSTEM_SHEET_ID');
  if (!id) throw new Error('Sistema no inicializado. Ejecuta setupSistema() primero.');
  return SpreadsheetApp.openById(id);
}

function getConfigValue(key) {
  const data = getSysSheet().getSheetByName('CONFIG').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return String(data[i][1] || '');
  }
  return '';
}

function setConfigValue(key, value) {
  const sheet = getSysSheet().getSheetByName('CONFIG');
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

// ──── Helpers de formato ────

function fechaLarga(dateStr) {
  // dateStr esperado: 'YYYY-MM-DD'
  const parts = dateStr.split('-');
  const d = parseInt(parts[2], 10);
  const m = parseInt(parts[1], 10) - 1;
  const y = parts[0];
  return `${d} de ${CFG.MESES[m]} de ${y}`;
}

function formatMoney(n) {
  const num = Number(n);
  return '$' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function numeroALetras(numero) {
  const n = Math.round(Number(numero));

  const unidades  = ['','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve',
                     'diez','once','doce','trece','catorce','quince','dieciséis','diecisiete',
                     'dieciocho','diecinueve'];
  const decenas   = ['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const centenas  = ['','ciento','doscientos','trescientos','cuatrocientos','quinientos',
                     'seiscientos','setecientos','ochocientos','novecientos'];

  function _cent(x) {
    if (x === 0)   return '';
    if (x === 100) return 'cien';
    if (x < 20)    return unidades[x];
    if (x < 100) {
      const d = Math.floor(x / 10), u = x % 10;
      if (d === 2 && u > 0) return 'veinti' + unidades[u];
      return decenas[d] + (u > 0 ? ' y ' + unidades[u] : '');
    }
    const c = Math.floor(x / 100), r = x % 100;
    return centenas[c] + (r > 0 ? ' ' + _cent(r) : '');
  }

  if (n === 0) return 'cero';

  let res = '', resto = n;

  if (resto >= 1000000) {
    const m = Math.floor(resto / 1000000);
    res += m === 1 ? 'un millón' : _cent(m) + ' millones';
    resto %= 1000000;
    if (resto > 0) res += ' ';
  }
  if (resto >= 1000) {
    const miles = Math.floor(resto / 1000);
    res += miles === 1 ? 'mil' : _cent(miles) + ' mil';
    resto %= 1000;
    if (resto > 0) res += ' ';
  }
  if (resto > 0) res += _cent(resto);

  return res.trim() + ' pesos argentinos';
}

// ──── Helpers de documento ────

function _p(body, text, opts = {}) {
  const para = body.appendParagraph(text);
  if (opts.heading) para.setHeading(opts.heading);
  if (opts.align)   para.setAlignment(opts.align);
  const txt = para.editAsText();
  txt.setBold(opts.bold || false);
  txt.setForegroundColor('#000000');
  if (opts.size) txt.setFontSize(opts.size);
  if (opts.font) txt.setFontFamily(opts.font);
  return para;
}

function _sectionTitle(body, text) {
  const para = body.appendParagraph(text);
  para.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const txt = para.editAsText();
  txt.setBold(true);
  txt.setForegroundColor('#000000');
  txt.setFontSize(11);
  return para;
}

function _bold(body, text) {
  const para = body.appendParagraph(text);
  para.editAsText().setBold(true);
  return para;
}

function _normal(body, text) {
  const para = body.appendParagraph(text);
  const txt = para.editAsText();
  txt.setForegroundColor('#000000');
  txt.setBold(false);
  return para;
}

function _bullet(body, text) {
  const item = body.appendListItem(text);
  item.setGlyphType(DocumentApp.GlyphType.BULLET);
  item.editAsText().setForegroundColor('#000000').setBold(false);
  return item;
}

function _hr(body) {
  return body.appendHorizontalRule();
}

function _insertLogo(body) {
  const logoId = getConfigValue('LOGO_DRIVE_FILE_ID');
  if (!logoId) return;
  try {
    const blob  = DriveApp.getFileById(logoId).getBlob();
    const para  = body.appendParagraph('');
    para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    const img   = para.appendInlineImage(blob);
    img.setWidth(90).setHeight(90);
  } catch (e) {
    Logger.log('Logo no disponible: ' + e.message);
  }
}
