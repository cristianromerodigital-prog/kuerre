import { corsHeaders, json, mountCoreRouter } from '@crd/kuerre-core';

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
        const r2obj = await env.MEDIA.get('hero-video.mp4');
        if (r2obj) {
          const rangeHeader = request.headers.get('Range');
          const resHeaders = {
            'Content-Type': r2obj.httpMetadata?.contentType || 'video/mp4',
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*',
          };
          if (!rangeHeader) {
            resHeaders['Content-Length'] = String(r2obj.size);
            return new Response(r2obj.body, { status: 200, headers: resHeaders });
          }
          const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (!m) return new Response('Range Not Satisfiable', { status: 416 });
          const offset = parseInt(m[1]);
          const end = m[2] ? parseInt(m[2]) : r2obj.size - 1;
          const length = end - offset + 1;
          const rangedObj = await env.MEDIA.get('hero-video.mp4', { range: { offset, length } });
          resHeaders['Content-Range'] = `bytes ${offset}-${end}/${r2obj.size}`;
          resHeaders['Content-Length'] = String(length);
          return new Response(rangedObj?.body ?? null, { status: 206, headers: resHeaders });
        }
        // Fallback: Drive proxy (mientras no haya video en R2)
        const safeStr = (v) => { if (!v) return ''; try { return JSON.parse(v); } catch { return v || ''; } };
        const videoUrl = safeStr(await env.KV.get('crd_hero_video_url'));
        const mv = videoUrl.match(/id=([a-zA-Z0-9_-]+)/) || videoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
        const heroFileId = mv ? mv[1] : null;
        if (!heroFileId) return new Response('', { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
        return proxyGdrive(heroFileId, request, env);
      }

      // ── Google Drive video proxy (bypasses CORS + virus warning) ───────────
      if (path.startsWith('/api/gdrive/')) {
        const fileId = path.split('/api/gdrive/')[1]?.split('/')[0];
        if (!fileId) return json({ error: 'No file ID' }, 400);
        return proxyGdrive(fileId, request, env);
      }

      if (path === '/api/health') return json({ ok: true, worker: 'kuerre-worker', ts: new Date().toISOString() });

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      const status = e.message?.includes('Unauthorized') ? 401 : 500;
      return json({ error: e.message || 'Internal error' }, status);
    }
  },
};
