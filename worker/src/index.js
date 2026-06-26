import { corsHeaders, json, mountCoreRouter, isAdmin } from '@crd/kuerre-core';

function generateEventId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

function nowISO() { return new Date().toISOString(); }

async function handleSolicitudesCreate(request, env) {
  const body = await request.json();
  const { tipo } = body;
  if (!tipo || !['BODA','XV','CUMPLE'].includes(tipo)) return json({ error: 'tipo inválido' }, 400);

  let nombre_display, fecha, salon, direccion, cliente_nombre, cliente_tel, cliente_email;

  if (tipo === 'BODA') {
    const { novia, novio, fiesta } = body;
    nombre_display = `${novia?.nombre || ''} & ${novio?.nombre || ''}`;
    fecha = fiesta?.fecha || ''; salon = fiesta?.salon || ''; direccion = fiesta?.direccion || '';
    cliente_nombre = novia?.nombre || ''; cliente_tel = novia?.telefono || ''; cliente_email = novia?.email || '';
  } else if (tipo === 'XV') {
    const { quinceanera, cliente, evento } = body;
    nombre_display = `XV ${quinceanera?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
  } else {
    const { cliente, evento } = body;
    nombre_display = `Cumple ${cliente?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
  }

  if (!fecha) return json({ error: 'Fecha del evento requerida' }, 400);
  const now = nowISO();

  for (let attempt = 0; attempt < 2; attempt++) {
    const id = generateEventId();
    const fiesta_id = generateEventId();
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO solicitudes (id,tipo,nombre_display,fecha,salon,direccion,cliente_nombre,cliente_tel,cliente_email,data_json,fiesta_id,invite_slug,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, tipo, nombre_display, fecha, salon, direccion, cliente_nombre, cliente_tel, cliente_email, JSON.stringify(body), fiesta_id, id, now),
        env.DB.prepare(`INSERT INTO eventos_foto (id,nombre,fecha,cierre_auto,folder_id,portada,estado,moderacion,created_at) VALUES (?,?,?,NULL,'',NULL,'pendiente',0,?)`)
          .bind(fiesta_id, nombre_display, fecha, now),
        env.DB.prepare(`INSERT INTO entrega_configs (id,nombres,fecha,tipo,folder_id,portada,overlay,allow_dl,created_at) VALUES (?,?,?,?,'','','violeta',1,?)`)
          .bind(id, nombre_display, fecha, tipo, now),
      ]);
      return json({ ok: true, id });
    } catch (e) {
      if (attempt === 1) throw e;
    }
  }
}

async function handleSolicitudesList(env, request) {
  const u      = new URL(request.url);
  const search = (u.searchParams.get('search') || '').trim();
  const limit  = Math.min(parseInt(u.searchParams.get('limit')  || '30', 10), 100);
  const offset = Math.max(parseInt(u.searchParams.get('offset') || '0',  10), 0);

  const likeTerm   = search ? '%' + search + '%' : null;
  const where      = search
    ? 'WHERE (s.nombre_display LIKE ? OR s.cliente_nombre LIKE ? OR s.cliente_tel LIKE ?)'
    : '';
  const baseParams = search ? [likeTerm, likeTerm, likeTerm] : [];

  const countRow = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM solicitudes s ${where}`
  ).bind(...baseParams).first();
  const total = countRow ? countRow.n : 0;

  const { results } = await env.DB.prepare(`
    SELECT s.*, ef.estado AS fiesta_estado, ec.folder_id AS entrega_folder
    FROM solicitudes s
    LEFT JOIN eventos_foto ef ON ef.id = s.fiesta_id
    LEFT JOIN entrega_configs ec ON ec.id = s.id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...baseParams, limit, offset).all();

  return json({ solicitudes: results, total, limit, offset });
}

async function handleSolicitudesDelete(id, env) {
  const sol = await env.DB.prepare('SELECT * FROM solicitudes WHERE id = ?').bind(id).first();
  if (!sol) return json({ error: 'No encontrada' }, 404);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM solicitudes WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM entrega_configs WHERE id = ?').bind(id),
    env.DB.prepare('DELETE FROM eventos_foto WHERE id = ?').bind(sol.fiesta_id),
  ]);
  return json({ ok: true });
}

