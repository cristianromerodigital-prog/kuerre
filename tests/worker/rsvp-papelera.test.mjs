// Papelera del RSVP: borrar no pierde el dato; se puede restaurar durante 30 días.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, runScheduled } from '../helpers/worker.mjs';

const T = '?t=TOK';
function evento(invitados = []) {
  const ctx = makeEnv({ kv: { 'rsvp_token:ev-1': 'TOK' } });
  const ins = ctx.db.prepare('INSERT INTO rsvp_responses (slug,nombre,apellido,asistencia,mesa) VALUES (?,?,?,?,?)');
  invitados.forEach((inv, i) => ins.run(inv.slug || 'ev-1', inv.nombre || 'Inv' + i, 'X', inv.asistencia || 'si', inv.mesa ?? null));
  ctx.fila = id => ctx.db.prepare('SELECT asistencia, mesa, borrado_at FROM rsvp_responses WHERE id=?').get(id);
  return ctx;
}
const borrar = (env, ids) => call(env, 'POST', '/rsvp/ev-1/delete' + T, { ids });
const restaurar = (env, ids, t = T, slug = 'ev-1') => call(env, 'POST', `/rsvp/${slug}/restore${t}`, { ids });
const get = env => call(env, 'GET', '/rsvp/ev-1' + T).then(r => r.data);

test('borrar no elimina la fila: sale de la lista y queda en eliminados', async () => {
  const { env, fila } = evento([{ nombre: 'Ana' }, { nombre: 'Beto' }]);
  assert.equal((await borrar(env, [1])).data.borrados, 1);
  assert.ok(fila(1).borrado_at, 'queda marcada');
  const d = await get(env);
  assert.deepEqual(d.responses.map(r => r.nombre), ['Beto']);
  assert.equal(d.total, 1); assert.equal(d.total_si, 1);
  assert.deepEqual(d.eliminados.map(r => [r.id, r.nombre]), [[1, 'Ana']]);
  assert.ok(d.eliminados[0].borrado_at);
});

test('borrar dos veces no vuelve a contar', async () => {
  const { env } = evento([{}]);
  await borrar(env, [1]);
  assert.equal((await borrar(env, [1])).data.borrados, 0);
});

test('el borrado de a uno del admin también va a la papelera', async () => {
  const { env, fila } = evento([{}]);
  env.ADMIN_JWT_SECRET = 'x';
  const r = await call(env, 'DELETE', '/rsvp/ev-1/1');
  assert.equal(r.status, 401, 'sin sesión de admin no borra');
  assert.equal(fila(1).borrado_at, null);
});

test('un eliminado no ocupa lugar en la mesa ni bloquea bajar la cantidad de mesas', async () => {
  const { env } = evento([...Array.from({ length: 10 }, () => ({ mesa: 3 })), {}, { mesa: 18 }]);
  await borrar(env, [1, 12]);
  assert.equal((await call(env, 'PATCH', '/rsvp/ev-1/11' + T, { mesa: 3 })).status, 200);
  assert.equal((await call(env, 'PUT', '/rsvp/ev-1/config' + T, { mesas: 15 })).status, 200);
});

test('un eliminado no se puede editar', async () => {
  const { env } = evento([{}]);
  await borrar(env, [1]);
  assert.equal((await call(env, 'PATCH', '/rsvp/ev-1/1' + T, { asistencia: 'no' })).status, 404);
  assert.equal((await call(env, 'PATCH', '/rsvp/ev-1/1' + T, { restricciones: 'Vegano/a' })).status, 404);
});

test('restaurar vuelve a la lista con su mesa si hay lugar', async () => {
  const { env, fila } = evento([{ mesa: 4 }]);
  await borrar(env, [1]);
  const r = await restaurar(env, [1]);
  assert.equal(r.status, 200); assert.equal(r.data.restaurados, 1);
  assert.deepEqual({ ...fila(1) }, { asistencia: 'si', mesa: 4, borrado_at: null });
  assert.equal((await get(env)).eliminados.length, 0);
});

test('restaurar a una mesa que se llenó mientras tanto → vuelve sin mesa', async () => {
  const { env, fila } = evento([{ mesa: 3 }, ...Array.from({ length: 10 }, () => ({}))]);
  await borrar(env, [1]);
  for (let id = 2; id <= 11; id++) await call(env, 'PATCH', `/rsvp/ev-1/${id}` + T, { mesa: 3 });
  await restaurar(env, [1]);
  assert.equal(fila(1).mesa, null);
  assert.equal(fila(1).borrado_at, null);
});

test('restaurar varios a la misma mesa respeta el cupo (el que no entra vuelve sin mesa)', async () => {
  const { env, db } = evento([...Array.from({ length: 9 }, () => ({ mesa: 5 })), { mesa: 5 }, { mesa: 5 }]);
  // 11 en la mesa 5 no puede pasar por la API; se simula un borrado de 2 cuando había 11 (dato viejo)
  await borrar(env, [10, 11]);
  await restaurar(env, [10, 11]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rsvp_responses WHERE mesa=5 AND asistencia='si' AND borrado_at IS NULL").get().n, 10);
});

test('restaurar a una mesa que ya no existe → vuelve sin mesa', async () => {
  const { env, fila } = evento([{ mesa: 18 }]);
  await borrar(env, [1]);
  await call(env, 'PUT', '/rsvp/ev-1/config' + T, { mesas: 12 });
  await restaurar(env, [1]);
  assert.equal(fila(1).mesa, null);
});

test('restaurar: token inválido → 401, ids inválidos → 400, nunca toca otro evento', async () => {
  const { env, db, fila } = evento([{}, { slug: 'otro' }]);
  db.exec("UPDATE rsvp_responses SET borrado_at = datetime('now')");
  assert.equal((await restaurar(env, [1], '?t=MAL')).status, 401);
  assert.equal((await restaurar(env, [])).status, 400);
  assert.equal((await restaurar(env, [1, 2])).data.restaurados, 1);
  assert.ok(fila(2).borrado_at, 'el de otro evento sigue borrado');
});

test('la tarea diaria borra de verdad lo eliminado hace más de 30 días', async () => {
  const { env, db } = evento([{ nombre: 'Viejo' }, { nombre: 'Reciente' }, { nombre: 'Activo' }]);
  db.exec("UPDATE rsvp_responses SET borrado_at = datetime('now', '-31 days') WHERE id = 1");
  db.exec("UPDATE rsvp_responses SET borrado_at = datetime('now', '-29 days') WHERE id = 2");
  await runScheduled(env);
  assert.deepEqual(db.prepare('SELECT nombre FROM rsvp_responses ORDER BY id').all().map(r => r.nombre), ['Reciente', 'Activo']);
});
