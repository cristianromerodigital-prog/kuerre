// Panel RSVP: borrar una fila, varias o todas, siempre con aviso para cancelar o aceptar.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser } from '../helpers/browser.mjs';

let srv, br;
const ROWS = ['Ana', 'Bruno', 'Carla', 'Dante', 'Elena'].map((n, i) => ({ id: i + 1, nombre: n, apellido: 'X', asistencia: i < 3 ? 'si' : 'no', mesa: null, restricciones: i === 0 ? 'Vegano/a' : '', mensaje: '', created_at: '2026-10-0' + (i + 1) + ' 10:00:00', modificado_at: null }));
before(async () => {
  srv = await serve(); br = await openBrowser();
  await br.beforeLoad(`(() => {
    const rows = ${JSON.stringify(ROWS)};
    window.__borrados = [];
    const real = window.fetch;
    window.fetch = async (u, o = {}) => {
      u = String(u);
      if (u.includes('/delete') && o.method === 'POST') { const b = JSON.parse(o.body); window.__borrados.push(b.ids); return new Response(JSON.stringify({ ok: true, borrados: b.ids.length })); }
      if (u.includes('/rsvp/')) return new Response(JSON.stringify({ responses: rows, total: 5, total_si: 3, total_no: 2, mesas: 20, capacidad: 10 }));
      if (u.includes('/invite/') || u.includes('/brand')) return new Response('{}');
      return real(u, o);
    };
  })();`);
});
after(async () => { await br.close(); srv.close(); });

const abrir = () => br.goto(`${srv.url}/rsvp-panel.html?slug=ev-1-xxxx&t=TOK`, 2000);
const J = async expr => JSON.parse(await br.eval(`JSON.stringify(${expr})`));
const nombres = () => J(`[...document.querySelectorAll('#table-wrap tbody tr')].map(tr => tr.querySelector('.nombre-txt').textContent.trim())`);
const fila = n => `[...document.querySelectorAll('#table-wrap tbody tr')].find(tr => tr.querySelector('.nombre-txt').textContent.includes('${n}'))`;
const aviso = () => J(`({ abierto: document.getElementById('del-modal').classList.contains('open'), texto: document.getElementById('del-texto').textContent, lista: document.getElementById('del-lista').textContent })`);

test('borrar una fila: aviso → Cancelar no borra nada', async () => {
  await abrir();
  await br.eval(`${fila('Bruno')}.querySelector('.del-fila').click()`);
  const a = await aviso();
  assert.equal(a.abierto, true);
  assert.match(a.texto, /1 invitado/);
  assert.match(a.lista, /Bruno X/);
  await br.eval(`document.getElementById('del-cancelar').click()`); await br.sleep(200);
  assert.equal((await aviso()).abierto, false);
  assert.deepEqual(await J(`window.__borrados`), []);
  assert.equal((await nombres()).length, 5);
});

test('borrar una fila: aviso → Eliminar la borra y actualiza contadores y catering', async () => {
  await abrir();
  await br.eval(`${fila('Ana')}.querySelector('.del-fila').click()`);
  await br.eval(`document.getElementById('del-ok').click()`); await br.sleep(300);
  assert.deepEqual(await J(`window.__borrados`), [[1]]);
  assert.deepEqual(await nombres(), ['Bruno X', 'Carla X', 'Dante X', 'Elena X']);
  assert.equal(await J(`document.getElementById('st-total').textContent`), '4');
  assert.equal(await J(`document.getElementById('catering').textContent`), '', 'era la única vegana');
});

test('elegir varios y borrarlos juntos', async () => {
  await abrir();
  await br.eval(`${fila('Carla')}.querySelector('.sel-fila').click(); ${fila('Elena')}.querySelector('.sel-fila').click()`);
  assert.match(await J(`document.getElementById('sel-bar').textContent`), /2 seleccionados/);
  await br.eval(`document.getElementById('del-sel').click()`);
  assert.match((await aviso()).texto, /2 invitados/);
  await br.eval(`document.getElementById('del-ok').click()`); await br.sleep(300);
  assert.deepEqual((await J(`window.__borrados`)).at(-1).sort(), [3, 5]);
  assert.deepEqual(await nombres(), ['Ana X', 'Bruno X', 'Dante X']);
  assert.equal(await J(`getComputedStyle(document.getElementById('sel-bar')).display`), 'none', 'se limpia la selección');
});

test('"elegir todos" marca solo lo que se está viendo (respeta el filtro)', async () => {
  await abrir();
  await br.eval(`setFilter('no', document.querySelector('.filter-btn[data-f="no"]'))`);
  await br.eval(`document.getElementById('sel-todos').click()`);
  assert.match(await J(`document.getElementById('sel-bar').textContent`), /2 seleccionados/);
  await br.eval(`document.getElementById('del-sel').click()`);
  assert.match((await aviso()).lista, /Dante X.*Elena X/s);
  await br.eval(`document.getElementById('del-ok').click()`); await br.sleep(300);
  assert.deepEqual((await J(`window.__borrados`)).at(-1).sort(), [4, 5]);
});

test('"elegir todos" sin filtro: aviso lista los nombres y se puede cancelar', async () => {
  await abrir();
  await br.eval(`document.getElementById('sel-todos').click()`);
  assert.match(await J(`document.getElementById('sel-bar').textContent`), /5 seleccionados/);
  await br.eval(`document.getElementById('del-sel').click()`);
  assert.match((await aviso()).texto, /5 invitados/);
  await br.eval(`document.getElementById('del-cancelar').click()`); await br.sleep(200);
  assert.equal((await nombres()).length, 5);
  await br.eval(`document.getElementById('sel-todos').click()`);
  assert.equal(await J(`getComputedStyle(document.getElementById('sel-bar')).display`), 'none', 'destildar todos limpia la selección');
});
