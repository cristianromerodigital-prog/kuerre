// Kuerre Worker — QR Fiestas, Premiere e Invitaciones

// ─── Helpers ────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

function corsHeaders() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    },
  });
}

function nowISO() {
  return new Date().toISOString();
}

function generateEventId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  for (const b of bytes) id += chars[b % chars.length];
  return id;
}

function makeEventSlug(nombre, fecha) {
  const base = (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return (fecha ? `${base}-${fecha}` : base).slice(0, 55);
}

async function resolveEventId(identifier, env) {
  if (/^[A-Z2-9]{6}$/.test(identifier)) return identifier;
  return await env.KV.get('fiesta_slug_' + identifier);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function fotoIdFromUrl(url) {
  const m = url.match(/\/d\/([^/?#]+)/);
  return m ? m[1] : url;
}

const _MALAS_W = ['pija','poronga','verga','chota','garcha','concha','cajeta','orto','culo','teta','garchar','culear','coger','pete','petera','petero','chuparla','chupame','chupala','pajero','pajera','pajerear','paja','bolas','pelotas','huevos','forro','forrear','boludo','boluda','pelotudo','pelotuda','sorete','gil','garca','cagon','cagona','puto','puta','trola','choto','degenerado','degenerada','baboso','satiro','lacra','rompebolas','rompepelotas','hinchapelotas','tocapelotas','chupapija','mierda','carajo','cagar'];
const _MALAS_F = ['hijo de puta','hdp','la concha','la puta','la re puta','la reput','me chupa','andate a la mierda','cerr el orto'];

function hasBadWord(text) {
  const norm = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/0/g,'o').replace(/1/g,'i').replace(/3/g,'e').replace(/4/g,'a').replace(/\$/g,'s').replace(/@/g,'a').replace(/!/g,'i');
  return [..._MALAS_F, ..._MALAS_W].some(w => norm.includes(w));
}

// ─── JWT (HMAC-SHA256) ───────────────────────────────────────────────────────

function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromb64url(str) {
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

async function signJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  const sigB64 = b64url(String.fromCharCode(...new Uint8Array(sig)));
  return `${data}.${sigB64}`;
}

async function verifyJWT(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');
  const [header, body, sig] = parts;
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const sigBytes = Uint8Array.from(fromb64url(sig), c => c.charCodeAt(0));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(data));
  if (!valid) throw new Error('Invalid token');
  const payload = JSON.parse(fromb64url(body));
  if (payload.exp && payload.exp < Date.now() / 1000) throw new Error('Token expired');
  return payload;
}

// ─── Auth middleware ─────────────────────────────────────────────────────────

async function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return false;
  try {
    const payload = await verifyJWT(auth.slice(7), env.ADMIN_JWT_SECRET);
    return payload.role === 'admin';
  } catch {
    return false;
  }
}

async function handleAdminLogin(request, env) {
  const { user, pass } = await request.json().catch(() => ({}));
  if (!user || !pass) return json({ error: 'Credenciales requeridas' }, 400);

  const stored = await env.KV.get('admin_creds');
  const creds = stored ? JSON.parse(stored) : { user: env.ADMIN_USER, pass: env.ADMIN_PASS };

  if (!creds || user !== creds.user || pass !== creds.pass) {
    return json({ error: 'Usuario o contraseña incorrectos' }, 401);
  }

  const token = await signJWT(
    { role: 'admin', exp: Math.floor(Date.now() / 1000) + 8 * 3600 },
    env.ADMIN_JWT_SECRET
  );
  return json({ token, cf_auth: env.CF_AUTH_TOKEN || '' });
}

async function handleAdminChangePassword(request, env) {
  const { pass } = await request.json().catch(() => ({}));
  if (!pass || pass.length < 6) return json({ error: 'Mínimo 6 caracteres' }, 400);

  const stored = await env.KV.get('admin_creds');
  const current = stored ? JSON.parse(stored) : { user: env.ADMIN_USER || 'admin' };

  await env.KV.put('admin_creds', JSON.stringify({ user: current.user, pass }));
  return json({ ok: true });
}

// ─── Eventos Foto helpers ────────────────────────────────────────────────────

async function handleEventosAdmin(path, method, request, env) {
  if ((path === '/eventos/admin/list' || path === '/eventos/admin') && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM eventos_foto ORDER BY fecha DESC'
    ).all();
    return json({ eventos: results });
  }

  if (path === '/eventos/admin' && method === 'POST') {
    const { nombre, fecha, cierre_auto, folder_id, portada, estado, moderacion } = await request.json();
    if (!nombre || !fecha || !folder_id) return json({ error: 'Faltan campos obligatorios' }, 400);
    const id = generateEventId();
    const slug = makeEventSlug(nombre, fecha);
    await env.DB.prepare(`
      INSERT INTO eventos_foto (id, nombre, fecha, cierre_auto, folder_id, portada, estado, moderacion, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, nombre, fecha, cierre_auto || null, folder_id, portada || null,
        estado || 'activo', moderacion ? 1 : 0, nowISO()).run();
    await env.KV.put('fiesta_slug_' + slug, id);
    return json({ ok: true, id, slug });
  }

  if (path === '/eventos/admin/config' && method === 'GET') {
    const gas_url = await env.KV.get('fiestas_gas_url');
    return json({ gas_url: gas_url || '' });
  }

  if (path === '/eventos/admin/config' && method === 'POST') {
    const { gas_url } = await request.json();
    if (!gas_url) return json({ error: 'gas_url requerido' }, 400);
    await env.KV.put('fiestas_gas_url', gas_url);
    return json({ ok: true });
  }

  const putMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})$/);
  if (putMatch && method === 'PUT') {
    const id = putMatch[1];
    const body = await request.json();
    const fields = [];
    const vals = [];
    const allowed = ['nombre', 'fecha', 'cierre_auto', 'folder_id', 'portada', 'estado', 'moderacion'];
    for (const k of allowed) {
      if (body[k] !== undefined) {
        fields.push(`${k} = ?`);
        vals.push(k === 'moderacion' ? (body[k] ? 1 : 0) : (body[k] || null));
      }
    }
    if (!fields.length) return json({ error: 'Nada que actualizar' }, 400);
    vals.push(id);
    await env.DB.prepare(`UPDATE eventos_foto SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
    return json({ ok: true });
  }

  const delMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})$/);
  if (delMatch && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM eventos_foto WHERE id = ?').bind(delMatch[1]).run();
    return json({ ok: true });
  }

  const rankingMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/ranking$/);
  if (rankingMatch && method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT foto_id, COUNT(*) as likes FROM foto_likes WHERE evento_id=? GROUP BY foto_id ORDER BY likes DESC'
    ).bind(rankingMatch[1]).all();
    return json({ ranking: results });
  }

  const pendMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/pendientes$/);
  if (pendMatch && method === 'GET') {
    const evento = await env.DB.prepare('SELECT folder_id FROM eventos_foto WHERE id = ?').bind(pendMatch[1]).first();
    if (!evento) return json({ error: 'Evento no encontrado' }, 404);
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
    const res = await fetch(`${gasUrl}?action=getPendientes&folderId=${encodeURIComponent(evento.folder_id)}`);
    return json(await res.json());
  }

  const aprobarMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/pendientes\/([^/]+)\/aprobar$/);
  if (aprobarMatch && method === 'POST') {
    const [, eventoId, fileId] = aprobarMatch;
    const evento = await env.DB.prepare('SELECT folder_id FROM eventos_foto WHERE id = ?').bind(eventoId).first();
    if (!evento) return json({ error: 'Evento no encontrado' }, 404);
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
    const res = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'aprobarFoto', folderId: evento.folder_id, fileId }),
      headers: { 'Content-Type': 'application/json' }
    });
    return json(await res.json());
  }

  const rechazarMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/pendientes\/([^/]+)$/);
  if (rechazarMatch && method === 'DELETE') {
    const [, , fileId] = rechazarMatch;
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
    const res = await fetch(gasUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'rechazarFoto', fileId }),
      headers: { 'Content-Type': 'application/json' }
    });
    return json(await res.json());
  }

  const delFotoMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/fotos\/([^/]+)$/);
  if (delFotoMatch && method === 'DELETE') {
    const [, eventoId, fileId] = delFotoMatch;
    await env.DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(eventoId, fileId).run();
    const gasUrl = await env.KV.get('fiestas_gas_url');
    if (!gasUrl) return json({ ok: true });
    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'rechazarFoto', fileId }),
        headers: { 'Content-Type': 'application/json' }
      });
      return json(await res.json());
    } catch {
      return json({ ok: true });
    }
  }

  return json({ error: 'Route not found' }, 404);
}

