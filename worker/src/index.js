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

      // ── Google Drive video: extrae URL directa de streaming y redirige ──────
      if (path.startsWith('/api/gdrive/')) {
        const fileId = path.split('/api/gdrive/')[1]?.split('/')[0];
        if (!fileId) return json({ error: 'No file ID' }, 400);
        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
        // Paso 1: pedir la página de vista para extraer la URL de streaming real
        const viewResp = await fetch(`https://drive.google.com/file/d/${fileId}/view`, {
          headers: { 'User-Agent': ua }
        });
        const html = await viewResp.text();
        // Buscar URL de streaming directa (redirector.googlevideo.com)
        const streamMatch = html.match(/https:\/\/[^"'\\]+redirector\.googlevideo\.com[^"'\\]+/);
        if (streamMatch) {
          const streamUrl = streamMatch[0].replace(/\\u003d/g,'=').replace(/\\u0026/g,'&').replace(/\\/g,'');
          return Response.redirect(streamUrl, 302);
        }
        // Fallback: uc?export=download con bypass de confirmación
        const dlResp = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, {
          headers: { 'User-Agent': ua }, redirect: 'follow'
        });
        const dlCt = dlResp.headers.get('content-type') || '';
        if (dlCt.includes('text/html')) {
          const dlHtml = await dlResp.text();
          const confirm = (dlHtml.match(/confirm=([^&"'\s]+)/) || [])[1];
          if (!confirm) return new Response('No se pudo obtener URL de Drive', { status: 502 });
          const confirmResp = await fetch(
            `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${confirm}`,
            { headers: { 'User-Agent': ua }, redirect: 'follow' }
          );
          const loc = confirmResp.headers.get('location') || confirmResp.url;
          if (loc && !loc.includes('drive.google.com')) return Response.redirect(loc, 302);
          const h = new Headers({ 'Access-Control-Allow-Origin':'*', 'Accept-Ranges':'bytes' });
          const ct2 = confirmResp.headers.get('content-type'); if(ct2) h.set('Content-Type',ct2);
          return new Response(confirmResp.body, { status: confirmResp.status, headers: h });
        }
        const loc = dlResp.headers.get('location') || dlResp.url;
        if (loc && !loc.includes('drive.google.com')) return Response.redirect(loc, 302);
        const h = new Headers({ 'Access-Control-Allow-Origin':'*', 'Accept-Ranges':'bytes' });
        const ct2 = dlResp.headers.get('content-type'); if(ct2) h.set('Content-Type',ct2);
        return new Response(dlResp.body, { status: dlResp.status, headers: h });
      }

      if (path === '/api/health') return json({ ok: true, worker: 'kuerre-worker', ts: new Date().toISOString() });

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      const status = e.message?.includes('Unauthorized') ? 401 : 500;
      return json({ error: e.message || 'Internal error' }, status);
    }
  },
};
