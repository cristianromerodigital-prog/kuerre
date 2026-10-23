// El formulario de la invitación tiene que avisar si el Worker rechazó el envío
// (antes mostraba "¡Gracias!" siempre, aunque no se hubiera guardado nada).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser } from '../helpers/browser.mjs';

let srv, br;
before(async () => { srv = await serve(); br = await openBrowser(); });
after(async () => { await br.close(); srv.close(); });

// Mock del Worker: config de la invitación y respuesta del POST /rsvp elegida por el test.
const mock = (status, body) => `(() => {
  window.__posts = 0;
  const cfg = { novios: 'Ana & Juan', tipo: 'casamiento', modelo: 'x', rsvp_activo: true };
  const real = window.fetch;
  window.fetch = async (u, o = {}) => {
    u = String(u);
    if (u.includes('/rsvp/') && o.method === 'POST') { window.__posts++; return new Response(JSON.stringify(${JSON.stringify(body)}), { status: ${status} }); }
    if (u.includes('/invite/')) return new Response(JSON.stringify(cfg), { status: 200 });
    if (u.includes('/brand')) return new Response('{}', { status: 200 });
    return real(u, o);
  };
})();`;

async function enviar(page) {
  await br.eval(`(() => {
    document.getElementById('rsvp-nombre').value = 'Ana';
    document.getElementById('rsvp-apellido').value = 'Pérez';
    document.getElementById('rsvp-asistencia').value = 'si';
    return submitRSVP();
  })()`);
  await br.sleep(300);
  return JSON.parse(await br.eval(`JSON.stringify({
    posts: window.__posts,
    error: getComputedStyle(document.getElementById('rsvp-error')).display !== 'none' ? document.getElementById('rsvp-error').textContent : '',
    exito: getComputedStyle(document.getElementById('rsvp-success')).display !== 'none',
    btnHabilitado: !document.getElementById('rsvp-btn').disabled
  })`));
}

for (const page of ['invite.html', 'invite-social.html']) {
  test(`${page}: rechazo del Worker (429) muestra el error y deja reintentar`, async () => {
    await br.beforeLoad(mock(429, { error: 'Demasiados envíos. Probá de nuevo en un minuto.' }));
    await br.goto(`${srv.url}/${page}?i=ana-juan-1-xxxx`, 2500);
    const r = await enviar(page);
    assert.equal(r.posts, 1);
    assert.equal(r.exito, false);
    assert.equal(r.error, 'Demasiados envíos. Probá de nuevo en un minuto.');
    assert.equal(r.btnHabilitado, true);
  });

  test(`${page}: envío aceptado muestra el agradecimiento`, async () => {
    await br.beforeLoad(mock(200, { ok: true }));
    await br.goto(`${srv.url}/${page}?i=ana-juan-1-xxxx`, 2500);
    const r = await enviar(page);
    assert.equal(r.exito, true);
    assert.equal(r.error, '');
  });
}

test('invite.html: los campos tienen el mismo límite que el Worker', async () => {
  await br.goto(`${srv.url}/invite.html?c=${encodeURIComponent(Buffer.from(JSON.stringify({ novios: 'A', rsvp_activo: true })).toString('base64'))}`, 2000);
  const m = JSON.parse(await br.eval(`JSON.stringify(['rsvp-nombre','rsvp-apellido','rsvp-alergia-detail','rsvp-mensaje'].map(id => document.getElementById(id).maxLength))`));
  assert.deepEqual(m, [80, 80, 200, 1000]);
});
