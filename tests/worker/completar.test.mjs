// El cliente completa su invitación desde estilos.html: no puede guardar URLs que
// no sean https (terminarían como src/href en la invitación de cada invitado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from '../helpers/worker.mjs';

test('completar descarta URLs no https y filtra el carrusel', async () => {
  const { env, store } = makeEnv({ kv: { 'invite_cfg_ana-1-xxxx': JSON.stringify({ novios: 'Ana', media_url: 'https://ok/viejo.jpg' }) } });
  const r = await call(env, 'POST', '/invite/ana-1-xxxx/completar', {
    estilo_id: 'clasico',
    config: {
      media_url: 'javascript:alert(1)', lugar_maps: 'https://maps.google.com/?q=x', lugar_maps_embed: 'http://inseguro',
      spotify_url: 'javascript:alert(2)', album_url: '"><img src=x>',
      carousel_images_1: ['javascript:x', 'https://ok/1.jpg', 7], carousel_images_2: 'no-es-array',
      dresscode: 'Formal'
    }
  });
  assert.equal(r.status, 200);
  const cfg = JSON.parse(store['invite_cfg_ana-1-xxxx']);
  assert.equal(cfg.media_url, 'https://ok/viejo.jpg', 'una URL insegura no pisa la que ya había');
  assert.equal(cfg.lugar_maps, 'https://maps.google.com/?q=x');
  assert.equal(cfg.lugar_maps_embed, undefined);
  assert.equal(cfg.spotify_url, undefined);
  assert.equal(cfg.album_url, undefined);
  assert.deepEqual(cfg.carousel_images_1, ['https://ok/1.jpg']);
  assert.equal(cfg.carousel_images_2, undefined);
  assert.equal(cfg.dresscode, 'Formal', 'los campos de texto no se tocan');
});
