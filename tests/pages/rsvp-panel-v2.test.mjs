// Panel RSVP: selección fácil de tocar, orden por fila, agregar invitado y
// eliminar definitivamente desde la papelera.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser } from '../helpers/browser.mjs';

let srv, br;
const ROWS = ['Ana', 'Bruno', 'Carla', 'Dante'].map((n, i) => ({ id: i + 1, nombre: n, apellido: 'X', asistencia: 'si', mesa: i === 0 ? 3 : null, restricciones: '', mensaje: '', created_at: '2026-10-0' + (i + 1) + ' 10:00:00', modificado_at: null }));
before(async () => {
  srv = await serve(); br = await openBrowser({ mobile: true });
  await br.beforeLoad(`(() => {
    let next = 100;
    const rows = ${JSON.stringify(ROWS)}.map(r => ({ ...r, borrado_at: r.id >= 3 ? '2026-10-20 15:00:00' : null }));
    window.__log = { adds: [], purges: [] };
    const real = window.fetch;
    const R = (o, st = 200) => new Response(JSON.stringify(o), { status: st });
    window.fetch = async (u, o = {}) => {
      u = String(u);
      if (u.includes('/add')) { const b = JSON.parse(o.body); __log.adds.push(b); rows.push({ id: next++, ...b, mesa: b.mesa ? Number(b.mesa) : null, created_at: '2026-10-23 12:00:00', modificado_at: null, borrado_at: null }); return R({ ok: true, id: next - 1 }); }
      if (u.includes('/purge')) { const ids = JSON.parse(o.body).ids; __log.purges.push(ids); for (let i = rows.length - 1; i >= 0; i--) if (ids.includes(rows[i].id) && rows[i].borrado_at) rows.splice(i, 1); return R({ ok: true, eliminados: ids.length }); }
      if (u.includes('/rsvp/')) { const a = rows.filter(r => !r.borrado_at); return R({ responses: a, total: a.length, total_si: a.length, total_no: 0, mesas: 20, capacidad: 10, eliminados: rows.filter(r => r.borrado_at) }); }
      if (u.includes('/invite/') || u.includes('/brand')) return R({});
      return real(u, o);
    };
  })();`);
});
after(async () => { await br.close(); srv.close(); });

const abrir = () => br.goto(`${srv.url}/rsvp-panel.html?slug=ev-1-xxxx&t=TOK`, 2000);
const J = async expr => JSON.parse(await br.eval(`JSON.stringify(${expr})`));
const nombres = () => J(`[...document.querySelectorAll('#table-wrap tbody tr')].map(tr => tr.querySelector('.nombre-txt').textContent.trim())`);
const centro = sel => J(`(() => { const e = document.querySelector('${sel}'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; })()`);

test('"Seleccionar todos" va arriba de la tabla y "Fila" es un encabezado más', async () => {
  await abrir();
  const r = await J(`(() => {
    const sel = document.getElementById('sel-todos').closest('label');
    const ths = [...document.querySelectorAll('#table-wrap thead th')];
    const top = el => Math.round(el.getBoundingClientRect().top);
    return { fueraDeTabla: !document.getElementById('table-wrap').contains(sel), texto: sel.textContent.trim(),
             primero: ths[0].textContent.trim(), mismoNivel: ths[0].id === 'sort-fila' && top(ths[0]) === top(ths[1]),
             arriba: sel.getBoundingClientRect().bottom <= ths[0].getBoundingClientRect().top };
  })()`);
  assert.deepEqual(r, { fueraDeTabla: true, texto: 'Seleccionar todos', primero: 'Fila', mismoNivel: true, arriba: true });
});

test('casilla de fila: al menos 20px y se marca tocando el número de la fila', async () => {
  await abrir();
  const c = await centro('#table-wrap tbody tr .sel-fila');
  assert.ok(c.w >= 20 && c.h >= 20, `mide ${c.w}x${c.h}`);
  const n = await centro('#table-wrap tbody tr .num-fila');
  await br.tap(n.x, n.y);
  assert.equal(await J(`document.querySelector('#table-wrap tbody tr .sel-fila').checked`), true);
  assert.match(await J(`document.getElementById('sel-bar').textContent`), /1 seleccionado/);
});

