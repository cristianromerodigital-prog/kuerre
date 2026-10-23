// Panel RSVP: "Deshacer" después de borrar y sección "Eliminados" para restaurar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser } from '../helpers/browser.mjs';

let srv, br;
const ROWS = ['Ana', 'Bruno', 'Carla', 'Dante'].map((n, i) => ({ id: i + 1, nombre: n, apellido: 'X', asistencia: 'si', mesa: null, restricciones: '', mensaje: '', created_at: '2026-10-0' + (i + 1) + ' 10:00:00', modificado_at: null }));
before(async () => {
  srv = await serve(); br = await openBrowser();
  // Worker simulado con estado: borra a la papelera y restaura.
  await br.beforeLoad(`(() => {
    const rows = ${JSON.stringify(ROWS)}.map(r => ({ ...r, borrado_at: r.id === 4 ? '2026-10-20 15:00:00' : null }));
    window.__log = { deletes: [], restores: [] };
    const real = window.fetch;
    const resp = o => new Response(JSON.stringify(o));
    window.fetch = async (u, o = {}) => {
      u = String(u);
      if (u.includes('/delete')) { const ids = JSON.parse(o.body).ids; __log.deletes.push(ids); rows.forEach(r => { if (ids.includes(r.id)) r.borrado_at = '2026-10-23 12:00:00'; }); return resp({ ok: true, borrados: ids.length }); }
      if (u.includes('/restore')) { const ids = JSON.parse(o.body).ids; __log.restores.push(ids); rows.forEach(r => { if (ids.includes(r.id)) r.borrado_at = null; }); return resp({ ok: true, restaurados: ids.length }); }
      if (u.includes('/rsvp/')) { const act = rows.filter(r => !r.borrado_at); return resp({ responses: act, total: act.length, total_si: act.length, total_no: 0, mesas: 20, capacidad: 10, eliminados: rows.filter(r => r.borrado_at) }); }
      if (u.includes('/invite/') || u.includes('/brand')) return resp({});
      return real(u, o);
    };
  })();`);
});
after(async () => { await br.close(); srv.close(); });

const abrir = () => br.goto(`${srv.url}/rsvp-panel.html?slug=ev-1-xxxx&t=TOK`, 2000);
const J = async expr => JSON.parse(await br.eval(`JSON.stringify(${expr})`));
const nombres = () => J(`[...document.querySelectorAll('#table-wrap tbody tr')].map(tr => tr.querySelector('.nombre-txt').textContent.trim())`);
const fila = n => `[...document.querySelectorAll('#table-wrap tbody tr')].find(tr => tr.querySelector('.nombre-txt').textContent.includes('${n}'))`;
const borrar = async n => { await br.eval(`${fila(n)}.querySelector('.del-fila').click()`); await br.eval(`document.getElementById('del-ok').click()`); await br.sleep(400); };

test('sección Eliminados: muestra lo que está en la papelera', async () => {
  await abrir();
  assert.equal(await J(`document.getElementById('elim-titulo').textContent`), 'Eliminados (1)');
  assert.deepEqual(await J(`[...document.querySelectorAll('#elim-lista .elim-fila .elim-nombre')].map(e => e.textContent)`), ['Dante X']);
  assert.match(await J(`document.querySelector('#elim-lista .elim-fila').textContent`), /20\/10\/2026/);
});

test('después de borrar aparece "Deshacer" y lo devuelve a la lista', async () => {
  await abrir();
  await borrar('Bruno');
  assert.deepEqual(await nombres(), ['Ana X', 'Carla X']);
  assert.match(await J(`document.getElementById('undo-toast').textContent`), /Se eliminó 1 invitado/);
  assert.equal(await J(`document.getElementById('undo-toast').classList.contains('on')`), true);
  assert.equal(await J(`document.getElementById('elim-titulo').textContent`), 'Eliminados (2)');
  await br.eval(`document.getElementById('undo-btn').click()`); await br.sleep(400);
  assert.deepEqual(await J(`__log.restores`), [[2]]);
  assert.deepEqual(await nombres(), ['Ana X', 'Bruno X', 'Carla X']);
  assert.equal(await J(`document.getElementById('undo-toast').classList.contains('on')`), false);
});

test('restaurar uno desde Eliminados', async () => {
  await abrir();
  await br.eval(`[...document.querySelectorAll('#elim-lista .elim-fila')].find(f => f.textContent.includes('Dante')).querySelector('.elim-rest').click()`); await br.sleep(400);
  assert.deepEqual((await J(`__log.restores`)).at(-1), [4]);
  assert.ok((await nombres()).includes('Dante X'));
  assert.equal(await J(`document.getElementById('elim-titulo').textContent`), 'Eliminados (0)');
});

test('restaurar todos desde Eliminados', async () => {
  await abrir();
  await borrar('Ana'); await borrar('Carla');
  await br.eval(`document.getElementById('elim-todos').click()`); await br.sleep(400);
  assert.deepEqual((await J(`__log.restores`)).at(-1).sort(), [1, 3, 4], 'incluye a Dante, que ya estaba en la papelera');
  assert.equal((await nombres()).length, 4);
});

test('el aviso de borrar explica que se puede restaurar durante 30 días', async () => {
  await abrir();
  await br.eval(`${fila('Ana')}.querySelector('.del-fila').click()`);
  assert.match(await J(`document.getElementById('del-texto').textContent`), /Eliminados.*30 días/);
  await br.eval(`document.getElementById('del-cancelar').click()`);
});