async function proxyGdrive(fileId, request, env) {
  const rangeHeader = request.headers.get('Range') || '';
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const baseHeaders = { 'User-Agent': ua, 'Accept': '*/*' };

  const kvKey = `gdrive_confirm_${fileId}`;
  let confirmUrl = await env.KV.get(kvKey);

  if (!confirmUrl) {
    const resp0 = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, {
      headers: baseHeaders, redirect: 'follow'
    });
    const ct0 = resp0.headers.get('content-type') || '';
    if (ct0.includes('text/html')) {
      const html = await resp0.text();
      const m = html.match(/confirm=([^&"'\s]+)/);
      if (!m) return new Response('No se pudo obtener token de Drive', { status: 502 });
      confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${m[1]}`;
      await env.KV.put(kvKey, confirmUrl, { expirationTtl: 480 });
    } else {
      const vh = new Headers({ 'Access-Control-Allow-Origin':'*', 'Accept-Ranges':'bytes', 'Cache-Control':'public, max-age=3600' });
      const fct = resp0.headers.get('content-type'); if(fct) vh.set('Content-Type', fct);
      const fcl = resp0.headers.get('content-length'); if(fcl) vh.set('Content-Length', fcl);
      return new Response(resp0.body, { status: resp0.status, headers: vh });
    }
  }

  const fetchHeaders = { ...baseHeaders };
  if (rangeHeader) fetchHeaders['Range'] = rangeHeader;

  const tryFetch = async (url) => {
    const r = await fetch(url, { headers: fetchHeaders, redirect: 'manual' });
    const loc = r.headers.get('location');
    if ((r.status === 301 || r.status === 302) && loc) {
      return new Response(null, { status: 302, headers: new Headers({ 'Location': loc, 'Access-Control-Allow-Origin': '*' }) });
    }
    const fallback = await fetch(url, { headers: fetchHeaders, redirect: 'follow' });
    const vh = new Headers({ 'Access-Control-Allow-Origin':'*', 'Accept-Ranges':'bytes', 'Cache-Control':'public, max-age=3600' });
    const fct = fallback.headers.get('content-type'); if(fct) vh.set('Content-Type', fct);
    const fcl = fallback.headers.get('content-length'); if(fcl) vh.set('Content-Length', fcl);
    const fcr = fallback.headers.get('content-range'); if(fcr) vh.set('Content-Range', fcr);
    return new Response(fallback.body, { status: fallback.status, headers: vh });
  };

  const result = await tryFetch(confirmUrl);

  if (result.status === 403 || result.status === 502) {
    await env.KV.delete(kvKey);
    const r2 = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, { headers: baseHeaders, redirect: 'follow' });
    const h2 = await r2.text();
    const m2 = h2.match(/confirm=([^&"'\s]+)/);
    if (m2) {
      const newUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${m2[1]}`;
      await env.KV.put(kvKey, newUrl, { expirationTtl: 480 });
      return await tryFetch(newUrl);
    }
  }
  return result;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsHeaders();

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      const CORE_OPTIONS = {
        brand: 'KUERRE',
        modules: {
          qr_fiestas:   true,
          invitaciones: true,
          premiere:     true,
          contratos:    true,
          crclub:       false,
          presupuesto:  false,
          portfolio:    false,
        }
      };

      // ── kuerre-core: eventos, fotos, frases, likes, admin auth + UI ──────────
      const response = await mountCoreRouter(request, env, url, CORE_OPTIONS);
      if (response) return response;

      // ── crd_content: lectura pública para index.html ──────────────────────
      if (path === '/crd_content' && method === 'GET') {
        const val = await env.KV.get('crd_content');
        if (val === null) return json({}, 200);
        try { return json(JSON.parse(val)); } catch { return json({}, 200); }
      }

      // ── KV directo (branding settings read/write) ─────────────────────────
      const kvMatch = path.match(/^\/([a-z][a-z0-9_]+)$/);
      if (kvMatch) {
        const auth = request.headers.get('Authorization') || '';
        const key = kvMatch[1];
        if (method === 'GET') {
          const cfAuth = env.CF_AUTH_TOKEN || '';
          if (!cfAuth || auth !== cfAuth) return json({ error: 'Unauthorized' }, 401);
          const val = await env.KV.get(key);
          if (val === null) return json({ error: 'Not found' }, 404);
          try { return json(JSON.parse(val)); } catch { return new Response(val, { headers: { 'Content-Type': 'text/plain' } }); }
        }
        if (method === 'POST') {
          const cfAuth = env.CF_AUTH_TOKEN || '';
          if (!cfAuth || auth !== cfAuth) return json({ error: 'Unauthorized' }, 401);
          const body = await request.text();
          await env.KV.put(key, body);
          return json({ ok: true });
        }
      }

      // ── Site config ────────────────────────────────────────────────────────
      if (path === '/site/config' && method === 'GET') {
        const safeJson = (v) => { try { return v ? JSON.parse(v) : null; } catch { return v || null; } };
        const [raw, logoRaw, videoRaw] = await Promise.all([
          env.KV.get('kuerre_settings'),
          env.KV.get('crd_site_logo'),
          env.KV.get('crd_hero_video_url')
        ]);
        const s = safeJson(raw) || {};
        const logoFromKv = safeJson(logoRaw) || '';
        const videoUrl = safeJson(videoRaw) || '';
        return json({
          logo_url: s.logoUrl || (typeof logoFromKv === 'string' ? logoFromKv : '') || '',
          hero_video_url: typeof videoUrl === 'string' ? videoUrl : '',
          whatsapp: s.waSuffix || '',
          website: s.entregaWebUrl || '',
          instagram: s.instagram || '',
          entregaIgUrl: s.entregaIgUrl || ''
        });
      }

      // ── Hero video — sirve desde R2, fallback a Drive proxy ──────────────
      if (path === '/api/hero-video') {
        const rangeHeader = request.headers.get('Range');
        const commonHeaders = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
        };

        if (rangeHeader) {
          // head() para metadata sin abrir el body, luego get() solo del rango
          const meta = await env.MEDIA.head('hero-video.mp4');
          if (meta) {
            const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (!m) return new Response('Range Not Satisfiable', { status: 416 });
            const offset = parseInt(m[1]);
            const end = m[2] ? Math.min(parseInt(m[2]), meta.size - 1) : meta.size - 1;
            const length = end - offset + 1;
            const obj = await env.MEDIA.get('hero-video.mp4', { range: { offset, length } });
            return new Response(obj?.body ?? null, {
              status: 206,
              headers: { ...commonHeaders,
                'Content-Type': meta.httpMetadata?.contentType || 'video/mp4',
                'Content-Range': `bytes ${offset}-${end}/${meta.size}`,
                'Content-Length': String(length),
              }
            });
          }
        } else {
          const obj = await env.MEDIA.get('hero-video.mp4');
          if (obj) {
            return new Response(obj.body, {
              status: 200,
              headers: { ...commonHeaders,
                'Content-Type': obj.httpMetadata?.contentType || 'video/mp4',
                'Content-Length': String(obj.size),
              }
            });
          }
        }

        // Fallback: Drive proxy
        const safeStr = (v) => { if (!v) return ''; try { return JSON.parse(v); } catch { return v || ''; } };
        const videoUrl = safeStr(await env.KV.get('crd_hero_video_url'));
        const mv = videoUrl.match(/id=([a-zA-Z0-9_-]+)/) || videoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const heroFileId = mv ? mv[1] : null;
        if (!heroFileId) return new Response('', { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
        return proxyGdrive(heroFileId, request, env);
      }

      // ── Hero video: descarga desde Drive y pisa R2 ────────────────────────
      if (path === '/api/hero-video/from-drive' && method === 'POST') {
        const cfAuth = env.CF_AUTH_TOKEN || '';
        if (!cfAuth || request.headers.get('Authorization') !== cfAuth)
          return json({ error: 'Unauthorized' }, 401);
        const { fileId } = await request.json();
        if (!fileId) return json({ error: 'fileId requerido' }, 400);

        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
        let driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        let resp = await fetch(driveUrl, { headers: { 'User-Agent': ua }, redirect: 'follow' });
        const ct = resp.headers.get('content-type') || '';
        if (ct.includes('text/html')) {
          const html = await resp.text();
          const m = html.match(/confirm=([^&"'\s]+)/);
          if (!m) return json({ error: 'Drive: no se pudo obtener confirm token' }, 502);
          driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${m[1]}`;
          resp = await fetch(driveUrl, { headers: { 'User-Agent': ua }, redirect: 'follow' });
        }
        const contentType = resp.headers.get('content-type') || 'video/mp4';
        await env.MEDIA.put('hero-video.mp4', resp.body, { httpMetadata: { contentType } });
        return json({ ok: true });
      }

      // ── Google Drive video proxy (bypasses CORS + virus warning) ───────────
      if (path.startsWith('/api/gdrive/')) {
        const fileId = path.split('/api/gdrive/')[1]?.split('/')[0];
        if (!fileId) return json({ error: 'No file ID' }, 400);
        return proxyGdrive(fileId, request, env);
      }

      if (path === '/api/health') return json({ ok: true, worker: 'kuerre-worker', ts: new Date().toISOString() });

      // ── Solicitudes ──────────────────────────────────────────────────────────
      if (path === '/solicitudes' && method === 'POST') return await handleSolicitudesCreate(request, env);
      if (path === '/solicitudes' && method === 'GET') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleSolicitudesList(env, request);
      }
      const solicitudDelMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})$/);
      if (solicitudDelMatch && method === 'DELETE') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleSolicitudesDelete(solicitudDelMatch[1], env);
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      const status = e.message?.includes('Unauthorized') ? 401 : 500;
      return json({ error: e.message || 'Internal error' }, status);
    }
  },
};