async function handleEventoPublico(id, env) {
  const evento = await env.DB.prepare(
    'SELECT id, nombre, fecha, portada, estado, moderacion, cierre_auto FROM eventos_foto WHERE id = ?'
  ).bind(id).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  return json(evento);
}

async function handleEventoFotos(id, env, sessionId) {
  const evento = await env.DB.prepare('SELECT folder_id FROM eventos_foto WHERE id = ?').bind(id).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  const gasUrl = await env.KV.get('fiestas_gas_url');
  if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
  const res = await fetch(`${gasUrl}?action=getFotos&folderId=${encodeURIComponent(evento.folder_id)}`);
  const data = await res.json();

  if (!data.files || !data.files.length) return json(data);

  const fotoIds = data.files.map(f => fotoIdFromUrl(f.url));
  const ph = fotoIds.map(() => '?').join(',');

  const { results: likeCounts } = await env.DB.prepare(
    `SELECT foto_id, COUNT(*) as total FROM foto_likes WHERE evento_id=? AND foto_id IN (${ph}) GROUP BY foto_id`
  ).bind(id, ...fotoIds).all();

  const countMap = {};
  likeCounts.forEach(r => { countMap[r.foto_id] = r.total; });

  let likedSet = new Set();
  if (sessionId) {
    const { results: myLikes } = await env.DB.prepare(
      `SELECT foto_id FROM foto_likes WHERE evento_id=? AND session_id=? AND foto_id IN (${ph})`
    ).bind(id, sessionId, ...fotoIds).all();
    myLikes.forEach(r => likedSet.add(r.foto_id));
  }

  const files = data.files.map(f => {
    const fotoId = fotoIdFromUrl(f.url);
    return { ...f, foto_id: fotoId, likes: countMap[fotoId] || 0, liked: likedSet.has(fotoId) };
  });

  return json({ files });
}

