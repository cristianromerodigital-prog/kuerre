// Abre páginas de Desarrollo/ en Chrome headless y las maneja por el protocolo
// de depuración. Sirve los archivos con un server estático propio (sin python).
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../Desarrollo');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml' };

// extra: { '/ruta.html': 'contenido' } para páginas armadas por el test
export function serve(extra = {}) {
  const server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (extra[p] !== undefined) { res.writeHead(200, { 'Content-Type': TYPES['.html'] }); return res.end(extra[p]); }
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ url: 'http://127.0.0.1:' + server.address().port, close: () => { server.closeAllConnections(); server.close(); } })));
}

export async function openBrowser({ mobile = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kuerre-chrome-'));
  // Puerto 0: Chrome elige uno libre y lo escribe en DevToolsActivePort (sin choques
  // cuando node --test corre varios archivos en paralelo).
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', '--user-data-dir=' + dir, 'about:blank'], { stdio: 'ignore' });
  let port, targets;
  for (let i = 0; i < 100 && !targets; i++) {
    try {
      port = port || fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch { await sleep(100); }
  }
  if (!targets) { proc.kill(); throw new Error('Chrome no arrancó'); }
  const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (pend[m.id]) { pend[m.id](m); delete pend[m.id]; } };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  if (mobile) {
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  }
  await send('Page.enable');
  return {
    async goto(url, waitMs = 3000) { await send('Page.navigate', { url }); await sleep(waitMs); await this.assertLoaded(); },
    async eval(expr) {
      const m = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (m.result && m.result.exceptionDetails) throw new Error('eval: ' + JSON.stringify(m.result.exceptionDetails.exception && m.result.exceptionDetails.exception.description));
      return m.result.result.value;
    },
    // inyecta un script antes de que corra el de la página (mocks de fetch, etc.)
    async beforeLoad(source) { await send('Page.addScriptToEvaluateOnNewDocument', { source }); },
    async screenshot(file) { const m = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(m.result.data, 'base64')); },
    sleep,
    // goto() debe fallar fuerte si la página no cargó (404 → página de error de Chrome)
    async assertLoaded() { const u = await this.eval('location.href'); if (u.startsWith('chrome-error')) throw new Error('la página no cargó: ' + u); },
    async close() { ws.close(); const done = new Promise(r => proc.once('exit', r)); proc.kill(); await done; fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); }
  };
}

// config de invitación → valor del parámetro ?c= (mismo formato que genInviteUrl)
export const cfgParam = cfg => encodeURIComponent(Buffer.from(JSON.stringify(cfg)).toString('base64'));
