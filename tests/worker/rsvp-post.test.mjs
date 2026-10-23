// POST /rsvp/{slug} es público (lo usa la invitación): valida, limita envíos y
// pone un tope de respuestas por evento.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from '../helpers/worker.mjs';

const valido = { nombre: 'Ana', apellido: 'Pérez', asistencia: 'si', restricciones: 'Celíaco/a', mensaje: '¡Vamos!' };
const filas = db => db.prepare("SELECT COUNT(*) n FROM rsvp_responses WHERE slug='ev-1'").get().n;

test('envío válido se guarda', async () => {
  const { env, db } = makeEnv();
  const r = await call(env, 'POST', '/rsvp/ev-1', valido);
  assert.equal(r.status, 200);
  assert.equal(filas(db), 1);
});

for (const [caso, body] of [
  ['asistencia inválida', { ...valido, asistencia: 'quizas' }],
  ['nombre de 81 caracteres', { ...valido, nombre: 'a'.repeat(81) }],
  ['apellido vacío tras trim', { ...valido, apellido: '   ' }],
  ['restricciones de 301', { ...valido, restricciones: 'r'.repeat(301) }],
  ['mensaje de 1001', { ...valido, mensaje: 'm'.repeat(1001) }],
  ['nombre que no es texto', { ...valido, nombre: { $gt: '' } }]
]) {
  test(`rechaza ${caso}`, async () => {
    const { env, db } = makeEnv();
    const r = await call(env, 'POST', '/rsvp/ev-1', body);
    assert.equal(r.status, 400);
    assert.equal(filas(db), 0);
  });
}

test('acepta los máximos exactos (80 / 300 / 1000)', async () => {
  const { env, db } = makeEnv();
  const r = await call(env, 'POST', '/rsvp/ev-1', { ...valido, nombre: 'a'.repeat(80), restricciones: 'r'.repeat(300), mensaje: 'm'.repeat(1000) });
  assert.equal(r.status, 200);
  assert.equal(filas(db), 1);
});

test('demasiados envíos → 429 y no guarda', async () => {
  let claves = [];
  const { env, db } = makeEnv({ limiterOk: k => { claves.push(k); return false; } });
  const r = await call(env, 'POST', '/rsvp/ev-1', valido);
  assert.equal(r.status, 429);
  assert.equal(filas(db), 0);
  assert.deepEqual(claves, ['1.2.3.4:ev-1'], 'el límite es por IP + evento');
});

test('con 2000 respuestas el evento no acepta más', async () => {
  const { env, db } = makeEnv();
  const ins = db.prepare("INSERT INTO rsvp_responses (slug,nombre,apellido,asistencia) VALUES ('ev-1','n','a','si')");
  db.exec('BEGIN'); for (let i = 0; i < 2000; i++) ins.run(); db.exec('COMMIT');
  const r = await call(env, 'POST', '/rsvp/ev-1', valido);
  assert.equal(r.status, 409);
  assert.equal(filas(db), 2000);
});