test('ordenar por fila (asc / desc)', async () => {
  await abrir();
  await br.eval(`document.getElementById('sort-fila').click()`);
  assert.match(await J(`document.getElementById('sort-fila').textContent`), /▲/);
  await br.eval(`document.getElementById('sort-fila').click()`);
  assert.deepEqual(await nombres(), ['Bruno X', 'Ana X']);
});

test('agregar invitado: formulario con los datos del RSVP; la mesa solo si asiste', async () => {
  await abrir();
  await br.eval(`document.getElementById('add-btn').click()`);
  assert.equal(await J(`document.getElementById('add-modal').classList.contains('open')`), true);
  await br.eval(`document.getElementById('add-asistencia').value = 'no'; document.getElementById('add-asistencia').dispatchEvent(new Event('change'))`);
  assert.equal(await J(`document.getElementById('add-mesa').disabled`), true);
  await br.eval(`(() => {
    document.getElementById('add-nombre').value = ' Zoe ';
    document.getElementById('add-apellido').value = 'Paz';
    const a = document.getElementById('add-asistencia'); a.value = 'si'; a.dispatchEvent(new Event('change'));
    document.getElementById('add-celiaco').checked = true;
    document.getElementById('add-alergia').value = 'maní';
    document.getElementById('add-mesa').value = '5';
    return saveAdd();
  })()`);
  await br.sleep(400);
  assert.deepEqual(await J(`__log.adds`), [{ nombre: 'Zoe', apellido: 'Paz', asistencia: 'si', restricciones: 'Celíaco/a, Alergia: maní', mesa: 5 }]);
  assert.equal(await J(`document.getElementById('add-modal').classList.contains('open')`), false);
  assert.ok((await nombres()).includes('Zoe Paz'));
});

test('agregar invitado: sin nombre muestra el error y no envía', async () => {
  await abrir();
  const antes = (await J(`__log.adds`)).length;
  await br.eval(`document.getElementById('add-btn').click(); document.getElementById('add-nombre').value = ''; document.getElementById('add-apellido').value = 'Paz'; saveAdd()`);
  await br.sleep(200);
  assert.match(await J(`document.getElementById('add-error').textContent`), /nombre y apellido/i);
  assert.equal((await J(`__log.adds`)).length, antes);
});

test('papelera: elegir todos → eliminar definitivo con aviso; Cancelar no borra', async () => {
  await abrir();
  await br.eval(`document.getElementById('elim-wrap').open = true; document.getElementById('elim-sel-todos').click()`);
  assert.match(await J(`document.getElementById('elim-sel-bar').textContent`), /2 seleccionados/);
  await br.eval(`document.getElementById('elim-purge').click()`);
  assert.match(await J(`document.getElementById('del-texto').textContent`), /no se van a poder restaurar/i);
  assert.match(await J(`document.getElementById('del-lista').textContent`), /Carla X.*Dante X/s);
  await br.eval(`document.getElementById('del-cancelar').click()`); await br.sleep(200);
  assert.deepEqual(await J(`__log.purges`), []);
  await br.eval(`document.getElementById('elim-purge').click()`);
  await br.eval(`document.getElementById('del-ok').click()`); await br.sleep(400);
  assert.deepEqual((await J(`__log.purges`)).at(-1).sort(), [3, 4]);
  assert.equal(await J(`document.getElementById('elim-titulo').textContent`), 'Eliminados (0)');
});

test('papelera: eliminar definitivo de a uno', async () => {
  await abrir();
  await br.eval(`document.getElementById('elim-wrap').open = true; [...document.querySelectorAll('#elim-lista .elim-fila')].find(f => f.textContent.includes('Dante')).querySelector('.elim-purge-fila').click()`);
  assert.match(await J(`document.getElementById('del-texto').textContent`), /1 invitado/);
  await br.eval(`document.getElementById('del-ok').click()`); await br.sleep(400);
  assert.deepEqual((await J(`__log.purges`)).at(-1), [4]);
});
