// ═══════════════════════════════════════════
// Numbering.gs — Numeración consecutiva
// ═══════════════════════════════════════════

/**
 * Retorna el siguiente número de contrato para el tipo dado
 * y actualiza el registro en la hoja NUMERACION.
 * Usa LockService para evitar duplicados en uso concurrente.
 */
function getNextContractNumber(tipo) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error('No se pudo obtener el lock para numeración. Intentá de nuevo.');
  }

  try {
    const sheet = getSysSheet().getSheetByName('NUMERACION');
    const data  = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === tipo) {
        const siguiente = Number(data[i][1]) + 1;
        sheet.getRange(i + 1, 2).setValue(siguiente);
        return siguiente;
      }
    }
    throw new Error('Tipo de contrato no encontrado en NUMERACION: ' + tipo);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Consulta el último número usado SIN incrementarlo (para preview).
 */
function peekLastNumber(tipo) {
  const data = getSysSheet().getSheetByName('NUMERACION').getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === tipo) return Number(data[i][1]);
  }
  return null;
}
