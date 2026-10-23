// Panel RSVP: resumen para el catering, posibles duplicados y orden por columna.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser } from '../helpers/browser.mjs';

let srv, br;
after(async () => { await br.close(); srv.close(); });

const r = (id, nombre, apellido, asistencia, mesa, restricciones, created_at, modificado_at = null) =>
  ({ id, nombre, apellido, asistencia, mesa, restricciones, mensaje: '', created_at, modificado_at });
const ROWS = [
  r(1, 'José', 'Pérez', 'si', 4, 'Celíaco/a', '2026-10-05 10:00:00'),
  r(2, 'jose ', ' perez', 'si', null, 'celíaco/a, Vegano/a', '2026-10-01 10:00:00', '2026-10-10 10:00:00'),
  r(3, 'Ana', 'Gómez', 'si', 2, 'Celíaco/a', '2026-10-03 10:00:00'),
  r(4, 'Bruno', 'Díaz', 'no', null, 'Celíaco/a', '2026-10-04 10:00:00'),
  r(5, 'Carla', 'Ruiz', 'si', 9, 'Alergia: maní', '2026-10-02 10:00:00', '2026-10-08 10:00:00')
];

before(async () => {
  srv = await serve(); br = await openBrowser();
  await br.beforeLoad(`(() => {
    const rows = ${JSON.stringify(ROWS)};
    const real = window.fetch;
    window.fetch = async (u, o = {}) => {
      u = String(u);
      if (u.includes('/rsvp/') && o.method === 'PATCH') { (window.__patches = window.__patches || []).push(JSON.parse(o.body)); return new Response('{"ok":true}'); }
      if (u.includes('/rsvp/')) return new Response(JSON.stringify({ responses: rows, total: 5, total_si: 4, total_no: 1, mesas: 20, capacidad: 10 }));
      if (u.includes('/invite/') || u.includes('/brand')) return new Response('{}');
      return real(u, o);
    };
  })();`);
});
const abrir = () => br.goto(`${srv.url}/rsvp-panel.html?slug=ev-1-xxxx&t=TOK`, 2000);
const J = async expr => JSON.parse(await br.eval(`JSON.stringify(${expr})`));
const nombres = () => J(`[...document.querySelectorAll('#table-wrap tbody tr')].map(tr => [...tr.children[1].querySelector('div').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim())`);
const ordenarPor = texto => br.eval(`[...document.querySelectorAll('#table-wrap th')].find(th => th.textContent.startsWith('${texto}')).click()`);

test('resumen para el catering: solo confirmados, sin distinguir mayúsculas', async () => {
  await abrir();
  const items = await J(`[...document.querySelectorAll('#catering .cat-item')].map(e => e.textContent)`);
  assert.deepEqual(items, ['Celíaco/a: 3', 'Alergia: maní: 1', 'Vegano/a: 1']);
});

test('posible duplicado: mismo nombre con otras mayúsculas, tildes o espacios', async () => {
  await abrir();
  const marcados = await J(`[...document.querySelectorAll('#table-wrap tbody tr')].filter(tr => tr.querySelector('.dup')).map(tr => [...tr.children[1].querySelector('div').childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim())`);
  assert.deepEqual(marcados.sort(), ['jose   perez', 'José Pérez'].sort());
});

test('ordenar por nombre asc y desc', async () => {
  await abrir();
  await ordenarPor('Nombre');
  // orden alfabético en español: sin tilde antes que con tilde
  assert.deepEqual(await nombres(), ['Ana Gómez', 'Bruno Díaz', 'Carla Ruiz', 'jose   perez', 'José Pérez']);
  await ordenarPor('Nombre');
  assert.deepEqual((await nombres()).slice(0, 2), ['José Pérez', 'jose   perez']);
});

test('ordenar por mesa deja "sin mesa" al final en los dos sentidos', async () => {
  await abrir();
  await ordenarPor('Mesa');
  assert.deepEqual(await nombres(), ['Ana Gómez', 'José Pérez', 'Carla Ruiz', 'jose   perez', 'Bruno Díaz']);
  await ordenarPor('Mesa');
  assert.deepEqual((await nombres()).slice(0, 3), ['Carla Ruiz', 'José Pérez', 'Ana Gómez']);
});

