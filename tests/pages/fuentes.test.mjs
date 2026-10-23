// El panel RSVP tiene que cargar Montserrat (antes el @import quedaba ignorado).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serve, openBrowser } from '../helpers/browser.mjs';

test('rsvp-panel.html carga Montserrat', async () => {
  const srv = await serve(); const br = await openBrowser();
  try {
    await br.goto(`${srv.url}/rsvp-panel.html`, 3000);
    const ok = await br.eval(`document.fonts.ready.then(() => document.fonts.check('12px Montserrat') && [...document.fonts].some(f => f.family.replace(/"/g,'') === 'Montserrat' && f.status === 'loaded'))`);
    assert.equal(ok, true);
  } finally { await br.close(); srv.close(); }
});
