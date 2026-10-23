// Corre el Worker real (bundle de wrangler) contra SQLite en memoria con el
// schema y las migraciones del repo. KV y rate limiter en memoria.
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../worker');
let _mod = null;

export async function loadWorker() {
  if (_mod) return _mod;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'kuerre-wbuild-'));
  execFileSync('npx', ['wrangler@4', 'deploy', '--dry-run', '--outdir', out], { cwd: WORKER_DIR, stdio: 'ignore' });
  // Los .html importados como texto: node no los entiende, se envuelven en un módulo.
  let js = fs.readFileSync(path.join(out, 'index.js'), 'utf8');
  for (const f of fs.readdirSync(out).filter(f => f.endsWith('.html'))) {
    fs.writeFileSync(path.join(out, f + '.mjs'), 'export default ' + JSON.stringify(fs.readFileSync(path.join(out, f), 'utf8')) + ';');
    js = js.split('"./' + f + '"').join('"./' + f + '.mjs"');
  }
  fs.writeFileSync(path.join(out, 'index.js'), js);
  _mod = (await import(path.join(out, 'index.js'))).default;
  return _mod;
}

export function makeEnv({ kv = {}, limiterOk = () => true } = {}) {
  const db = new DatabaseSync(':memory:');
  // Esquema real de producción (worker/schema.sql está desactualizado).
  db.exec(fs.readFileSync(path.join(WORKER_DIR, '../tests/fixtures/schema-prod.sql'), 'utf8'));
  const store = { ...kv };
  const D1 = {
    prepare: sql => ({
      bind: (...a) => ({
        run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; },
        first: async () => db.prepare(sql).get(...a) ?? null,
        all: async () => ({ results: db.prepare(sql).all(...a) })
      }),
      run: async () => { const r = db.prepare(sql).run(); return { meta: { changes: Number(r.changes) } }; },
      first: async () => db.prepare(sql).get() ?? null,
      all: async () => ({ results: db.prepare(sql).all() })
    })
  };
  const env = {
    KUERRE_DB: D1,
    KUERRE_KV: { get: async k => (k in store ? store[k] : null), put: async (k, v) => { store[k] = v; }, delete: async k => { delete store[k]; } },
    RSVP_LIMITER: { limit: async ({ key }) => ({ success: limiterOk(key) }) },
    ADMIN_JWT_SECRET: 'test-secret', CF_AUTH_TOKEN: 'test-cf',
    WORKER_ORIGIN: 'https://kuerre-worker.cristian-romero-digital.workers.dev'
  };
  return { env, db, store };
}

export async function call(env, method, url, body, headers = {}) {
  const mod = await loadWorker();
  const init = { method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const r = await mod.fetch(new Request('https://w' + url, init), env, { waitUntil() {} });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
