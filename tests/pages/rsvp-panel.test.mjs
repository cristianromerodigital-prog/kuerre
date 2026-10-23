// Panel RSVP: resumen y filtro por mesa, cupo en el selector, cantidad de mesas y
// conflicto entre dispositivos. El Worker se simula dentro de la página.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser } from '../helpers/browser.mjs';

let srv, br;
before(async () => { srv = await serve(); br = await openBrowser(); });
after(async () => { await br.close(); srv.close(); });

// 150 confirmados con mesa (mesa 1 llena con 10, el resto repartido), 50 confirmados sin mesa, 100 no asisten.
function datos() {
  const rows = []; let id = 1;
  const add = (asistencia, mesa, extra = {}) => rows.push({ id: id++, nombre: 'Inv' + id, apellido: 'X', asistencia, mesa, restricciones: '', mensaje: '', created_at: '2026-10-20 12:00:00', modificado_at: null, ...extra });
  for (let i = 0; i < 10; i++) add('si', 1);
  for (let i = 0; i < 140; i++) add('si', 2 + (i % 19));
  for (let i = 0; i < 50; i++) add('si', null);
  for (let i = 0; i < 100; i++) add('no', i < 5 ? 3 : null);
  return rows;
}

// patchResp: respuesta del PATCH; configResp: respuesta del PUT config.
const mock = ({ patchResp = { status: 200, body: { ok: true } }, configResp = { status: 200, body: { ok: true } } } = {}) => `(() => {
  window.__rows = ${JSON.stringify(datos())};
  window.__log = { gets: 0, patches: [], puts: [], alerts: [] };
  window.alert = m => __log.alerts.push(String(m));
  window.confirm = () => true;
  const real = window.fetch;
  window.fetch = async (u, o = {}) => {
    u = String(u);
    if (u.includes('/rsvp/') && u.includes('/config') && o.method === 'PUT') { __log.puts.push(JSON.parse(o.body)); return new Response(JSON.stringify(${JSON.stringify(configResp.body)}), { status: ${configResp.status} }); }
    if (u.includes('/rsvp/') && o.method === 'PATCH') { __log.patches.push(JSON.parse(o.body)); return new Response(JSON.stringify(${JSON.stringify(patchResp.body)}), { status: ${patchResp.status} }); }
    if (u.includes('/rsvp/')) { __log.gets++; return new Response(JSON.stringify({ responses: JSON.parse(JSON.stringify(__rows)), total: __rows.length, total_si: 200, total_no: 100, mesas: 20, capacidad: 10 }), { status: 200 }); }
    if (u.includes('/invite/') || u.includes('/brand')) return new Response('{}', { status: 200 });
    return real(u, o);
  };
})();`;
const abrir = async opts => { await br.beforeLoad(mock(opts)); await br.goto(`${srv.url}/rsvp-panel.html?slug=barack-21-11-2026-4tdb&t=TOK`, 2500); };
const J = async expr => JSON.parse(await br.eval(`JSON.stringify(${expr})`));
const setSelect = (rowIdx, col, value) => br.eval(`(() => { const s = document.querySelectorAll('#table-wrap tbody tr')[${rowIdx}].querySelectorAll('select')[${col}]; s.value = '${value}'; s.dispatchEvent(new Event('change')); })()`).then(() => br.sleep(300));

test('resumen por mesa: chips con ocupación y "Sin mesa"', async () => {
  await abrir();
  const chips = await J(`[...document.querySelectorAll('#mesas-chips .mesa-chip')].map(c => c.textContent)`);
  assert.ok(chips.includes('Sin mesa (50)'), chips.join(' | '));
  assert.ok(chips.includes('Mesa 1 · 10/10'));
  const suma = chips.map(c => /· (\d+)\/10/.exec(c)).filter(Boolean).reduce((a, m) => a + Number(m[1]), 0);
  assert.equal(suma, 150, 'los que no asisten no ocupan lugar');
  assert.equal(chips.filter(c => c.startsWith('Mesa ')).length, 20);
  assert.equal(await J(`document.querySelector('#mesas-chips .mesa-chip.llena').textContent`), 'Mesa 1 · 10/10');
});

test('filtrar por mesa y por "Sin mesa"', async () => {
  await abrir();
  await br.eval(`[...document.querySelectorAll('#mesas-chips .mesa-chip')].find(c => c.textContent.startsWith('Mesa 3 ')).click()`);
  const mesas = await J(`[...document.querySelectorAll('#table-wrap tbody tr')].map(tr => tr.querySelectorAll('select')[1].value)`);
  assert.ok(mesas.length > 0 && mesas.every(m => m === '3'), mesas.join(','));
  await br.eval(`[...document.querySelectorAll('#mesas-chips .mesa-chip')].find(c => c.textContent.startsWith('Sin mesa')).click()`);
  assert.equal(await J(`document.querySelectorAll('#table-wrap tbody tr.sin-mesa').length`), 50);
  assert.equal(await J(`document.querySelectorAll('#table-wrap tbody tr').length`), 50);
  await br.eval(`[...document.querySelectorAll('#mesas-chips .mesa-chip')].find(c => c.textContent === 'Todas').click()`);
  assert.equal(await J(`document.querySelectorAll('#table-wrap tbody tr').length`), 300);
});

