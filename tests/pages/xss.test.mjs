// La config de una invitación puede venir del cliente (formulario de estilos) o del
// formulario público de solicitud: ningún campo puede ejecutar código en la página.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser, cfgParam } from '../helpers/browser.mjs';

const PWN = 'window.__pwn=1';
const malicioso = {
  novios: `<img src=x onerror=${PWN}> & Y`,
  titulo: 'T', fecha_display: '21/11/2026', tipo: 'otro',
  media_type: 'image', media_url: `x" onerror="${PWN}`,
  lugar_nombre: 'Salón', lugar_direccion: 'Calle 1',
  lugar_maps: `javascript:${PWN}`, lugar_maps_embed: `javascript:${PWN}`,
  spotify_url: `https://open.spotify.com/x"><img src=x onerror=${PWN}>`,
  album_url: `javascript:${PWN}`,
  carousel_images_1: [`x" onerror="${PWN}`, 'https://example.com/ok.jpg'],
  rsvp_activo: true
};

let srv, br;
before(async () => { srv = await serve(); br = await openBrowser(); });
after(async () => { await br.close(); srv.close(); });

// Estado observable de la página: si algo inyectado corrió, links peligrosos, imgs/iframes con src inyectado.
const estado = () => br.eval(`JSON.stringify({
  pwn: window.__pwn === 1,
  jsLinks: [...document.querySelectorAll('a[href]')].filter(a => a.href.trim().toLowerCase().startsWith('javascript:')).map(a => a.id),
  imgsInyectadas: [...document.querySelectorAll('img')].filter(i => i.getAttribute('src') === 'x').length,
  iframesJs: [...document.querySelectorAll('iframe')].filter(f => (f.getAttribute('src') || '').toLowerCase().startsWith('javascript:')).length
})`).then(JSON.parse);

for (const page of ['invite.html', 'invite-social.html']) {
  test(`${page}: config maliciosa no ejecuta ni inyecta nada`, async () => {
    const modelo = page === 'invite-social.html' ? 'social' : 'clasico';
    await br.goto(`${srv.url}/${page}?c=${cfgParam({ ...malicioso, modelo })}`, 3500);
    const e = await estado();
    assert.equal(e.pwn, false, 'se ejecutó código inyectado');
    assert.deepEqual(e.jsLinks, [], 'quedaron links javascript:');
    assert.equal(e.imgsInyectadas, 0, 'se inyectaron <img>');
    assert.equal(e.iframesJs, 0, 'iframe con src javascript:');
  });
}

test('invite.html: los nombres con & siguen mostrando el ampersand decorado', async () => {
  await br.goto(`${srv.url}/invite.html?c=${cfgParam({ novios: 'Ana & Juan', tipo: 'casamiento', fecha_display: '1/1/2027' })}`, 2500);
  const r = JSON.parse(await br.eval(`JSON.stringify({ txt: document.getElementById('hero-names').textContent.replace(/\\s+/g,' ').trim(), amp: !!document.querySelector('#hero-names .hero-ampersand') })`));
  assert.equal(r.txt, 'Ana & Juan');
  assert.equal(r.amp, true);
});

test('invite.html: portada en video https sigue cargando y reproduciendo', async () => {
  const video = 'https://kuerre-worker.cristian-romero-digital.workers.dev/invite-media/y94tdb?v=1792718683696';
  await br.goto(`${srv.url}/invite.html?c=${cfgParam({ novios: 'BARACK', tipo: 'otro', media_type: 'video', media_url: video })}`, 6000);
  const r = JSON.parse(await br.eval(`JSON.stringify((() => { const v = document.getElementById('hero-media'); return { tag: v && v.tagName, src: v && v.currentSrc, playing: v && !v.paused && v.currentTime > 0 }; })())`));
  assert.equal(r.tag, 'VIDEO');
  assert.equal(r.src, video);
  assert.equal(r.playing, true);
});

test('invite.html: mapa embebido y Spotify con URL https legítima siguen funcionando', async () => {
  await br.goto(`${srv.url}/invite.html?c=${cfgParam({ novios: 'A', tipo: 'otro', lugar_nombre: 'Palacio', lugar_direccion: 'Calle 1', lugar_maps: 'https://maps.google.com/?q=x', spotify_url: 'https://open.spotify.com/playlist/abc' })}`, 2500);
  const r = JSON.parse(await br.eval(`JSON.stringify({ map: (document.querySelector('.maps-embed') || {}).src || '', maps: document.getElementById('btn-maps').href, sp: (document.querySelector('.spotify-embed') || {}).src || '', spBtn: document.getElementById('btn-spotify').href })`));
  assert.match(r.map, /^https:\/\/maps\.google\.com\/maps\?q=Palacio%20Calle%201&output=embed$/);
  assert.equal(r.maps, 'https://maps.google.com/?q=x');
  assert.equal(r.sp, 'https://open.spotify.com/embed/playlist/abc');
  assert.equal(r.spBtn, 'https://open.spotify.com/playlist/abc');
});

test('invite-social.html: carrusel solo muestra las imágenes https', async () => {
  await br.goto(`${srv.url}/invite-social.html?c=${cfgParam({ modelo: 'social', novios: 'A', carousel_images_1: ['x" onerror="window.__pwn=1', 'https://example.com/ok.jpg'] })}`, 2500);
  const srcs = JSON.parse(await br.eval(`JSON.stringify([...document.querySelectorAll('#carrusel-1-track img')].map(i => i.getAttribute('src')))`));
  assert.deepEqual(srcs, ['https://example.com/ok.jpg']);
});

test('invite-social.html: portada en video https sigue cargando y reproduciendo', async () => {
  const video = 'https://kuerre-worker.cristian-romero-digital.workers.dev/invite-media/y94tdb?v=1792718683696';
  await br.goto(`${srv.url}/invite-social.html?c=${cfgParam({ modelo: 'social', novios: 'BARACK', media_type: 'video', media_url: video })}`, 6000);
  const r = JSON.parse(await br.eval(`JSON.stringify((() => { const v = document.getElementById('hero-bg-media'); return { tag: v && v.tagName, src: v && v.currentSrc, playing: v && !v.paused && v.currentTime > 0 }; })())`));
  assert.equal(r.tag, 'VIDEO');
  assert.equal(r.src, video);
  assert.equal(r.playing, true);
});
