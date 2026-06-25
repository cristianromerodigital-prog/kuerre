import { corsHeaders, json, mountCoreRouter } from '@crd/kuerre-core';

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

      // ── Google Drive video proxy (bypasses CORS + virus warning) ───────────
      if (path.startsWith('/api/gdrive/')) {
        const fileId = path.split('/api/gdrive/')[1]?.split('/')[0];
        if (!fileId) return json({ error: 'No file ID' }, 400);
        const rangeHeader = request.headers.get('Range') || '';
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        const baseHeaders = { 'User-Agent': ua, 'Accept': '*/*' };
        if (rangeHeader) baseHeaders['Range'] = rangeHeader;

        // Paso 1: primera request (sin redireccion para capturar cookies)
        const resp1 = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, {
          headers: baseHeaders, redirect: 'manual'
        });

        // Redirect directo al archivo → devolver la URL al browser
        if (resp1.status === 302 || resp1.status === 301) {
          const loc = resp1.headers.get('location');
          if (loc) {
            const rh = new Headers({ 'Access-Control-Allow-Origin': '*', 'Location': loc });
            return new Response(null, { status: 302, headers: rh });
          }
        }

        // Google devolvio HTML (warning de virus para archivos grandes)
        const cookies = resp1.headers.get('set-cookie') || '';
        const html = await resp1.text();
        const confirmM = html.match(/confirm=([^&"'\s]+)/);
        if (!confirmM) return new Response('Drive: no se encontro token de confirmacion', { status: 502 });

        const confirm = confirmM[1];
        const uuidM = html.match(/uuid=([^&"'\s]+)/);
        const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirm}${uuidM ? '&uuid=' + uuidM[1] : ''}`;
        const confirmHeaders = { ...baseHeaders };
        if (cookies) confirmHeaders['Cookie'] = cookies.split(';')[0]; // NID cookie

        const resp2 = await fetch(confirmUrl, { headers: confirmHeaders, redirect: 'manual' });

        // Si redirige al archivo real
        if (resp2.status === 302 || resp2.status === 301) {
          const loc = resp2.headers.get('location');
          if (loc) {
            const rh = new Headers({ 'Access-Control-Allow-Origin': '*', 'Location': loc });
            return new Response(null, { status: 302, headers: rh });
          }
        }

        // Proxy del stream con soporte Range completo
        const finalResp = resp2.status === 200 || resp2.status === 206
          ? resp2
          : await fetch(confirmUrl, { headers: confirmHeaders, redirect: 'follow' });

        const vh = new Headers({
          'Access-Control-Allow-Origin': '*',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=1800',
        });
        const fct = finalResp.headers.get('content-type'); if (fct) vh.set('Content-Type', fct);
        const fcl = finalResp.headers.get('content-length'); if (fcl) vh.set('Content-Length', fcl);
        const fcr = finalResp.headers.get('content-range'); if (fcr) vh.set('Content-Range', fcr);
        return new Response(finalResp.body, { status: finalResp.status, headers: vh });
      }

      if (path === '/api/health') return json({ ok: true, worker: 'kuerre-worker', ts: new Date().toISOString() });

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      const status = e.message?.includes('Unauthorized') ? 401 : 500;
      return json({ error: e.message || 'Internal error' }, status);
    }
  },
};
