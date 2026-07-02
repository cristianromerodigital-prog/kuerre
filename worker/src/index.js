import { corsHeaders, json, mountCoreRouter, isAdmin, arrayBufferToBase64, resolveEventId } from '@crd/kuerre-core';
import brandedAdminHtml from '../../Productivo/admin.html';

// ── Eventos Hub ──

async function handleHubList(db) {
  const { results } = await db.prepare('SELECT * FROM eventos ORDER BY fecha DESC').all();
  return json(results || []);
}

async function handleHubUpsert(request, db) {
  const d = await request.json();
  if (!d.slug || !d.nombre || !d.fecha) return json({ error: 'slug, nombre y fecha son requeridos' }, 400);
  await db.prepare(`
    INSERT INTO eventos (slug, nombre, fecha, tipo, qr, pm, inv, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      nombre=excluded.nombre, fecha=excluded.fecha, tipo=excluded.tipo,
      qr=excluded.qr, pm=excluded.pm, inv=excluded.inv, notas=excluded.notas
  `).bind(d.slug, d.nombre, d.fecha, d.tipo || 'casamiento', d.qr ? 1 : 0, d.pm ? 1 : 0, d.inv ? 1 : 0, d.notas || '').run();
  return json({ ok: true });
}

async function handleHubView(slug, db) {
  const evento = await db.prepare('SELECT * FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'not found' }, 404);
  const [sols, cts, ents, qrs] = await Promise.all([
    db.prepare('SELECT id, cliente_nombre, cliente_tel FROM solicitudes WHERE evento_id=?').bind(evento.id).all(),
    db.prepare('SELECT numero AS id, cliente, estado, fecha_evento FROM contratos WHERE evento_id=?').bind(evento.id).all(),
    db.prepare('SELECT id FROM entrega_configs WHERE evento_id=?').bind(evento.id).all(),
    db.prepare('SELECT id FROM eventos_foto WHERE evento_id=?').bind(evento.id).all(),
  ]);
  return json({ ...evento, solicitudes: sols.results || [], contratos: cts.results || [], entregas: ents.results || [], qr_eventos: qrs.results || [] });
}

async function handleHubLink(slug, request, db) {
  const { table, id } = await request.json();
  const pkCol = { solicitudes: 'id', contratos: 'id', entrega_configs: 'id', eventos_foto: 'id' };
  if (!pkCol[table]) return json({ error: 'tabla inválida: usar solicitudes|contratos|entrega_configs|eventos_foto' }, 400);
  const evento = await db.prepare('SELECT id FROM eventos WHERE slug=?').bind(slug).first();
  if (!evento) return json({ error: 'evento no encontrado' }, 404);
  await db.prepare(`UPDATE ${table} SET evento_id=? WHERE ${pkCol[table]}=?`).bind(evento.id, id).run();
  return json({ ok: true });
}

async function checkOpenAI(base64, mimeType, apiKey) {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 5,
        messages: [
          { role: 'system', content: 'You are a content moderation AI. Your task is to detect actual nudity, not revealing clothing or swimwear.' },
          { role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}`, detail: 'auto' } },
            { type: 'text', text: 'Analyze this image for two things: 1) Does it show exposed genitals (penis, vagina, anus), bare female nipples, or completely bare buttocks not covered by clothing, underwear, or swimwear? 2) Are there any human faces visible? Answer YES if nudity is present, OR if there are no visible faces AND the image shows close-up skin or body parts. Answer NO if the image is appropriate (swimwear, cleavage, low-cut clothing, and group event photos are acceptable). Answer only YES or NO.' }
          ]}
        ]
      })
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim().toUpperCase() || '';
    const error = data.error?.message;
    const answer = text || (error ? 'YES' : 'NO');
    console.log('[OPENAI]', answer, error || '');
    return { ok: !answer.startsWith('YES') };
  } catch(e) {
    console.error('[OPENAI ERROR]', e.message);
    return { ok: false };
  }
}

async function handleFotoUploadConModeracion(identifier, request, env, ctx, coreEnv) {
  const realId = await resolveEventId(identifier, coreEnv);
  if (!realId) return json({ error: 'Evento no encontrado' }, 404);
  const evento = await env.KUERRE_DB.prepare(
    'SELECT folder_id, estado, moderacion, cierre_auto, storage FROM eventos_foto WHERE id = ?'
  ).bind(realId).first();
  if (!evento) return json({ error: 'Evento no encontrado' }, 404);
  if (evento.estado !== 'activo') return json({ error: 'Evento cerrado' }, 403);
  if (evento.cierre_auto && new Date() > new Date(evento.cierre_auto)) return json({ error: 'Evento cerrado' }, 403);

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file) return json({ error: 'No se recibió archivo' }, 400);

  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 15 * 1024 * 1024) return json({ error: 'Archivo demasiado grande (máx 15MB)' }, 400);

  const base64 = arrayBufferToBase64(buffer);

  if (env.OPENAI_KEY) {
    const monthKey = `vision_count_${new Date().toISOString().slice(0,7)}`;
    const current = parseInt(await env.KUERRE_KV.get(monthKey) || '0');
    await env.KUERRE_KV.put(monthKey, String(current + 1));
    const { ok } = await checkOpenAI(base64, file.type, env.OPENAI_KEY);
    if (!ok) return json({ error: 'Foto no permitida en esta galería.' }, 400);
  }

  // ── Upload: R2 inmediato + Drive en background ───────────────────────────
  if (evento.storage === 'r2') {
    const ext = ((file.name || 'foto.jpg').split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
    const key = `eventos/${realId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await env.MEDIA.put(key, buffer, { httpMetadata: { contentType: file.type || 'image/jpeg' } });
    const workerOrigin = new URL(request.url).origin;
    if (evento.folder_id) {
      const gasUrl = await env.KUERRE_KV.get('fiestas_gas_url');
      if (gasUrl && ctx) ctx.waitUntil(gasUploadBackground(gasUrl, evento.folder_id, buffer, file.name || `foto_${Date.now()}.jpg`, file.type || 'image/jpeg', realId, env));
    }
    return json({ ok: true, file: { url: `${workerOrigin}/api/fotos/${encodeURIComponent(key)}`, name: file.name } });
  }

  // ── Drive directo (storage='drive' — comportamiento original) ────────────
  const gasUrl = await env.KUERRE_KV.get('fiestas_gas_url');
  if (!gasUrl) return json({ error: 'GAS URL no configurada' }, 500);
  const res = await fetch(gasUrl, {
    method: 'POST',
    redirect: 'follow',
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

async function handleFotoListR2(eventoId, request, env) {
  const sessionId = new URL(request.url).searchParams.get('session') || '';
  const listed = await env.MEDIA.list({ prefix: `eventos/${eventoId}/` });
  const objects = (listed.objects || []).sort((a, b) => Number(b.uploaded) - Number(a.uploaded));
  if (!objects.length) return json({ files: [] });

  const workerOrigin = new URL(request.url).origin;
  const fotoIds = objects.map(o => o.key);
  const ph = fotoIds.map(() => '?').join(',');

  const { results: likeCounts } = await env.KUERRE_DB.prepare(
    `SELECT foto_id, COUNT(*) as total FROM foto_likes WHERE evento_id=? AND foto_id IN (${ph}) GROUP BY foto_id`
  ).bind(eventoId, ...fotoIds).all();

  const countMap = {};
  likeCounts.forEach(r => { countMap[r.foto_id] = r.total; });

  let likedSet = new Set();
  if (sessionId) {
    const { results: myLikes } = await env.KUERRE_DB.prepare(
      `SELECT foto_id FROM foto_likes WHERE evento_id=? AND session_id=? AND foto_id IN (${ph})`
    ).bind(eventoId, sessionId, ...fotoIds).all();
    myLikes.forEach(r => likedSet.add(r.foto_id));
  }

  const files = objects.map(o => ({
    url: `${workerOrigin}/api/fotos/${encodeURIComponent(o.key)}`,
    foto_id: o.key,
    likes: countMap[o.key] || 0,
    liked: likedSet.has(o.key),
    name: o.key.split('/').pop()
  }));

  return json({ files });
}

// Reset del evento demo: borra fotos/likes/frases no incluidos en el seed (KV demo_seed)
async function resetDemoEvent(env) {
  const demoId = await env.KUERRE_KV.get('fiesta_slug_demo');
  if (!demoId) return { ok: false, error: 'fiesta_slug_demo no configurado' };
  let seed = { keys: [], fraseIds: [] };
  try { seed = JSON.parse(await env.KUERRE_KV.get('demo_seed')) || seed; } catch {}
  const seedKeys = new Set(seed.keys || []);
  const listed = await env.MEDIA.list({ prefix: `eventos/${demoId}/` });
  let deleted = 0;
  for (const obj of (listed.objects || [])) {
    if (seedKeys.has(obj.key)) continue;
    await env.MEDIA.delete(obj.key);
    await env.KUERRE_DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(demoId, obj.key).run();
    deleted++;
  }
  const fraseIds = (seed.fraseIds || []).map(Number).filter(n => !isNaN(n));
  if (fraseIds.length) {
    const ph = fraseIds.map(() => '?').join(',');
    await env.KUERRE_DB.prepare(`DELETE FROM evento_frases WHERE evento_id=? AND id NOT IN (${ph})`).bind(demoId, ...fraseIds).run();
  } else {
    await env.KUERRE_DB.prepare('DELETE FROM evento_frases WHERE evento_id=?').bind(demoId).run();
  }
  return { ok: true, deleted };
}

async function gasUploadBackground(gasUrl, folderId, buffer, filename, mimeType, eventoId, env) {
  try {
    const base64 = arrayBufferToBase64(buffer);
    const res = await fetch(gasUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'uploadFoto', folderId, moderacion: false, base64, filename, mimeType })
    });
    if (!res.ok) throw new Error(`GAS status ${res.status}`);
  } catch (e) {
    const errKey = `drive_sync_err_${eventoId}_${Date.now()}`;
    await env.KUERRE_KV.put(errKey, JSON.stringify({ folderId, filename, error: e.message, ts: Date.now() }), { expirationTtl: 86400 * 7 });
  }
}

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
  let cliente2_nombre = '', quinceanera_nombre = '', hora_inicio = '', hora_fin = '', invitados = '';
  let civil_fecha = '', civil_hora = '', civil_dir = '';
  let reli_fecha = '', reli_hora = '', reli_dir = '';

  if (tipo === 'BODA') {
    const { novia, novio, fiesta, civil, religiosa } = body;
    nombre_display = `${novia?.nombre || ''} & ${novio?.nombre || ''}`;
    fecha = fiesta?.fecha || ''; salon = fiesta?.salon || ''; direccion = fiesta?.direccion || '';
    cliente_nombre = novia?.nombre || ''; cliente_tel = novia?.telefono || ''; cliente_email = novia?.email || '';
    cliente2_nombre = novio?.nombre || '';
    hora_inicio = fiesta?.horaInicio || ''; hora_fin = fiesta?.horaFin || ''; invitados = fiesta?.invitados || '';
    if (civil) { civil_fecha = civil.fecha||''; civil_hora = civil.horario||''; civil_dir = civil.direccion||''; }
    if (religiosa) { reli_fecha = religiosa.fecha||''; reli_hora = religiosa.horario||''; reli_dir = religiosa.direccion||''; }
  } else if (tipo === 'XV') {
    const { quinceanera, cliente, evento } = body;
    nombre_display = `XV ${quinceanera?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
    cliente2_nombre = quinceanera?.nombre || ''; quinceanera_nombre = quinceanera?.nombre || '';
    hora_inicio = evento?.horaInicio || ''; hora_fin = evento?.horaFin || ''; invitados = evento?.invitados || '';
  } else {
    const { cliente, evento } = body;
    nombre_display = `Cumple ${cliente?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
    hora_inicio = evento?.horaInicio || ''; hora_fin = evento?.horaFin || ''; invitados = evento?.invitados || '';
  }

  if (!fecha) return json({ error: 'Fecha del evento requerida' }, 400);
  const now = nowISO();
  const eventoSlug = nombre_display.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    + '-' + fecha;

  // Upsert evento y obtener su id
  await env.KUERRE_DB.prepare(`INSERT OR IGNORE INTO eventos (slug,nombre,fecha,tipo,qr,pm,inv) VALUES (?,?,?,?,1,1,1)`)
    .bind(eventoSlug, nombre_display, fecha, tipo).run();
  const eventoRow = await env.KUERRE_DB.prepare('SELECT id FROM eventos WHERE slug=?').bind(eventoSlug).first();
  const eventoId = eventoRow.id;

  for (let attempt = 0; attempt < 2; attempt++) {
    const id = generateEventId();
    const fiesta_id = generateEventId();
    try {
      await env.KUERRE_DB.batch([
        env.KUERRE_DB.prepare(`INSERT INTO solicitudes
          (id, salon, direccion, cliente_nombre, cliente_tel, cliente_email,
           cliente2_nombre, quinceanera_nombre, hora_inicio, hora_fin, invitados,
           civil_fecha, civil_hora, civil_dir, reli_fecha, reli_hora, reli_dir,
           data_json, fiesta_id, invite_slug, evento_id, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, salon, direccion, cliente_nombre, cliente_tel, cliente_email,
            cliente2_nombre, quinceanera_nombre, hora_inicio, hora_fin, invitados,
            civil_fecha, civil_hora, civil_dir, reli_fecha, reli_hora, reli_dir,
            JSON.stringify(body), fiesta_id, id, eventoId, now),
        env.KUERRE_DB.prepare(`INSERT INTO eventos_foto (id,cierre_auto,folder_id,portada,estado,moderacion,storage,evento_id,created_at) VALUES (?,NULL,'',NULL,'pendiente',0,'r2',?,?)`)
          .bind(fiesta_id, eventoId, now),
        env.KUERRE_DB.prepare(`INSERT INTO entrega_configs (id,folder_id,portada,overlay,allow_dl,evento_id,created_at) VALUES (?,'',' ','violeta',1,?,?)`)
          .bind(id, eventoId, now),
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
    ? 'WHERE (e.nombre LIKE ? OR s.cliente_nombre LIKE ? OR s.cliente_tel LIKE ?)'
    : '';
  const baseParams = search ? [likeTerm, likeTerm, likeTerm] : [];

  const countRow = await env.KUERRE_DB.prepare(
    `SELECT COUNT(*) AS n FROM solicitudes s LEFT JOIN eventos e ON e.id = s.evento_id ${where}`
  ).bind(...baseParams).first();
  const total = countRow ? countRow.n : 0;

  const { results } = await env.KUERRE_DB.prepare(`
    SELECT s.*, e.fecha, e.tipo, e.nombre AS nombre_display,
           ef.estado AS fiesta_estado, ec.folder_id AS entrega_folder
    FROM solicitudes s
    LEFT JOIN eventos e ON e.id = s.evento_id
    LEFT JOIN eventos_foto ef ON ef.id = s.fiesta_id
    LEFT JOIN entrega_configs ec ON ec.id = s.id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...baseParams, limit, offset).all();

  return json({ solicitudes: results, total, limit, offset });
}

async function handleSolicitudesDelete(id, env) {
  const sol = await env.KUERRE_DB.prepare('SELECT * FROM solicitudes WHERE id = ?').bind(id).first();
  if (!sol) return json({ error: 'No encontrada' }, 404);
  await env.KUERRE_DB.batch([
    env.KUERRE_DB.prepare('DELETE FROM solicitudes WHERE id = ?').bind(id),
    env.KUERRE_DB.prepare('DELETE FROM entrega_configs WHERE id = ?').bind(id),
    env.KUERRE_DB.prepare('DELETE FROM eventos_foto WHERE id = ?').bind(sol.fiesta_id),
  ]);
  return json({ ok: true });
}

async function handleCrearCarpetas(id, request, env) {
  const sol = await env.KUERRE_DB.prepare('SELECT * FROM solicitudes WHERE id = ?').bind(id).first();
  if (!sol) return json({ error: 'Solicitud no encontrada' }, 404);

  const { codigoContrato, driveRoot } = await request.json();
  if (!codigoContrato) return json({ error: 'codigoContrato requerido' }, 400);

  if (sol.drive_cliente_id) {
    return json({
      ok: true,
      alreadyExists: true,
      ids: {
        cliente: sol.drive_cliente_id,
        fiesta: sol.drive_fiesta_id,
        entrega: sol.drive_entrega_id,
        contrato: sol.drive_contrato_id,
        invitacion: sol.drive_invitacion_id
      }
    });
  }

  const gasUrl = await env.KUERRE_KV.get('fiestas_gas_url');
  if (!gasUrl) return json({ error: 'GAS URL no configurada. Configurá el GAS en el panel QR - Fiestas.' }, 500);

  const gasRes = await fetch(gasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'crearCarpetasCliente',
      codigoContrato,
      nombreDisplay: sol.nombre_display,
      fecha: sol.fecha,
      tipo: sol.tipo,
      driveRoot: driveRoot || ''
    })
  });

  const gasData = await gasRes.json();
  if (!gasData.ok) return json({ error: gasData.error || 'Error en GAS al crear carpetas' }, 500);

  const { ids } = gasData;

  await env.KUERRE_DB.batch([
    env.KUERRE_DB.prepare(`
      UPDATE solicitudes
      SET codigo_contrato=?, drive_cliente_id=?, drive_fiesta_id=?, drive_entrega_id=?, drive_contrato_id=?, drive_invitacion_id=?
      WHERE id=?
    `).bind(codigoContrato, ids.cliente, ids.fiesta, ids.entrega, ids.contrato || '', ids.invitacion || '', id),
    env.KUERRE_DB.prepare(`UPDATE eventos_foto SET folder_id=?, estado='activo' WHERE id=?`)
      .bind(ids.fiesta, sol.fiesta_id),
    env.KUERRE_DB.prepare(`UPDATE entrega_configs SET folder_id=? WHERE id=?`)
      .bind(ids.entrega, id),
  ]);

  return json({ ok: true, ids });
}

async function proxyGdrive(fileId, request, env) {
  const rangeHeader = request.headers.get('Range') || '';
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const baseHeaders = { 'User-Agent': ua, 'Accept': '*/*' };

  const kvKey = `gdrive_confirm_${fileId}`;
  let confirmUrl = await env.KUERRE_KV.get(kvKey);

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
      await env.KUERRE_KV.put(kvKey, confirmUrl, { expirationTtl: 480 });
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
    await env.KUERRE_KV.delete(kvKey);
    const r2 = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`, { headers: baseHeaders, redirect: 'follow' });
    const h2 = await r2.text();
    const m2 = h2.match(/confirm=([^&"'\s]+)/);
    if (m2) {
      const newUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${m2[1]}`;
      await env.KUERRE_KV.put(kvKey, newUrl, { expirationTtl: 480 });
      return await tryFetch(newUrl);
    }
  }
  return result;
}

// ── Contratos (mismo schema que CRP) ──

async function handleContratosList(env) {
  const { results } = await env.KUERRE_DB.prepare(`
    SELECT c.*, COALESCE(e.fecha, c.fecha_evento) AS fecha_ev, e.tipo, e.nombre AS nombre_evento
    FROM contratos c
    LEFT JOIN eventos e ON e.id = c.evento_id
    ORDER BY c.numero DESC
  `).all();
  return json(results || []);
}

async function handleContratosUpsert(request, env) {
  const body = await request.json().catch(() => ({}));
  const {
    numero, fecha_gen, fecha_evento, cliente, cliente2, lugar, precio, cuotas, estado, doc_url, pdf_url, notas, solicitud_id,
    cliente_dni, cliente_tel, cliente_email,
    cliente2_nac, cliente2_dni, cliente2_dom, cliente2_tel, cliente2_email,
    hora_inicio, hora_fin, direccion, invitados, ciudad, dia_firma, nombre_paquete, servicios,
    contacto_nombre, contacto_rel, contacto_tel,
    civil_fecha, civil_hora, civil_dir,
    reli_fecha, reli_hora, reli_dir,
    formas_pago
  } = body;
  if (!numero) return json({ error: 'numero requerido' }, 400);
  let evento_id = null;
  if (solicitud_id) {
    const sol = await env.KUERRE_DB.prepare('SELECT evento_id FROM solicitudes WHERE id=?').bind(solicitud_id).first();
    evento_id = sol?.evento_id || null;
  }
  await env.KUERRE_DB.prepare(`
    INSERT INTO contratos
      (numero, fecha_gen, fecha_evento, cliente, cliente2, lugar, precio, cuotas, estado, doc_url, pdf_url, notas, solicitud_id, evento_id,
       cliente_dni, cliente_tel, cliente_email, cliente2_nac, cliente2_dni, cliente2_dom, cliente2_tel, cliente2_email,
       hora_inicio, hora_fin, direccion, invitados, ciudad, dia_firma, nombre_paquete, servicios,
       contacto_nombre, contacto_rel, contacto_tel, civil_fecha, civil_hora, civil_dir, reli_fecha, reli_hora, reli_dir, formas_pago)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?, ?)
    ON CONFLICT(numero) DO UPDATE SET
      fecha_gen=excluded.fecha_gen, fecha_evento=excluded.fecha_evento,
      cliente=excluded.cliente, cliente2=excluded.cliente2,
      lugar=excluded.lugar, precio=excluded.precio, cuotas=excluded.cuotas, estado=excluded.estado,
      doc_url=excluded.doc_url, pdf_url=excluded.pdf_url, notas=excluded.notas,
      solicitud_id=COALESCE(excluded.solicitud_id, contratos.solicitud_id),
      evento_id=COALESCE(excluded.evento_id, contratos.evento_id),
      cliente_dni=excluded.cliente_dni, cliente_tel=excluded.cliente_tel, cliente_email=excluded.cliente_email,
      cliente2_nac=excluded.cliente2_nac, cliente2_dni=excluded.cliente2_dni, cliente2_dom=excluded.cliente2_dom,
      cliente2_tel=excluded.cliente2_tel, cliente2_email=excluded.cliente2_email,
      hora_inicio=excluded.hora_inicio, hora_fin=excluded.hora_fin, direccion=excluded.direccion,
      invitados=excluded.invitados, ciudad=excluded.ciudad, dia_firma=excluded.dia_firma,
      nombre_paquete=excluded.nombre_paquete, servicios=excluded.servicios,
      contacto_nombre=excluded.contacto_nombre, contacto_rel=excluded.contacto_rel, contacto_tel=excluded.contacto_tel,
      civil_fecha=excluded.civil_fecha, civil_hora=excluded.civil_hora, civil_dir=excluded.civil_dir,
      reli_fecha=excluded.reli_fecha, reli_hora=excluded.reli_hora, reli_dir=excluded.reli_dir,
      formas_pago=excluded.formas_pago
  `).bind(
    numero, fecha_gen || '', fecha_evento || '', cliente || '', cliente2 || '', lugar || '',
    precio || 0, cuotas || 1, estado || 'GENERADO',
    doc_url || '', pdf_url || '', notas || '', solicitud_id || null, evento_id,
    cliente_dni || '', cliente_tel || '', cliente_email || '',
    cliente2_nac || '', cliente2_dni || '', cliente2_dom || '', cliente2_tel || '', cliente2_email || '',
    hora_inicio || '', hora_fin || '', direccion || '', invitados || '', ciudad || '',
    dia_firma || '', nombre_paquete || '', servicios || '[]',
    contacto_nombre || '', contacto_rel || '', contacto_tel || '',
    civil_fecha || '', civil_hora || '', civil_dir || '',
    reli_fecha || '', reli_hora || '', reli_dir || '',
    formas_pago || '[]'
  ).run();
  if (fecha_evento) {
    const eid = evento_id || (await env.KUERRE_DB.prepare('SELECT evento_id FROM contratos WHERE numero=?').bind(numero).first())?.evento_id;
    if (eid) {
      await env.KUERRE_DB.prepare('UPDATE eventos SET fecha=? WHERE id=?').bind(fecha_evento, eid).run();
    }
  }
  return json({ ok: true });
}

async function handleContratosDelete(numero, env) {
  const row = await env.KUERRE_DB.prepare('SELECT doc_url, pdf_url FROM contratos WHERE numero=?').bind(numero).first();
  if (!row) return json({ error: 'Contrato no encontrado' }, 404);
  const gasUrl = await env.KUERRE_KV.get('crd_contratos_cfg').then(v => { try { return JSON.parse(v)?.url; } catch(e) { return null; } }).catch(() => null);
  if (gasUrl && (row.doc_url || row.pdf_url)) {
    const docId = row.doc_url ? (row.doc_url.match(/\/d\/([^/?]+)/)?.[1] || null) : null;
    const pdfId = row.pdf_url ? (row.pdf_url.match(/\/d\/([^/?]+)/)?.[1] || null) : null;
    if (docId || pdfId) {
      fetch(gasUrl, { method: 'POST', redirect: 'follow', body: JSON.stringify({ action: 'trashFiles', docId, pdfId }) }).catch(() => {});
    }
  }
  await env.KUERRE_DB.prepare('DELETE FROM contratos WHERE numero=?').bind(numero).run();
  return json({ ok: true });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return corsHeaders();

    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {
      // Normalizar bindings para CORE (espera DB y KV genéricos)
      const coreEnv = {
        DB: env.KUERRE_DB,
        KV: env.KUERRE_KV,
        MEDIA: env.MEDIA,
        ADMIN_JWT_SECRET: env.ADMIN_JWT_SECRET,
        ADMIN_USER: env.ADMIN_USER,
        ADMIN_PASS: env.ADMIN_PASS,
        CF_AUTH_TOKEN: env.CF_AUTH_TOKEN
      };

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

      // ── Moderación fotos con OpenAI (intercepta antes del core) ─────────────
      const fotoUploadMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/fotos$/);
      if (fotoUploadMatch && method === 'POST') {
        return await handleFotoUploadConModeracion(fotoUploadMatch[1], request, env, ctx, coreEnv);
      }

      // ── Vision stats ─────────────────────────────────────────────────────────
      if (path === '/eventos/admin/vision-stats' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const month = new Date().toISOString().slice(0,7);
        const count = parseInt(await env.KUERRE_KV.get(`vision_count_${month}`) || '0');
        const costEstimado = (count * 0.00015).toFixed(4);
        let creditBalance = null;
        try {
          const billingRes = await fetch('https://api.openai.com/v1/dashboard/billing/credit_grants', {
            headers: { 'Authorization': 'Bearer ' + env.OPENAI_KEY }
          });
          if (billingRes.ok) {
            const billingData = await billingRes.json();
            creditBalance = billingData.total_available ?? null;
          }
        } catch(e) {}
        return json({ month, count, costEstimado, creditBalance });
      }

      // ── R2: listado de fotos ───────────────────────────────────────────────
      const fotoListMatch = path.match(/^\/eventos\/([a-zA-Z0-9][a-zA-Z0-9-]{2,49})\/fotos$/);
      if (fotoListMatch && method === 'GET') {
        const eid = await resolveEventId(fotoListMatch[1], coreEnv);
        if (eid) {
          const ev = await env.KUERRE_DB.prepare('SELECT storage FROM eventos_foto WHERE id=?').bind(eid).first();
          if (ev?.storage === 'r2') return await handleFotoListR2(eid, request, env);
        }
      }

      // ── R2: delete foto desde admin ────────────────────────────────────────
      const fotoDelMatch = path.match(/^\/eventos\/admin\/([A-Z2-9]{6})\/fotos\/(.+)$/);
      if (fotoDelMatch && method === 'DELETE') {
        const [, eventoId, rawKey] = fotoDelMatch;
        const ev = await env.KUERRE_DB.prepare('SELECT storage FROM eventos_foto WHERE id=?').bind(eventoId).first();
        if (ev?.storage === 'r2') {
          const key = decodeURIComponent(rawKey);
          await Promise.all([
            env.KUERRE_DB.prepare('DELETE FROM foto_likes WHERE evento_id=? AND foto_id=?').bind(eventoId, key).run(),
            env.MEDIA.delete(key)
          ]);
          return json({ ok: true });
        }
      }

      // ── Admin UI con marca KUERRE — pisa el /admin genérico del core ─────────
      if (path === '/admin' && method === 'GET') {
        return new Response(brandedAdminHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      // ── kuerre-core: eventos, fotos, frases, likes, admin auth + UI ──────────
      const response = await mountCoreRouter(request, coreEnv, url, CORE_OPTIONS);
      if (response) return response;

      // ── Config (D1) ──
      const configMatch = path.match(/^\/config\/(.+)$/);
      if (configMatch) {
        const cfgKey = configMatch[1];
        const _hdrs = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' };
        if (method === 'GET') {
          if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
          const row = await env.KUERRE_DB.prepare('SELECT value FROM config WHERE key=?').bind(cfgKey).first();
          return new Response(row ? row.value : 'null', { headers: _hdrs });
        }
        if (method === 'POST') {
          if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
          const body = await request.text();
          await env.KUERRE_DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind(cfgKey, body).run();
          return json({ ok: true });
        }
      }

      // ── Solicitudes (debe ir antes del KV match genérico) ────────────────
      if (path === '/solicitudes' && method === 'POST') return await handleSolicitudesCreate(request, env);
      if (path === '/solicitudes' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleSolicitudesList(env, request);
      }

      // ── Servicios/precios (ABM en D1 — reemplaza la gsheet; antes del KV match) ──
      if (path === '/servicios' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { results } = await env.KUERRE_DB.prepare('SELECT * FROM servicios ORDER BY orden, id').all();
        return json((results || []).map(s => ({
          ...s,
          label: `[${s.id}] ${s.descripcion} — $${Number(s.pesos || 0).toLocaleString('es-AR')}`
        })));
      }
      if (path === '/servicios' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const d = await request.json();
        if (!d.descripcion || !String(d.descripcion).trim()) return json({ error: 'descripcion requerida' }, 400);
        let id = String(d.id || '').trim();
        if (!id) {
          const max = await env.KUERRE_DB.prepare("SELECT MAX(CAST(id AS INTEGER)) AS m FROM servicios").first();
          id = String((max?.m || 0) + 1).padStart(3, '0');
        }
        await env.KUERRE_DB.prepare(`
          INSERT INTO servicios (id, descripcion, pesos, activo, orden) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET descripcion=excluded.descripcion, pesos=excluded.pesos,
            activo=excluded.activo, orden=excluded.orden
        `).bind(id, String(d.descripcion).trim(), Math.round(Number(d.pesos) || 0),
                (d.activo === 0 || d.activo === false) ? 0 : 1, Number(d.orden) || 0).run();
        return json({ ok: true, id });
      }
      const servicioDelMatch = path.match(/^\/servicios\/([A-Za-z0-9_-]+)$/);
      if (servicioDelMatch && method === 'DELETE') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        await env.KUERRE_DB.prepare('DELETE FROM servicios WHERE id=?').bind(servicioDelMatch[1]).run();
        return json({ ok: true });
      }

      // ── crd_content: lectura pública para index.html ──────────────────────
      if (path === '/crd_content' && method === 'GET') {
        const val = await env.KUERRE_KV.get('crd_content');
        if (val === null) return json({}, 200);
        try { return json(JSON.parse(val)); } catch { return json({}, 200); }
      }

      // ── Demo: snapshot de seed y reset manual ──────────────────────────────
      if (path === '/api/demo/seed-snapshot' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const demoId = await env.KUERRE_KV.get('fiesta_slug_demo');
        if (!demoId) return json({ error: 'fiesta_slug_demo no configurado' }, 400);
        const listedDemo = await env.MEDIA.list({ prefix: `eventos/${demoId}/` });
        const seedKeys = (listedDemo.objects || []).map(o => o.key);
        const { results: demoFrases } = await env.KUERRE_DB.prepare('SELECT id FROM evento_frases WHERE evento_id=?').bind(demoId).all();
        const fraseIds = (demoFrases || []).map(r => r.id);
        await env.KUERRE_KV.put('demo_seed', JSON.stringify({ keys: seedKeys, fraseIds, at: new Date().toISOString() }));
        return json({ ok: true, fotos: seedKeys.length, frases: fraseIds.length });
      }
      if (path === '/api/demo/reset' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return json(await resetDemoEvent(env));
      }

      // ── Invitaciones: config por slug ──────────────────────────────────────
      const invCfgMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})$/);
      if (invCfgMatch && method === 'GET') {
        const invSlug = invCfgMatch[1];
        const rawInv = await env.KUERRE_KV.get('invite_cfg_' + invSlug);
        if (!rawInv) return json({ error: 'Not found' }, 404);
        let invCfg;
        try { invCfg = JSON.parse(rawInv); } catch { return json({ error: 'Config inválida' }, 500); }
        if (invSlug === 'demo') {
          const d = new Date(Date.now() + 21 * 86400000);
          invCfg.fecha_iso = d.toISOString().slice(0, 10) + 'T21:00:00';
          invCfg.fecha_display = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
        }
        return json(invCfg);
      }
      if (invCfgMatch && method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        if (!env.CF_AUTH_TOKEN || auth !== env.CF_AUTH_TOKEN) return json({ error: 'Unauthorized' }, 401);
        const body = await request.text();
        try { JSON.parse(body); } catch { return json({ error: 'JSON inválido' }, 400); }
        await env.KUERRE_KV.put('invite_cfg_' + invCfgMatch[1], body);
        return json({ ok: true });
      }

      // ── KV directo (branding settings read/write) ─────────────────────────
      const kvMatch = path.match(/^\/([a-z][a-z0-9_]+)$/);
      if (kvMatch) {
        const auth = request.headers.get('Authorization') || '';
        const key = kvMatch[1];
        if (method === 'GET') {
          const cfAuth = env.CF_AUTH_TOKEN || '';
          if (!cfAuth || auth !== cfAuth) return json({ error: 'Unauthorized' }, 401);
          const val = await env.KUERRE_KV.get(key);
          if (val === null) return json({ error: 'Not found' }, 404);
          try { return json(JSON.parse(val)); } catch { return new Response(val, { headers: { 'Content-Type': 'text/plain' } }); }
        }
        if (method === 'POST') {
          const cfAuth = env.CF_AUTH_TOKEN || '';
          if (!cfAuth || auth !== cfAuth) return json({ error: 'Unauthorized' }, 401);
          const body = await request.text();
          await env.KUERRE_KV.put(key, body);
          return json({ ok: true });
        }
      }

      // ── Site config ────────────────────────────────────────────────────────
      if (path === '/site/config' && method === 'GET') {
        const safeJson = (v) => { try { return v ? JSON.parse(v) : null; } catch { return v || null; } };
        const [raw, logoRaw, videoRaw] = await Promise.all([
          env.KUERRE_KV.get('crd_settings'),
          env.KUERRE_KV.get('crd_site_logo'),
          env.KUERRE_KV.get('crd_hero_video_url')
        ]);
        const s = safeJson(raw) || {};
        const videoUrl = safeJson(videoRaw) || '';
        const workerOrigin = new URL(request.url).origin;
        return json({
          logo_url: s.logoUrl || (logoRaw ? `${workerOrigin}/api/logo` : ''),
          hero_video_url: typeof videoUrl === 'string' ? videoUrl : '',
          whatsapp: s.waSuffix || '',
          website: s.entregaWebUrl || '',
          instagram: s.instagram || '',
          entregaIgUrl: s.entregaIgUrl || '',
          formulario_fondo: s.formularioFondo || ''
        });
      }

      // ── Logo del sitio — sirve el data-URI de KV como binario cacheable ────
      if (path === '/api/logo' && method === 'GET') {
        const rawLogo = await env.KUERRE_KV.get('crd_site_logo');
        if (!rawLogo) return new Response('Not found', { status: 404 });
        let dataUri = rawLogo;
        try { dataUri = JSON.parse(rawLogo); } catch {}
        if (typeof dataUri !== 'string' || !dataUri) return new Response('Not found', { status: 404 });
        const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUri);
        if (!m) return Response.redirect(dataUri, 302);
        const bin = Uint8Array.from(atob(m[2]), c => c.charCodeAt(0));
        return new Response(bin, {
          headers: {
            'Content-Type': m[1],
            'Cache-Control': 'public, max-age=86400',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // ── R2 foto serve ─────────────────────────────────────────────────────
      if (path.startsWith('/api/fotos/') && method === 'GET') {
        const key = decodeURIComponent(path.slice('/api/fotos/'.length));
        if (!key || key.includes('..')) return new Response('Not found', { status: 404 });
        const obj = await env.MEDIA.get(key);
        if (!obj) return new Response('Not found', { status: 404 });
        return new Response(obj.body, {
          headers: {
            'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'Access-Control-Allow-Origin': '*'
          }
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
        const videoUrl = safeStr(await env.KUERRE_KV.get('crd_hero_video_url'));
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

      const solicitudDelMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})$/);
      if (solicitudDelMatch && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const row = await env.KUERRE_DB.prepare('SELECT * FROM solicitudes WHERE id=?').bind(solicitudDelMatch[1]).first();
        if (!row) return json({ error: 'Not found' }, 404);
        return json({ id: row.id, tipo: row.tipo, data: JSON.parse(row.data_json || '{}') });
      }
      if (solicitudDelMatch && method === 'DELETE') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleSolicitudesDelete(solicitudDelMatch[1], env);
      }
      const inviteMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/invite$/);
      if (inviteMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { invite_id } = await request.json().catch(() => ({}));
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET invite_id = ? WHERE id = ?').bind(invite_id || '', inviteMatch[1]).run();
        return json({ ok: true });
      }
      const contratoMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/contrato$/);
      if (contratoMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { codigo_contrato } = await request.json().catch(() => ({}));
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET codigo_contrato = ? WHERE id = ?').bind(codigo_contrato || '', contratoMatch[1]).run();
        return json({ ok: true });
      }
      const bookMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/book$/);
      if (bookMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { book_fecha, book_hora, book_zona } = await request.json().catch(() => ({}));
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET book_fecha=?, book_hora=?, book_zona=? WHERE id=?').bind(book_fecha||'', book_hora||'', book_zona||'', bookMatch[1]).run();
        return json({ ok: true });
      }
      const carpetasDriveMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/carpetas-drive$/);
      if (carpetasDriveMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { drive_cliente_id } = await request.json().catch(() => ({}));
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET drive_cliente_id=? WHERE id=?').bind(drive_cliente_id||'', carpetasDriveMatch[1]).run();
        return json({ ok: true });
      }
      const carpetasMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/carpetas$/);
      if (carpetasMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleCrearCarpetas(carpetasMatch[1], request, env);
      }
      const contratoPdfMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/contrato-pdf$/);
      if (contratoPdfMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { contrato_pdf_url } = await request.json().catch(() => ({}));
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET contrato_pdf_url=? WHERE id=?').bind(contrato_pdf_url||'', contratoPdfMatch[1]).run();
        return json({ ok: true });
      }
      const agendarMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/agendar$/);
      if (agendarMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { tipo, fecha, hora, lugar } = await request.json().catch(() => ({}));
        const sid = agendarMatch[1];
        if (tipo === 'evento') {
          await env.KUERRE_DB.prepare('UPDATE solicitudes SET fecha=? WHERE id=?').bind(fecha||'', sid).run();
        } else if (tipo === 'book') {
          await env.KUERRE_DB.prepare('UPDATE solicitudes SET book_fecha=?, book_hora=?, book_zona=? WHERE id=?').bind(fecha||'', hora||'', lugar||'', sid).run();
        } else if (tipo === 'civil' || tipo === 'religiosa') {
          const row = await env.KUERRE_DB.prepare('SELECT data_json FROM solicitudes WHERE id=?').bind(sid).first();
          let dj = {};
          try { dj = JSON.parse(row?.data_json || '{}'); } catch(e) {}
          dj[tipo] = { fecha: fecha||'', horario: hora||'', direccion: lugar||'' };
          await env.KUERRE_DB.prepare('UPDATE solicitudes SET data_json=? WHERE id=?').bind(JSON.stringify(dj), sid).run();
        }
        return json({ ok: true });
      }
      const solicitudDataMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/data$/);
      if (solicitudDataMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const sid = solicitudDataMatch[1];
        const body = await request.json().catch(() => ({}));
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET data_json=? WHERE id=?')
          .bind(JSON.stringify(body), sid).run();
        return json({ ok: true });
      }

      // ── RSVP ─────────────────────────────────────────────────────────────────
      const rsvpSlugMatch = path.match(/^\/rsvp\/([a-z0-9-]+)$/);
      if (rsvpSlugMatch) {
        const slug = rsvpSlugMatch[1];
        if (method === 'POST') {
          let body;
          try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
          const { nombre, apellido, asistencia, restricciones, mensaje } = body;
          if (!nombre || !apellido || !asistencia) return json({ error: 'Faltan campos requeridos' }, 400);
          await env.KUERRE_DB.prepare(
            'INSERT INTO rsvp_responses (slug, nombre, apellido, asistencia, restricciones, mensaje) VALUES (?, ?, ?, ?, ?, ?)'
          ).bind(slug, nombre.trim(), apellido.trim(), asistencia, restricciones || '', mensaje || '').run();
          return json({ ok: true });
        }
        if (method === 'GET') {
          const tokenParam = new URL(request.url).searchParams.get('t') || '';
          const storedToken = await env.KUERRE_KV.get('rsvp_token:' + slug);
          const validToken = storedToken && tokenParam === storedToken;
          const admin = await isAdmin(request, coreEnv);
          if (!validToken && !admin) return json({ error: 'Unauthorized' }, 401);
          const rows = await env.KUERRE_DB.prepare(
            'SELECT id, nombre, apellido, asistencia, restricciones, mensaje, mesa, created_at FROM rsvp_responses WHERE slug = ? ORDER BY created_at ASC'
          ).bind(slug).all();
          const responses = rows.results || [];
          return json({ responses, total_si: responses.filter(r => r.asistencia === 'si').length, total_no: responses.filter(r => r.asistencia === 'no').length, total: responses.length });
        }
      }

      const rsvpTokenMatch = path.match(/^\/rsvp-token\/([a-z0-9-]+)$/);
      if (rsvpTokenMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const slug = rsvpTokenMatch[1];
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let token = '';
        const bytes = crypto.getRandomValues(new Uint8Array(8));
        for (const b of bytes) token += chars[b % chars.length];
        await env.KUERRE_KV.put('rsvp_token:' + slug, token, { expirationTtl: 365 * 24 * 3600 });
        return json({ token });
      }

      const rsvpDelMatch = path.match(/^\/rsvp\/([a-z0-9-]+)\/(\d+)$/);
      if (rsvpDelMatch && method === 'DELETE') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const [, slug, id] = rsvpDelMatch;
        await env.KUERRE_DB.prepare('DELETE FROM rsvp_responses WHERE id = ? AND slug = ?').bind(Number(id), slug).run();
        return json({ ok: true });
      }
      if (rsvpDelMatch && method === 'PATCH') {
        const [, slug, id] = rsvpDelMatch;
        const tokenParam = new URL(request.url).searchParams.get('t') || '';
        const storedToken = await env.KUERRE_KV.get('rsvp_token:' + slug);
        const validToken = storedToken && tokenParam === storedToken;
        const admin = await isAdmin(request, coreEnv);
        if (!validToken && !admin) return json({ error: 'Unauthorized' }, 401);
        let body;
        try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
        let mesa = body.mesa;
        if (mesa === '' || mesa === undefined) mesa = null;
        if (mesa !== null) {
          mesa = Number(mesa);
          if (!Number.isInteger(mesa) || mesa < 1 || mesa > 20) return json({ error: 'Mesa inválida' }, 400);
        }
        await env.KUERRE_DB.prepare('UPDATE rsvp_responses SET mesa = ? WHERE id = ? AND slug = ?').bind(mesa, Number(id), slug).run();
        return json({ ok: true });
      }

      // ── Eventos Hub ──
      if (path === '/hub' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubList(env.KUERRE_DB);
      }
      if (path === '/hub' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubUpsert(request, env.KUERRE_DB);
      }
      const hubViewMatch = path.match(/^\/hub\/([a-z0-9-]+)$/);
      if (hubViewMatch && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubView(hubViewMatch[1], env.KUERRE_DB);
      }
      const hubLinkMatch = path.match(/^\/hub\/([a-z0-9-]+)\/link$/);
      if (hubLinkMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleHubLink(hubLinkMatch[1], request, env.KUERRE_DB);
      }

      // ── Contratos ──
      if (path === '/contratos' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleContratosList(env);
      }
      if (path === '/contratos' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleContratosUpsert(request, env);
      }
      const contratosDelMatch = path.match(/^\/contratos\/(\d+)$/);
      if (contratosDelMatch && method === 'DELETE') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleContratosDelete(Number(contratosDelMatch[1]), env);
      }

      return json({ error: 'Not found' }, 404);
    } catch (e) {
      const status = e.message?.includes('Unauthorized') ? 401 : 500;
      return json({ error: e.message || 'Internal error' }, status);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(resetDemoEvent(env).catch(e => console.error('[DEMO RESET]', e.message)));
  },
};
