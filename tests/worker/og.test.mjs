// Tarjeta de WhatsApp (/og/{slug}): si la portada es video, la imagen es el logo
// de la marca asignada al cliente de esa invitación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from '../helpers/worker.mjs';

const W = 'https://kuerre-worker.cristian-romero-digital.workers.dev';
function conMarca(cfg) {
  const ctx = makeEnv({ kv: { 'invite_cfg_barack-1-4tdb': JSON.stringify(cfg), 'invite_slug_barack-1-4tdb': 'inv_4tdb' } });
  ctx.db.exec(`INSERT INTO partners (id, slug, nombre, logo_key) VALUES ('p1', 'nijash', 'Palacio Nijash', 'partners/p1/logo.png')`);
  ctx.db.exec(`INSERT INTO solicitudes (id, invite_id, partner_id, created_at) VALUES ('ABC234', 'inv_4tdb', 'p1', '2026-10-01')`);
  return ctx;
}
const og = async (env, host = 'https://kuerre.com.ar') => {
  const { loadWorker } = await import('../helpers/worker.mjs');
  const mod = await loadWorker();
  const r = await mod.fetch(new Request(host + '/og/barack-1-4tdb'), env, { waitUntil() {} });
  return { status: r.status, html: await r.text() };
};
const ogImage = html => (/<meta property="og:image" content="([^"]*)"/.exec(html) || [])[1];

test('portada en video → og:image es el logo de la marca (servido por el worker)', async () => {
  const { env } = conMarca({ novios: 'BARACK', media_type: 'video', media_url: 'https://x/v.mp4' });
  const { status, html } = await og(env);
  assert.equal(status, 200);
  assert.equal(ogImage(html), W + '/api/partners/nijash/logo');
});

test('portada en imagen → og:image sigue siendo la foto', async () => {
  const { env } = conMarca({ novios: 'BARACK', media_type: 'image', media_url: 'https://x/foto.jpg' });
  assert.equal(ogImage((await og(env)).html), 'https://x/foto.jpg');
});

test('sin marca ni foto → sin og:image', async () => {
  const { env } = makeEnv({ kv: { 'invite_cfg_barack-1-4tdb': JSON.stringify({ novios: 'B', media_type: 'video' }) } });
  assert.equal(ogImage((await og(env)).html), undefined);
});

test('HEAD al logo de la marca responde como el GET (sin cuerpo)', async () => {
  const { env } = conMarca({});
  env.MEDIA = { get: async () => ({ body: new Blob(['PNG']).stream(), httpMetadata: { contentType: 'image/png' } }) };
  const { loadWorker } = await import('../helpers/worker.mjs');
  const mod = await loadWorker();
  const r = await mod.fetch(new Request(W + '/api/partners/nijash/logo', { method: 'HEAD' }), env, { waitUntil() {} });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
});