async function handleEventoUpload(id, request, env) {
  const evento = await env.DB.prepare(
    'SELECT folder_id, estado, moderacion, cierre_auto FROM eventos_foto WHERE id = ?'
  ).bind(id).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  if (evento.estado !== 'activo') return json({ error: 'Evento cerrado' }, 403);
  if (evento.cierre_auto && new Date() > new Date(evento.cierre_auto)) return json({ error: 'Evento cerrado' }, 403);

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ error: 'No se recibió archivo' }, 400);

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 15 * 1024 * 1024) return json({ error: 'Archivo demasiado grande (máx 15MB)' }, 400);

  const base64 = arrayBufferToBase64(buffer);
  const gasUrl = await env.KV.get('fiestas_gas_url');
  if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);

  const res = await fetch(gasUrl, {
    method: 'POST',
    body: JSON.stringify({
      action: 'uploadFoto',
      folderId: evento.folder_id,
      moderacion: evento.moderacion === 1,
      base64,
      filename: file.name || `foto_${Date.now()}.jpg`,
      mimeType: file.type || 'image/jpeg'
    }),
    headers: { 'Content-Type': 'application/json' }
  });
  return json(await res.json());
}

// ─── Site config ─────────────────────────────────────────────────────────────

async function handleSiteConfig(env) {
  const raw = await env.KV.get('kuerre_settings');
  const s = raw ? JSON.parse(raw) : {};
  return json({
    logo_url: s.logoUrl || '',
    whatsapp: s.waSuffix || '',
    website: s.entregaWebUrl || '',
    instagram: s.instagram || '',
    entregaIgUrl: s.entregaIgUrl || ''
  });
}