test('ordenar por "Se modificó el": los nunca modificados al final', async () => {
  await abrir();
  await ordenarPor('Se modificó');
  assert.deepEqual((await nombres()).slice(0, 2), ['Carla Ruiz', 'jose   perez']);
});

test('el encabezado ordenado muestra la flecha', async () => {
  await abrir();
  await ordenarPor('Respondió');
  assert.match(await J(`[...document.querySelectorAll('#table-wrap th')].find(th => th.textContent.startsWith('Respondió')).textContent`), /▲$/);
  assert.deepEqual((await nombres())[0], 'jose   perez');
});

const fila = nombre => `[...document.querySelectorAll('#table-wrap tbody tr')].find(tr => tr.children[1].textContent.includes('${nombre}'))`;

test('# es el número fijo de la respuesta: no cambia al ordenar', async () => {
  await abrir();
  await ordenarPor('Nombre');
  assert.equal(await J(`${fila('Ana')}.children[0].textContent.trim()`), '3');
  assert.equal(await J(`${fila('Carla')}.children[0].textContent.trim()`), '5');
});

test('posible duplicado indica el número de la otra respuesta', async () => {
  await abrir();
  assert.equal(await J(`${fila('José')}.querySelector('.dup').textContent`), 'Posible duplicado de la fila 2');
  assert.equal(await J(`${fila('jose')}.querySelector('.dup').textContent`), 'Posible duplicado de la fila 1');
});

test('columna Alimentación muestra lo elegido', async () => {
  await abrir();
  const headers = await J(`[...document.querySelectorAll('#table-wrap th')].map(t => t.textContent.replace(/ [▲▼]$/, ''))`);
  assert.ok(headers.includes('Alimentación'), headers.join(','));
  const col = headers.indexOf('Alimentación');
  assert.equal(await J(`${fila('Carla')}.children[${col}].querySelector('.restr-txt').textContent`), 'Alergia: maní');
  assert.equal(await J(`${fila('Ana')}.children[1].textContent.includes('Celíaco')`), false, 'ya no se repite debajo del nombre');
});

test('editar alimentación: precarga, guarda en el Worker y actualiza el catering', async () => {
  await abrir();
  await br.eval(`${fila('Carla')}.querySelector('.restr-edit').click()`);
  const pre = await J(`({ cel: document.getElementById('restr-celiaco').checked, veg: document.getElementById('restr-vegano').checked, alergia: document.getElementById('restr-alergia').value })`);
  assert.deepEqual(pre, { cel: false, veg: false, alergia: 'maní' });
  await br.eval(`document.getElementById('restr-vegano').checked = true; document.getElementById('restr-alergia').value = 'maní, nueces'; saveRestr()`);
  await br.sleep(300);
  assert.deepEqual(await J(`window.__patches`), [{ restricciones: 'Vegano/a, Alergia: maní, nueces' }]);
  assert.equal(await J(`${fila('Carla')}.querySelector('.restr-txt').textContent`), 'Vegano/a, Alergia: maní, nueces');
  const items = await J(`[...document.querySelectorAll('#catering .cat-item')].map(e => e.textContent)`);
  assert.ok(items.includes('Alergia: maní, nueces: 1'), items.join(' | '));
  assert.ok(items.includes('Vegano/a: 2'), items.join(' | '));
});

test('el CSV empieza con el resumen para el catering y después la lista', async () => {
  await abrir();
  const csv = await br.eval(`new Promise(res => {
    window.confirm = () => true;
    window.matchMedia = () => ({ matches: true });
    navigator.canShare = () => true;
    navigator.share = async d => res(await d.files[0].text());
    exportCSV();
  })`);
  const lineas = csv.split('\n');
  // el resumen va como un texto corrido en una sola línea, fuera de la grilla de datos
  assert.deepEqual(lineas.slice(0, 3), [
    '"Para el catering (confirmados): Celíaco/a: 3. Alergia: maní: 1. Vegano/a: 1."',
    '',
    '"Nombre","Apellido","Asistencia","Restricciones","Mensaje","Mesa","Respondió el","Se modificó el"'
  ]);
  assert.equal(lineas.length, 3 + 5, 'después vienen las 5 respuestas');
});
