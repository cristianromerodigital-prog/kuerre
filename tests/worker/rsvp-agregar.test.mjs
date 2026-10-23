// Agregar un invitado a mano desde el panel RSVP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from '../helpers/worker.mjs';

const T = '?t=TOK';
function evento(invitados = []) {
  const ctx = makeEnv({ kv: { 'rsvp_token:ev-1': 'TOK' } });
  const ins = ctx.db.prepare('INSERT INTO rsvp_responses (slug,nombre,apellido,asistencia,mesa) VALUES (?,?,?,?,?)');
  invitados.forEach((inv, i) => ins.run('ev-1', 'Inv' + i, 'X', inv.asistencia || 'si', inv.mesa ?? null));
  ctx.fila = id => ({ ...ctx.db.prepare('SELECT nombre, apellido, asistencia, restricciones, mensaje, mesa, borrado_at FROM rsvp_responses WHERE id=?').get(id) });
  return ctx;
}
const agregar = (env, body, t = T) => call(env, 'POST', '/rsvp/ev-1/add' + t, body);
const base = { nombre: ' Ana ', apellido: 'Pérez', asistencia: 'si', restricciones: 'Vegano/a' };

test('agrega un invitado y devuelve su id', async () => {
  const { env, fila } = evento();
  const r = await agregar(env, { ...base, mesa: 4 });
  assert.equal(r.status, 200);
  assert.deepEqual(fila(r.data.id), { nombre: 'Ana', apellido: 'Pérez', asistencia: 'si', restricciones: 'Vegano/a', mensaje: '', mesa: 4, borrado_at: null });
});

test('sin mesa también se puede', async () => {
  const { env, fila } = evento();
  const r = await agregar(env, { ...base, asistencia: 'no' });
  assert.equal(r.status, 200); assert.equal(fila(r.data.id).mesa, null);
});

test('valida igual que el formulario de la invitación', async () => {
  const { env, db } = evento();
  for (const body of [{ ...base, nombre: '' }, { ...base, apellido: 'a'.repeat(81) }, { ...base, asistencia: 'x' }, { ...base, restricciones: 'r'.repeat(301) }])
    assert.equal((await agregar(env, body)).status, 400);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n, 0);
});

test('mesa: no a quien no asiste, ni fuera de rango, ni llena', async () => {
  const { env, db } = evento(Array.from({ length: 10 }, () => ({ mesa: 3 })));
  assert.equal((await agregar(env, { ...base, asistencia: 'no', mesa: 2 })).data.error, 'no_asiste');
  assert.equal((await agregar(env, { ...base, mesa: 21 })).status, 400);
  const r = await agregar(env, { ...base, mesa: 3 });
  assert.equal(r.status, 409); assert.equal(r.data.error, 'mesa_llena');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n, 10);
});

test('dos agregados simultáneos al último lugar de una mesa → entra uno solo', async () => {
  const { env, db } = evento(Array.from({ length: 9 }, () => ({ mesa: 6 })));
  const rs = await Promise.all([agregar(env, { ...base, mesa: 6 }), agregar(env, { ...base, mesa: 6 })]);
  assert.deepEqual(rs.map(r => r.status).sort(), [200, 409]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM rsvp_responses WHERE mesa=6").get().n, 10);
});

test('sin token válido → 401 y no agrega', async () => {
  const { env, db } = evento();
  assert.equal((await agregar(env, base, '?t=MAL')).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rsvp_responses').get().n, 0);
});
