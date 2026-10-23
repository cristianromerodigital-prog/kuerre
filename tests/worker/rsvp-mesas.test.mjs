// Panel RSVP: asistencia y mesa (capacidad 10, cantidad de mesas por evento,
// detección de conflicto entre dos dispositivos).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from '../helpers/worker.mjs';

const T = '?t=TOK';
function evento({ invitados = [], mesas } = {}) {
  const kv = { 'rsvp_token:ev-1': 'TOK' };
  if (mesas) kv['rsvp_mesas:ev-1'] = String(mesas);
  const ctx = makeEnv({ kv });
  const ins = ctx.db.prepare("INSERT INTO rsvp_responses (slug,nombre,apellido,asistencia,mesa) VALUES (?,?,?,?,?)");
  for (const [i, inv] of invitados.entries()) ins.run(inv.slug || 'ev-1', 'Inv' + i, 'X', inv.asistencia || 'si', inv.mesa ?? null);
  ctx.fila = id => ctx.db.prepare('SELECT asistencia, mesa, modificado_at FROM rsvp_responses WHERE id=?').get(id);
  return ctx;
}
const patch = (env, id, body, t = T) => call(env, 'PATCH', `/rsvp/ev-1/${id}${t}`, body);

// ── reglas de asistencia (regresión) ──
test('no se asigna mesa a quien no asiste', async () => {
  const { env, fila } = evento({ invitados: [{ asistencia: 'no' }] });
  const r = await patch(env, 1, { mesa: 3 });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'no_asiste'); assert.equal(fila(1).mesa, null);
});
test('pasar a no asiste libera la mesa y marca la fecha de modificación', async () => {
  const { env, fila } = evento({ invitados: [{ mesa: 4 }] });
  const r = await patch(env, 1, { asistencia: 'no' });
  assert.equal(r.status, 200); assert.equal(fila(1).mesa, null); assert.ok(fila(1).modificado_at);
});
test('token inválido → 401; fila de otro evento → 404', async () => {
  const { env } = evento({ invitados: [{}, { slug: 'otro' }] });
  assert.equal((await patch(env, 1, { mesa: 1 }, '?t=MAL')).status, 401);
  assert.equal((await patch(env, 2, { asistencia: 'no' })).status, 404);
});

// ── capacidad ──
test('mesa con 10 confirmados rechaza al 11.º', async () => {
  const llenos = Array.from({ length: 10 }, () => ({ mesa: 3 }));
  const { env, fila } = evento({ invitados: [...llenos, {}] });
  const r = await patch(env, 11, { mesa: 3 });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'mesa_llena'); assert.equal(fila(11).mesa, null);
});
test('los que no asisten no ocupan lugar', async () => {
  const { env, fila } = evento({ invitados: [...Array.from({ length: 9 }, () => ({ mesa: 3 })), { asistencia: 'no', mesa: 3 }, {}] });
  const r = await patch(env, 11, { mesa: 3 });
  assert.equal(r.status, 200); assert.equal(fila(11).mesa, 3);
});
test('reasignar la misma mesa a quien ya está sentado no cuenta doble', async () => {
  const { env } = evento({ invitados: Array.from({ length: 10 }, () => ({ mesa: 3 })) });
  assert.equal((await patch(env, 10, { mesa: 3 })).status, 200);
});
test('capacidad concurrente: dos personas por el último lugar → entra una sola', async () => {
  const { env, db } = evento({ invitados: [...Array.from({ length: 9 }, () => ({ mesa: 5 })), {}, {}] });
  const [a, b] = await Promise.all([patch(env, 10, { mesa: 5 }), patch(env, 11, { mesa: 5 })]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rsvp_responses WHERE mesa=5 AND asistencia='si'").get().n, 10);
});

// ── cantidad de mesas ──
test('GET devuelve mesas (20 por defecto) y capacidad 10', async () => {
  const { env } = evento();
  const r = await call(env, 'GET', '/rsvp/ev-1' + T);
  assert.equal(r.data.mesas, 20); assert.equal(r.data.capacidad, 10);
});
test('mesa fuera de rango → 400', async () => {
  const { env } = evento({ invitados: [{}], mesas: 12 });
  assert.equal((await patch(env, 1, { mesa: 13 })).status, 400);
  assert.equal((await patch(env, 1, { mesa: 12 })).status, 200);
});
test('configurar cantidad de mesas: valida rango y requiere token', async () => {
  const { env, store } = evento();
  assert.equal((await call(env, 'PUT', '/rsvp/ev-1/config' + T, { mesas: 0 })).status, 400);
  assert.equal((await call(env, 'PUT', '/rsvp/ev-1/config' + T, { mesas: 61 })).status, 400);
  assert.equal((await call(env, 'PUT', '/rsvp/ev-1/config?t=MAL', { mesas: 30 })).status, 401);
  assert.equal((await call(env, 'PUT', '/rsvp/ev-1/config' + T, { mesas: 30 })).status, 200);
  assert.equal(store['rsvp_mesas:ev-1'], '30');
  assert.equal((await call(env, 'GET', '/rsvp/ev-1' + T)).data.mesas, 30);
});
test('reducir mesas ocupadas → 409 con la lista', async () => {
  const { env, store } = evento({ invitados: [{ mesa: 18 }, { mesa: 15 }, { asistencia: 'no', mesa: 19 }] });
  const r = await call(env, 'PUT', '/rsvp/ev-1/config' + T, { mesas: 14 });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'mesas_ocupadas'); assert.deepEqual(r.data.mesas, [15, 18]);
  assert.equal(store['rsvp_mesas:ev-1'], undefined);
});

// ── conflicto ──
test('prev desactualizado → 409 conflicto con el estado actual, sin pisar', async () => {
  const { env, fila } = evento({ invitados: [{ mesa: 2 }] });
  assert.equal((await patch(env, 1, { mesa: 7, prev: { asistencia: 'si', mesa: 2 } })).status, 200);
  const r = await patch(env, 1, { asistencia: 'no', prev: { asistencia: 'si', mesa: 2 } });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'conflicto');
  assert.deepEqual({ asistencia: r.data.actual.asistencia, mesa: r.data.actual.mesa }, { asistencia: 'si', mesa: 7 });
  assert.equal(fila(1).asistencia, 'si');
});
test('prev con mesa null coincide con una fila sin mesa', async () => {
  const { env } = evento({ invitados: [{}] });
  assert.equal((await patch(env, 1, { mesa: 1, prev: { asistencia: 'si', mesa: null } })).status, 200);
});