// ─── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return corsHeaders();

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // ── Eventos admin — va primero para no matchear como slug público ──────
      if (path.startsWith('/eventos/admin')) {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleEventosAdmin(path, method, request, env);
      }

      // ── Frases delete (admin) ─────────────────────────────────────────────
      const fraseDelMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/frases\/(\d+)$/);
      if (fraseDelMatch && method === 'DELETE') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        const [, identifier, fraseId] = fraseDelMatch;
        const realId = await resolveEventId(identifier, env);
        if (!realId) return json({ error: 'Evento no encontrado' }, 404);
        const result = await env.DB.prepare('DELETE FROM evento_frases WHERE id=? AND evento_id=?').bind(Number(fraseId), realId).run();
        if (result.meta?.changes === 0) return json({ error: 'Frase no encontrada' }, 404);
        return json({ ok: true });
      }

      // ── Evento público ────────────────────────────────────────────────────
      const eventoIdMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})$/);
      if (eventoIdMatch && method === 'GET') {
        const realId = await resolveEventId(eventoIdMatch[1], env);
        if (!realId) return json({ error: 'Evento no encontrado' }, 404);
        return await handleEventoPublico(realId, env);
      }

      // ── Frases ───────────────────────────────────────────────────────────
      const frasesMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/frases$/);
      if (frasesMatch) {
        const realId = await resolveEventId(frasesMatch[1], env);
        if (!realId) return json({ error: 'Evento no encontrado' }, 404);
        if (method === 'GET') {
          const { results } = await env.DB.prepare(
            'SELECT id, texto, nombre, created_at FROM evento_frases WHERE evento_id=? ORDER BY created_at DESC LIMIT 50'
          ).bind(realId).all();
          return json({ frases: results });
        }
        if (method === 'POST') {
          const { texto, nombre } = await request.json().catch(() => ({}));
          if (!texto || texto.trim().length < 3) return json({ error: 'Frase muy corta (mínimo 3 caracteres)' }, 400);
          if (texto.trim().length > 150) return json({ error: 'Frase demasiado larga (máx 150 caracteres)' }, 400);
          if (!await isAdmin(request, env) && hasBadWord(texto)) return json({ error: 'La frase contiene palabras no permitidas' }, 400);
          const evento = await env.DB.prepare('SELECT id FROM eventos_foto WHERE id=?').bind(realId).first();
          if (!evento) return json({ error: 'Evento no encontrado' }, 404);
          const nombreClean = nombre ? nombre.trim().slice(0, 40) : null;
          await env.DB.prepare('INSERT INTO evento_frases (evento_id, texto, nombre) VALUES (?,?,?)').bind(realId, texto.trim(), nombreClean).run();
          return json({ ok: true });
        }
      }

      // ── Likes ─────────────────────────────────────────────────────────────
      const likeMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/fotos\/([^/]+)\/like$/);
      if (likeMatch && method === 'POST') {
        const [, identifier, fotoId] = likeMatch;
        const realId = await resolveEventId(identifier, env);
        if (!realId) return json({ error: 'Evento no encontrado' }, 404);
        const { session_id } = await request.json().catch(() => ({}));
        if (!session_id) return json({ error: 'session_id requerido' }, 400);
        const existing = await env.DB.prepare(
          'SELECT 1 FROM foto_likes WHERE evento_id=? AND foto_id=? AND session_id=?'
        ).bind(realId, fotoId, session_id).first();
        if (existing) {
          await env.DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=? AND session_id=?').bind(realId, fotoId, session_id).run();
        } else {
          await env.DB.prepare('INSERT INTO foto_likes (evento_id, foto_id, session_id) VALUES (?,?,?)').bind(realId, fotoId, session_id).run();
        }
        const row = await env.DB.prepare('SELECT COUNT(*) as total FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(realId, fotoId).first();
        return json({ ok: true, liked: !existing, likes: row.total });
      }

      // ── Fotos ─────────────────────────────────────────────────────────────
      const eventoFotosMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/fotos$/);
      if (eventoFotosMatch) {
        const realId = await resolveEventId(eventoFotosMatch[1], env);
        if (!realId) return json({ error: 'Evento no encontrado' }, 404);
        if (method === 'GET') return await handleEventoFotos(realId, env, url.searchParams.get('session'));
        if (method === 'POST') return await handleEventoUpload(realId, request, env);
      }

      // ── Admin auth ────────────────────────────────────────────────────────
      if (path === '/admin/login' && method === 'POST') return await handleAdminLogin(request, env);
      if (path === '/admin/change-password' && method === 'POST') {
        if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
        return await handleAdminChangePassword(request, env);
      }

      // ── Site config ───────────────────────────────────────────────────────
      if (path === '/site/config' && method === 'GET') return await handleSiteConfig(env);

      // ── KV directo (branding settings read/write) ────────────────────────
      const kvMatch = path.match(/^\/([a-z][a-z0-9_]+)$/);
      if (kvMatch) {
        const auth = request.headers.get('Authorization') || '';
        const key = kvMatch[1];
        if (method === 'GET') {
          if (auth !== 'crd2025') return json({ error: 'Unauthorized' }, 401);
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

      if (path === '/api/health') return json({ ok: true, worker: 'kuerre-worker', ts: nowISO() });

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      const status = (e.message?.includes('token') || e.message?.includes('Unauthorized')) ? 401 : 500;
      return json({ error: e.message || 'Internal error' }, status);
    }
  },
};