test('selector de mesa muestra el cupo y bloquea las llenas salvo la propia', async () => {
  await abrir();
  const opts = await J(`(() => {
    const filas = [...document.querySelectorAll('#table-wrap tbody tr')];
    const opt1 = tr => [...tr.querySelectorAll('select')[1].options].find(o => o.value === '1');
    return { propia: opt1(filas[0]).disabled, otra: opt1(filas[200]).disabled, texto: opt1(filas[200]).textContent };
  })()`);
  assert.deepEqual(opts, { propia: false, otra: true, texto: 'Mesa 1 (10/10)' });
});

test('al asignar mesa se manda prev y se actualizan los chips', async () => {
  await abrir();
  await setSelect(150, 1, '20');   // primer confirmado sin mesa → mesa 20
  const log = await J(`__log.patches`);
  assert.deepEqual(log[0], { mesa: '20', prev: { asistencia: 'si', mesa: null } });
  const chips = await J(`[...document.querySelectorAll('#mesas-chips .mesa-chip')].map(c => c.textContent)`);
  assert.ok(chips.includes('Sin mesa (49)'), chips.join(' | '));
});

test('conflicto: avisa y recarga la lista sin pisar', async () => {
  await abrir({ patchResp: { status: 409, body: { error: 'conflicto', mensaje: 'Otra persona cambió a este invitado mientras editabas', actual: { asistencia: 'no', mesa: null } } } });
  await setSelect(150, 1, '20');
  await br.sleep(300);
  const log = await J(`__log`);
  assert.equal(log.gets, 2, 'recarga la lista');
  assert.match(log.alerts[0], /Otra persona cambió a Inv\d+ X mientras editabas/);
});

test('mesa llena: muestra el mensaje del Worker', async () => {
  await abrir({ patchResp: { status: 409, body: { error: 'mesa_llena', mensaje: 'La mesa 2 ya tiene 10 invitados' } } });
  await setSelect(150, 1, '2');
  assert.match((await J(`__log.alerts`))[0], /La mesa 2 ya tiene 10 invitados/);
});

test('cantidad de mesas: guarda y, si hay mesas ocupadas, muestra cuáles', async () => {
  await abrir({ configResp: { status: 409, body: { error: 'mesas_ocupadas', mensaje: 'Hay invitados sentados en las mesas 15, 18', mesas: [15, 18] } } });
  assert.equal(await J(`document.getElementById('mesas-cant').value`), '20');
  await br.eval(`document.getElementById('mesas-cant').value = '14'; saveMesas()`); await br.sleep(300);
  const log = await J(`__log`);
  assert.deepEqual(log.puts, [{ mesas: 14 }]);
  assert.match(log.alerts[0], /mesas 15, 18/);
  assert.equal(await J(`document.querySelectorAll('#mesas-chips .mesa-chip').length`), 22, 'sigue con 20 mesas + Todas + Sin mesa');
});

test('cantidad de mesas aceptada: el selector y los chips pasan a 25', async () => {
  await abrir();
  await br.eval(`document.getElementById('mesas-cant').value = '25'; saveMesas()`); await br.sleep(300);
  assert.equal(await J(`document.querySelectorAll('#mesas-chips .mesa-chip').length`), 27);
  assert.equal(await J(`document.querySelectorAll('#table-wrap tbody tr')[150].querySelectorAll('select')[1].options.length`), 26);
});

test('filtro de mesas como desplegable; la grilla de ocupación arranca cerrada', async () => {
  await abrir();
  const r = await J(`({
    opciones: [...document.getElementById('mesa-filtro').options].map(o => o.textContent),
    cerrado: !document.getElementById('mesas-detalle').open
  })`);
  assert.equal(r.cerrado, true);
  assert.equal(r.opciones.length, 22);
  assert.deepEqual(r.opciones.slice(0, 3), ['Todas las mesas', 'Sin mesa (50)', 'Mesa 1 · 10/10 · llena']);
  await br.eval(`(() => { const s = document.getElementById('mesa-filtro'); s.value = '3'; s.dispatchEvent(new Event('change')); })()`);
  const mesas = await J(`[...document.querySelectorAll('#table-wrap tbody tr')].map(tr => tr.querySelectorAll('select')[1].value)`);
  assert.ok(mesas.length > 0 && mesas.every(m => m === '3'));
  // el chip y el desplegable muestran el mismo filtro
  assert.equal(await J(`document.querySelector('#mesas-chips .mesa-chip.active').textContent.startsWith('Mesa 3 ')`), true);
});
