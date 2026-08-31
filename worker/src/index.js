import { corsHeaders, json, mountCoreRouter, isAdmin, arrayBufferToBase64, resolveEventId, signJWT, verifyJWT } from '@crd/kuerre-core';
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
  await env.KUERRE_DB.prepare("DELETE FROM rsvp_responses WHERE slug='demo'").run();
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

function toSlugW(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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
  let cliente_dni = '', cliente2_dni = '', cliente2_dom = '', quinceanera_nac = '';
  let cliente2_tel = '', cliente2_email = '', contacto_nombre = '', contacto_rel = '', contacto_tel = '';

  if (tipo === 'BODA') {
    const { novia, novio, fiesta, civil, religiosa, contacto } = body;
    nombre_display = `${novia?.nombre || ''} & ${novio?.nombre || ''}`;
    fecha = fiesta?.fecha || ''; salon = fiesta?.salon || ''; direccion = fiesta?.direccion || '';
    cliente_nombre = novia?.nombre || ''; cliente_tel = novia?.telefono || ''; cliente_email = novia?.email || '';
    cliente_dni = novia?.dni || ''; cliente2_dni = novio?.dni || ''; cliente2_dom = novio?.domicilio || '';
    cliente2_nombre = novio?.nombre || ''; cliente2_tel = novio?.telefono || ''; cliente2_email = novio?.email || '';
    if (contacto) { contacto_nombre = contacto.nombre||''; contacto_rel = contacto.relacion||''; contacto_tel = contacto.telefono||''; }
    hora_inicio = fiesta?.horaInicio || ''; hora_fin = fiesta?.horaFin || ''; invitados = fiesta?.invitados || '';
    if (civil) { civil_fecha = civil.fecha||''; civil_hora = civil.horario||''; civil_dir = civil.direccion||''; }
    if (religiosa) { reli_fecha = religiosa.fecha||''; reli_hora = religiosa.horario||''; reli_dir = religiosa.direccion||''; }
  } else if (tipo === 'XV') {
    const { quinceanera, cliente, evento } = body;
    nombre_display = `XV ${quinceanera?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
    cliente_dni = cliente?.dni || ''; quinceanera_nac = quinceanera?.fechaNacimiento || '';
    cliente2_nombre = quinceanera?.nombre || ''; quinceanera_nombre = quinceanera?.nombre || '';
    hora_inicio = evento?.horaInicio || ''; hora_fin = evento?.horaFin || ''; invitados = evento?.invitados || '';
  } else {
    const { cliente, evento } = body;
    nombre_display = `Cumple ${cliente?.nombre || ''}`;
    fecha = evento?.fecha || ''; salon = evento?.salon || ''; direccion = evento?.direccion || '';
    cliente_nombre = cliente?.nombre || ''; cliente_tel = cliente?.telefono || ''; cliente_email = cliente?.email || '';
    cliente_dni = cliente?.dni || '';
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
           cliente_dni, cliente2_dni, cliente2_dom, quinceanera_nac,
           cliente2_tel, cliente2_email, contacto_nombre, contacto_rel, contacto_tel,
           data_json, fiesta_id, invite_slug, evento_id, created_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .bind(id, salon, direccion, cliente_nombre, cliente_tel, cliente_email,
            cliente2_nombre, quinceanera_nombre, hora_inicio, hora_fin, invitados,
            civil_fecha, civil_hora, civil_dir, reli_fecha, reli_hora, reli_dir,
            cliente_dni, cliente2_dni, cliente2_dom, quinceanera_nac,
            cliente2_tel, cliente2_email, contacto_nombre, contacto_rel, contacto_tel,
            JSON.stringify(body), fiesta_id, id, eventoId, now),
        env.KUERRE_DB.prepare(`INSERT INTO eventos_foto (id,cierre_auto,folder_id,portada,estado,moderacion,storage,evento_id,created_at) VALUES (?,NULL,'',NULL,'pendiente',0,'r2',?,?)`)
          .bind(fiesta_id, eventoId, now),
        env.KUERRE_DB.prepare(`INSERT INTO entrega_configs (id,folder_id,portada,overlay,allow_dl,evento_id,created_at) VALUES (?,'',' ','violeta',1,?,?)`)
          .bind(id, eventoId, now),
      ]);
      // El admin comparte el link publico de fiestas via slug (fiestas.html?e=slug), no via fiesta_id
      // crudo — sin este mapeo resolveEventId() nunca lo encuentra y el visor dice "evento no existe".
      await env.KUERRE_KV.put('fiesta_slug_' + eventoSlug, fiesta_id);

      // Invitación: se crea junto con Fiesta QR y Entrega (mismo id en minuscula que usa el admin
      // para armar el slug — debe coincidir con lo que genInviteUrl() recalcula en admin.html).
      try {
        const inviteId = id.toLowerCase();
        const inviteTipoMap = { BODA: 'casamiento', XV: 'quinces', CUMPLE: 'otro' };
        const fechaDisplay = fecha.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1');
        const inviteConfig = {
          tipo: inviteTipoMap[tipo] || 'otro',
          modelo: 'clasico',
          novios: nombre_display,
          titulo: '',
          fecha_display: fechaDisplay,
          fecha_iso: fecha,
          recepcion_hora: hora_inicio || '',
          fin_fiesta_hora: hora_fin || '',
          lugar_nombre: salon || '',
          lugar_direccion: direccion || '',
          lugar_maps: (salon || direccion)
            ? ('https://maps.google.com/?q=' + encodeURIComponent([salon, direccion].filter(Boolean).join(', ')))
            : ''
        };
        const slug = toSlugW(nombre_display) + (fechaDisplay ? '-' + toSlugW(fechaDisplay) : '') + '-' + inviteId.slice(-4);
        await env.KUERRE_KV.put('invite_cfg_' + slug, JSON.stringify(inviteConfig));
        // Persiste el mapeo slug→invitación para que resolvePartnerId lo encuentre
        // aunque el admin regenere el link con otra fórmula de slug (genInviteUrl).
        await env.KUERRE_KV.put('invite_slug_' + slug, inviteId);

        const invitesRaw = await env.KUERRE_KV.get('crd_invites');
        let invitesList = [];
        try { invitesList = invitesRaw ? JSON.parse(invitesRaw) : []; } catch {}
        invitesList.unshift({ id: inviteId, tipo: inviteConfig.tipo, config: inviteConfig, slug, created: now });
        const invitesStr = JSON.stringify(invitesList);
        await env.KUERRE_KV.put('crd_invites', invitesStr);
        await env.KUERRE_DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('crd_invites', invitesStr).run();

        // Vincular la invitación al cliente — el admin usa invite_id para el badge
        // "Invitación lista" y para abrir esta misma invitación desde el modal del cliente.
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET invite_id = ? WHERE id = ?').bind(inviteId, id).run();
      } catch (e) {
        console.log('Auto-crear invitacion fallo para solicitud', id, e.message);
      }

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

  const nuevas      = u.searchParams.get('nuevas')      === '1';
  const concontrato = u.searchParams.get('concontrato') === '1';

  const likeTerm   = search ? '%' + search + '%' : null;
  const conditions = [];
  const baseParams = [];
  if (search) {
    conditions.push('(e.nombre LIKE ? OR s.cliente_nombre LIKE ? OR s.cliente_tel LIKE ?)');
    baseParams.push(likeTerm, likeTerm, likeTerm);
  }
  if (nuevas)      conditions.push('s.procesada = 0');
  if (concontrato) conditions.push("s.codigo_contrato IS NOT NULL AND s.codigo_contrato != ''");
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = await env.KUERRE_DB.prepare(
    `SELECT COUNT(*) AS n FROM solicitudes s LEFT JOIN eventos e ON e.id = s.evento_id ${where}`
  ).bind(...baseParams).first();
  const total = countRow ? countRow.n : 0;

  const { results } = await env.KUERRE_DB.prepare(`
    SELECT s.*, e.fecha, e.tipo, e.nombre AS nombre_display, e.slug AS evento_slug,
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

async function handleEntregaConfigPatch(id, request, env) {
  const body = await request.json();
  const fields = [];
  const vals = [];
  for (const k of ['folder_id','portada','overlay','allow_dl']) {
    if (body[k] !== undefined) {
      fields.push(`${k} = ?`);
      vals.push(k === 'allow_dl' ? (body[k] ? 1 : 0) : body[k]);
    }
  }
  if (!fields.length) return json({ error: 'Nada que actualizar' }, 400);
  vals.push(id);
  await env.KUERRE_DB.prepare(`UPDATE entrega_configs SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

async function handleCrearCarpetas(id, request, env) {
  const sol = await env.KUERRE_DB.prepare(`
    SELECT s.*, e.nombre AS nombre_display, e.fecha, e.tipo, e.slug AS evento_slug
    FROM solicitudes s LEFT JOIN eventos e ON e.id = s.evento_id
    WHERE s.id = ?
  `).bind(id).first();
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
        invitacion: sol.drive_invitacion_id,
        carrusel1: sol.drive_carrusel1_id,
        carrusel2: sol.drive_carrusel2_id
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
      SET codigo_contrato=?, drive_cliente_id=?, drive_fiesta_id=?, drive_entrega_id=?, drive_contrato_id=?, drive_invitacion_id=?, drive_carrusel1_id=?, drive_carrusel2_id=?
      WHERE id=?
    `).bind(codigoContrato, ids.cliente, ids.fiesta, ids.entrega, ids.contrato || '', ids.invitacion || '', ids.carrusel1 || '', ids.carrusel2 || '', id),
    env.KUERRE_DB.prepare(`UPDATE eventos_foto SET folder_id=?, estado='activo' WHERE id=?`)
      .bind(ids.fiesta, sol.fiesta_id),
    env.KUERRE_DB.prepare(`UPDATE entrega_configs SET folder_id=? WHERE id=?`)
      .bind(ids.entrega, id),
  ]);

  // Backfill: clientes creados antes de este fix (o si por algun motivo nunca
  // se escribio al crear la solicitud) tambien quedan con el link publico andando.
  if (sol.evento_slug) await env.KUERRE_KV.put('fiesta_slug_' + sol.evento_slug, sol.fiesta_id);

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

// ── Marca blanca (partners) ─────────────────────────────────────────────────
const PARTNER_DEFAULT = 'kuerre';

// Sube desde una pieza pública hasta el cliente y devuelve su partner_id.
// Nunca falla: sin match, devuelve el partner por defecto.
async function resolvePartnerId(env, coreEnv, scope, id) {
  if (!id) return PARTNER_DEFAULT;
  const db = env.KUERRE_DB;
  let row = null;
  try {
    if (scope === 'invite') {
      // invite_slug en solicitudes guarda el id del cliente, no el slug descriptivo
      // que manda la invitación (?i=juan-y-sofia-...): probar directo y, si no matchea,
      // traducir el slug a id vía crd_invites (mismo mecanismo que usa el media upload).
      row = await db.prepare('SELECT partner_id FROM solicitudes WHERE invite_slug = ?').bind(id).first();
      if (!row) {
        // Slug persistido al escribir invite_cfg_{slug} (POST /invite/{slug}?invite_id=...
        // o la auto-creación) — cubre los links que el admin ya reparte con su propia fórmula.
        const mappedId = await env.KUERRE_KV.get('invite_slug_' + id);
        if (mappedId) {
          row = await db.prepare('SELECT partner_id FROM solicitudes WHERE LOWER(invite_id) = ?')
            .bind(String(mappedId).toLowerCase()).first();
        }
      }
      if (!row) {
        const invitesRaw = await env.KUERRE_KV.get('crd_invites');
        let invitesList = [];
        try { invitesList = invitesRaw ? JSON.parse(invitesRaw) : []; } catch {}
        const entry = invitesList.find(x => x.slug === id);
        if (entry && entry.id) {
          row = await db.prepare('SELECT partner_id FROM solicitudes WHERE LOWER(id) = ?')
            .bind(String(entry.id).toLowerCase()).first();
        }
      }
    } else if (scope === 'fiesta') {
      // fiestas.html manda el slug del evento (?e=), no el fiesta_id crudo: probar
      // directo y, si no matchea, traducir con resolveEventId (KV fiesta_slug_{slug}).
      row = await db.prepare('SELECT partner_id FROM solicitudes WHERE fiesta_id = ?').bind(id).first();
      if (!row) {
        const realId = await resolveEventId(id, coreEnv);
        if (realId && realId !== id) {
          row = await db.prepare('SELECT partner_id FROM solicitudes WHERE fiesta_id = ?').bind(realId).first();
        }
      }
    } else if (scope === 'entrega') {
      row = await db.prepare(
        'SELECT s.partner_id AS partner_id FROM entrega_configs ec JOIN solicitudes s ON s.id = ec.id WHERE ec.folder_id = ?'
      ).bind(id).first();
    }
  } catch (e) {
    console.log('resolvePartnerId:', e.message);
  }
  if (!row || !row.partner_id) {
    console.log('resolvePartnerId: sin match, uso default —', 'scope=' + scope, 'id=' + id);
  }
  return (row && row.partner_id) || PARTNER_DEFAULT;
}

// Solo campos públicos: nunca devolver activo, logo_key ni ids internos.
async function partnerPublic(db, partnerId, origin) {
  const cols = 'slug, nombre, slogan, logo_key, whatsapp, instagram, web, mostrar_credito';
  let p = await db.prepare(`SELECT ${cols} FROM partners WHERE id = ? AND activo = 1`).bind(partnerId).first();
  if (!p) p = await db.prepare(`SELECT ${cols} FROM partners WHERE id = ?`).bind(PARTNER_DEFAULT).first();
  if (!p) return { nombre: '', slogan: '', logo_url: '', whatsapp: '', instagram: '', web: '', credito: false };
  return {
    nombre:    p.nombre    || '',
    slogan:    p.slogan    || '',
    logo_url:  p.logo_key ? `${origin}/api/partners/${encodeURIComponent(p.slug)}/logo` : '',
    whatsapp:  p.whatsapp  || '',
    instagram: p.instagram || '',
    web:       p.web       || '',
    credito:   p.mostrar_credito === 1
  };
}

// ── Acceso de los estudios (panel de solo lectura) ──────────────────────────
const PBKDF2_ITER      = 100000;
const LOGIN_MAX_FAILS  = 8;
const LOGIN_LOCK_MS    = 15 * 60 * 1000;
const PARTNER_SESSION_HOURS = 8;
// Hash dummy (mismo formato y misma cantidad de iteraciones que un hash real,
// pero de una clave descartable que nadie usa). Se verifica contra este hash
// cuando no hay fila o no hay pass_hash, para que ese camino tarde lo mismo
// que un intento con clave incorrecta y así el reloj no delate si el usuario
// existe. No es codigo muerto: NO borrar.
const DUMMY_PASS_HASH = 'pbkdf2$100000$taMxJ9sbnP29ycNug13s3Q==$m5DM5ZnileDQh9U5Acfgr6Z50CrlXWwLeAw47gHkFsA=';

function b64enc(bytes) { return btoa(String.fromCharCode(...bytes)); }
function b64dec(s)     { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

async function pbkdf2Bits(pass, salt, iter, bits) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits']);
  const out = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, bits);
  return new Uint8Array(out);
}

// Formato: pbkdf2$<iteraciones>$<salt_b64>$<hash_b64>. La clave nunca se guarda.
async function makePassHash(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const h = await pbkdf2Bits(String(pass), salt, PBKDF2_ITER, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64enc(salt)}$${b64enc(h)}`;
}

async function verifyPassHash(pass, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iter = parseInt(parts[1], 10);
  if (!iter || iter < 1000) return false;
  let salt, expected;
  try { salt = b64dec(parts[2]); expected = b64dec(parts[3]); } catch { return false; }
  if (!expected.length) return false;
  const got = await pbkdf2Bits(String(pass), salt, iter, expected.length * 8);
  if (got.length !== expected.length) return false;
  // Comparacion en tiempo constante: un === sobre strings filtra cuanto coincide.
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ expected[i];
  return diff === 0;
}

function parseLoginFails(v) {
  const [n, ts] = String(v || '').split('|');
  return { n: parseInt(n || '0', 10) || 0, ts: parseInt(ts || '0', 10) || 0 };
}

// Un solo UPDATE: leer y despues escribir se puede esquivar mandando intentos en
// paralelo. El CASE tambien reinicia la cuenta si la ventana de bloqueo ya paso.
async function bumpLoginFails(db, pid) {
  const now = Date.now();
  await db.prepare(`
    UPDATE partners
       SET login_fails = CAST(
             CASE WHEN instr(login_fails, '|') > 0
                   AND (? - CAST(substr(login_fails, instr(login_fails, '|') + 1) AS INTEGER)) < ?
                  THEN CAST(substr(login_fails, 1, instr(login_fails, '|') - 1) AS INTEGER) + 1
                  ELSE 1 END AS TEXT) || '|' || CAST(? AS TEXT)
     WHERE id = ?`).bind(now, LOGIN_LOCK_MS, now, pid).run();
}

// Devuelve el partner_id del token, o null. El id SIEMPRE sale de aca:
// ningun endpoint de partner lo acepta por parametro.
async function isPartner(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const p = await verifyJWT(auth.slice(7), env.ADMIN_JWT_SECRET);
    return (p && p.role === 'partner' && p.pid) ? String(p.pid) : null;
  } catch { return null; }
}

const PARTNER_LOGO_MIME = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg'
};

function partnerSlugify(nombre) {
  return String(nombre || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 60) || 'partner';
}

// Devuelve un slug libre agregando -2, -3, ... si hace falta.
async function partnerFreeSlug(db, base) {
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const taken = await db.prepare('SELECT id FROM partners WHERE slug = ?').bind(slug).first();
    if (!taken) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
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
          partners:     true,
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
          invCfg.fecha_iso = d.toISOString().slice(0, 10);
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
        // El admin manda el id de la invitación cuando lo conoce — persiste el
        // mapeo slug→invitación para que resolvePartnerId resuelva la marca
        // aunque este slug no coincida con el que armó la auto-creación.
        const inviteId = url.searchParams.get('invite_id');
        if (inviteId) await env.KUERRE_KV.put('invite_slug_' + invCfgMatch[1], inviteId);
        return json({ ok: true });
      }

      // ── Estilos: estado del formulario del cliente (estilos.html) ──────────
      const invEstadoMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})\/estado$/);
      if (invEstadoMatch && method === 'GET') {
        const raw = await env.KUERRE_KV.get('invite_cfg_' + invEstadoMatch[1]);
        if (!raw) return json({ error: 'Not found' }, 404);
        let c; try { c = JSON.parse(raw); } catch { return json({ error: 'Config inválida' }, 500); }
        return json({
          existe: true,
          form_completado: !!c.form_completado,
          nombre: c.novios || '',
          fecha: c.fecha_display || c.fecha_iso || '',
          tipo: c.tipo || 'otro',
          estilo_elegido: c.estilo_elegido || null
        });
      }

      // ── Estilos: el cliente completa estilo + datos (un solo uso) ──────────
      const invCompletarMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})\/completar$/);
      if (invCompletarMatch && method === 'POST') {
        const cSlug = invCompletarMatch[1];
        const raw = await env.KUERRE_KV.get('invite_cfg_' + cSlug);
        if (!raw) return json({ error: 'Invitación no encontrada' }, 404);
        let existing; try { existing = JSON.parse(raw); } catch { return json({ error: 'Config inválida' }, 500); }
        if (existing.form_completado) return json({ error: 'Ya completado' }, 409);
        const body = await request.json().catch(() => null);
        if (!body || typeof body.config !== 'object' || !body.config || !body.estilo_id) return json({ error: 'Body inválido' }, 400);
        // El cliente no puede pisar la identidad del slug (el admin lo recalcula desde
        // novios+fecha) ni flags/credenciales del sistema.
        const incoming = { ...body.config };
        ['novios', 'fecha_display', 'fecha_iso', 'tipo', 'form_completado', 'form_completado_at', 'estilo_elegido',
         'logo_dark', 'logo_light', 'logo_filter', 'emailjs_key', 'emailjs_service', 'gsheet_url'].forEach(k => delete incoming[k]);
        const merged = {
          ...existing, ...incoming,
          form_completado: true,
          form_completado_at: new Date().toISOString(),
          estilo_elegido: String(body.estilo_id)
        };
        await env.KUERRE_KV.put('invite_cfg_' + cSlug, JSON.stringify(merged));
        // Reflejar en crd_invites para que el admin lo vea (entrada matcheada por slug)
        try {
          const invitesRaw = await env.KUERRE_KV.get('crd_invites');
          const invitesList = invitesRaw ? JSON.parse(invitesRaw) : [];
          const entry = invitesList.find(x => x.slug === cSlug);
          if (entry) {
            entry.config = merged;
            entry.tipo = merged.tipo || entry.tipo;
            const invitesStr = JSON.stringify(invitesList);
            await env.KUERRE_KV.put('crd_invites', invitesStr);
            await env.KUERRE_DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('crd_invites', invitesStr).run();
          }
        } catch (e) { console.log('completar: no se pudo reflejar en crd_invites', e.message); }
        return json({ ok: true });
      }

      // ── Estilos: reabrir formulario (solo admin) — conserva todos los datos ─
      const invReabrirMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})\/reabrir$/);
      if (invReabrirMatch && method === 'POST') {
        const auth = request.headers.get('Authorization') || '';
        if (!env.CF_AUTH_TOKEN || auth !== env.CF_AUTH_TOKEN) return json({ error: 'Unauthorized' }, 401);
        const rSlug = invReabrirMatch[1];
        const raw = await env.KUERRE_KV.get('invite_cfg_' + rSlug);
        if (!raw) return json({ error: 'Invitación no encontrada' }, 404);
        let rCfg; try { rCfg = JSON.parse(raw); } catch { return json({ error: 'Config inválida' }, 500); }
        delete rCfg.form_completado;
        delete rCfg.form_completado_at;
        await env.KUERRE_KV.put('invite_cfg_' + rSlug, JSON.stringify(rCfg));
        try {
          const invitesRaw = await env.KUERRE_KV.get('crd_invites');
          const invitesList = invitesRaw ? JSON.parse(invitesRaw) : [];
          const entry = invitesList.find(x => x.slug === rSlug);
          if (entry) {
            entry.config = rCfg;
            const invitesStr = JSON.stringify(invitesList);
            await env.KUERRE_KV.put('crd_invites', invitesStr);
            await env.KUERRE_DB.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind('crd_invites', invitesStr).run();
          }
        } catch (e) { console.log('reabrir: no se pudo reflejar en crd_invites', e.message); }
        return json({ ok: true });
      }

      // ── Estilos: upload de portada/carruseles del cliente → R2 + Drive ─────
      const invMediaUpMatch = path.match(/^\/invite\/([a-z0-9][a-z0-9-]{1,79})\/media$/);
      if (invMediaUpMatch && method === 'POST') {
        const mSlug = invMediaUpMatch[1];
        const rawM = await env.KUERRE_KV.get('invite_cfg_' + mSlug);
        if (!rawM) return json({ error: 'Invitación no encontrada' }, 404);
        let mCfg; try { mCfg = JSON.parse(rawM); } catch { return json({ error: 'Config inválida' }, 500); }
        if (mCfg.form_completado) return json({ error: 'Formulario ya enviado' }, 409);
        const mForm = await request.formData();
        const mFile = mForm.get('file');
        const tipoMedia = String(mForm.get('tipo') || '');
        if (!mFile || typeof mFile.arrayBuffer !== 'function') return json({ error: 'No se recibió archivo' }, 400);
        if (!['portada', 'carrusel1', 'carrusel2'].includes(tipoMedia)) return json({ error: 'Tipo inválido' }, 400);
        const isVideo = (mFile.type || '').startsWith('video/');
        const maxBytes = (isVideo ? 50 : 15) * 1024 * 1024;
        const mBuffer = await mFile.arrayBuffer();
        if (mBuffer.byteLength > maxBytes) return json({ error: `Archivo demasiado grande (máx ${isVideo ? 50 : 15}MB)` }, 400);
        const mExt = ((mFile.name || (isVideo ? 'video.mp4' : 'foto.jpg')).split('.').pop() || 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase();
        const mKey = `invite-media/${mSlug}/${tipoMedia}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${mExt}`;
        await env.MEDIA.put(mKey, mBuffer, { httpMetadata: { contentType: mFile.type || 'image/jpeg' } });
        // Drive en background: carpeta según tipo, solicitud vinculada por crd_invites entry.id
        try {
          const invitesRaw = await env.KUERRE_KV.get('crd_invites');
          const entry = (invitesRaw ? JSON.parse(invitesRaw) : []).find(x => x.slug === mSlug);
          if (entry && entry.id) {
            const sol = await env.KUERRE_DB.prepare(
              'SELECT drive_invitacion_id, drive_carrusel1_id, drive_carrusel2_id FROM solicitudes WHERE LOWER(id) = ?'
            ).bind(String(entry.id).toLowerCase()).first();
            const folderId = sol && { portada: sol.drive_invitacion_id, carrusel1: sol.drive_carrusel1_id, carrusel2: sol.drive_carrusel2_id }[tipoMedia];
            if (folderId) {
              const gasUrl = await env.KUERRE_KV.get('fiestas_gas_url');
              if (gasUrl) ctx.waitUntil(gasUploadBackground(gasUrl, folderId, mBuffer, mFile.name || mKey.split('/').pop(), mFile.type || 'image/jpeg', 'invmedia_' + mSlug, env));
            }
          }
        } catch (e) { console.log('media: Drive background skip', e.message); }
        const mOrigin = new URL(request.url).origin;
        return json({ ok: true, url: `${mOrigin}/api/fotos/${encodeURIComponent(mKey)}` });
      }

      // ── KV públicas de solo lectura (consumidas por premiere/invite/fiestas) ─
      const pubKvMatch = path.match(/^\/(crd_settings|crd_contratos_cfg|crd_entregas|crd_pm_[A-Za-z0-9_-]{1,70})$/);
      if (pubKvMatch && method === 'GET') {
        const pubVal = await env.KUERRE_KV.get(pubKvMatch[1]);
        if (pubVal === null) return json({ error: 'Not found' }, 404);
        try { return json(JSON.parse(pubVal)); } catch { return new Response(pubVal, { headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' } }); }
      }

      // ── Login del panel del estudio ───────────────────────────────────────
      if (path === '/partner/login' && method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const usuario = String(body.usuario || '').trim();
        const pass    = String(body.pass || '');
        // Mismo error para usuario inexistente, clave incorrecta y marca
        // desactivada: no se le dice al atacante cual de las tres fallo.
        const generico = () => json({ error: 'Usuario o contraseña incorrectos' }, 401);
        if (!usuario || !pass) return generico();
        const row = await env.KUERRE_DB.prepare(
          "SELECT id, pass_hash, login_fails FROM partners WHERE usuario = ? AND usuario != '' AND activo = 1"
        ).bind(usuario).first();
        if (!row || !row.pass_hash) {
          // Corremos el mismo PBKDF2 contra un hash dummy para que este
          // camino tarde lo mismo que uno con clave incorrecta: sin esto, el
          // reloj delata si el usuario existe y está activo.
          await verifyPassHash(pass, DUMMY_PASS_HASH);
          return generico();
        }
        const f = parseLoginFails(row.login_fails);
        if (f.n >= LOGIN_MAX_FAILS && (Date.now() - f.ts) < LOGIN_LOCK_MS) {
          const mins = Math.ceil((LOGIN_LOCK_MS - (Date.now() - f.ts)) / 60000);
          return json({ error: `Demasiados intentos. Probá de nuevo en ${mins} minuto${mins === 1 ? '' : 's'}.` }, 429);
        }
        if (!await verifyPassHash(pass, row.pass_hash)) {
          await bumpLoginFails(env.KUERRE_DB, row.id);
          return generico();
        }
        await env.KUERRE_DB.prepare("UPDATE partners SET login_fails = '' WHERE id = ?").bind(row.id).run();
        const token = await signJWT(
          { role: 'partner', pid: row.id, exp: Math.floor(Date.now() / 1000) + PARTNER_SESSION_HOURS * 3600 },
          env.ADMIN_JWT_SECRET
        );
        return json({ token });
      }

      if (path === '/partner/me' && method === 'GET') {
        const pid = await isPartner(request, env);
        if (!pid) return json({ error: 'Unauthorized' }, 401);
        const marca = await partnerPublic(env.KUERRE_DB, pid, url.origin);
        return json(marca);
      }

      if (path === '/partner/clientes' && method === 'GET') {
        const pid = await isPartner(request, env);
        if (!pid) return json({ error: 'Unauthorized' }, 401);

        // Columnas listadas una por una a proposito: con SELECT s.* cualquier
        // columna que se agregue a solicitudes se filtraria sola a un tercero.
        const { results } = await env.KUERRE_DB.prepare(`
          SELECT s.id, s.salon, s.cliente_nombre, s.cliente_tel, s.cliente_email,
                 s.invite_id, s.fiesta_id,
                 e.nombre AS nombre_display, e.tipo, e.fecha, e.slug AS evento_slug,
                 ef.estado AS fiesta_estado,
                 ec.folder_id AS entrega_folder
            FROM solicitudes s
            LEFT JOIN eventos e        ON e.id  = s.evento_id
            LEFT JOIN eventos_foto ef  ON ef.id = s.fiesta_id
            LEFT JOIN entrega_configs ec ON ec.id = s.id
           WHERE s.partner_id = ?
           ORDER BY s.created_at DESC`).bind(pid).all();

        // El slug publico de la invitacion vive en crd_invites: una sola lectura
        // de KV para todas las filas.
        let invites = [];
        try {
          const raw = await env.KUERRE_KV.get('crd_invites');
          invites = raw ? JSON.parse(raw) : [];
        } catch (e) { console.log('partner/clientes: crd_invites', e.message); }

        const clientes = (results || []).map(r => {
          const inviteOk  = !!(r.invite_id && String(r.invite_id).trim());
          const fiestaOk  = r.fiesta_estado === 'activo';
          const entregaOk = !!(r.entrega_folder && String(r.entrega_folder).trim());

          let linkInvitacion = '';
          if (inviteOk) {
            const ent = invites.find(x => String(x.id).toLowerCase() === String(r.invite_id).toLowerCase());
            if (ent && ent.slug) linkInvitacion = '/invite.html?i=' + encodeURIComponent(ent.slug);
            else console.log('partner/clientes: invitacion sin slug resoluble', 'cliente=' + r.id, 'invite_id=' + r.invite_id);
          }
          const slugFiesta = r.evento_slug || r.fiesta_id || '';
          const linkFiesta = fiestaOk && slugFiesta ? '/fiestas.html?e=' + encodeURIComponent(slugFiesta) : '';
          let linkEntrega = '';
          if (entregaOk) {
            const p = new URLSearchParams({
              folder: r.entrega_folder,
              nombres: r.nombre_display || '',
              fecha: r.fecha || '',
              tipo: String(r.tipo || '').toLowerCase()
            });
            linkEntrega = '/entrega.html?' + p.toString();
          }

          // estados dice si la pieza EXISTE (ej. invite_id cargado); links dice si
          // se pudo ARMAR su URL publica (ej. el slug se encontro en crd_invites).
          // Son dos hechos distintos y pueden no coincidir: una invitacion puede
          // estar "lista" con link vacio si la KV no resolvio el slug. No las
          // unifiques: eso ocultaria justamente el caso que hay que loguear arriba.
          return {
            evento:   { nombre: r.nombre_display || '', tipo: r.tipo || '', fecha: r.fecha || '', salon: r.salon || '' },
            contacto: { nombre: r.cliente_nombre || '', tel: r.cliente_tel || '', email: r.cliente_email || '' },
            estados:  { invitacion: inviteOk ? 'lista' : 'pendiente',
                        fiesta:     fiestaOk ? 'activa' : 'pendiente',
                        entrega:    entregaOk ? 'lista' : 'pendiente' },
            links:    { invitacion: linkInvitacion, fiesta: linkFiesta, entrega: linkEntrega }
          };
        });

        return json({ clientes });
      }

      // ── Marca pública de una pieza (invitación / fiesta / entrega) ─────────
      if (path === '/brand' && method === 'GET') {
        const bScope   = url.searchParams.get('scope')   || '';
        const bId      = url.searchParams.get('id')      || '';
        const bPartner = url.searchParams.get('partner') || '';
        let brand = null;
        // Marca forzada para las 3 demos permanentes (id=demo / DEMO22): solo se
        // honra ahí, nunca sobre una pieza real, así nadie re-marca la invitación
        // de un cliente agregándole ?partner= a su URL.
        if (bPartner && ['demo', 'demo22'].includes(bId.toLowerCase())) {
          const demoPartner = await env.KUERRE_DB.prepare(
            'SELECT id FROM partners WHERE slug = ? AND activo = 1'
          ).bind(bPartner).first();
          if (demoPartner) brand = await partnerPublic(env.KUERRE_DB, demoPartner.id, url.origin);
        }
        if (!brand) {
          const bPid = await resolvePartnerId(env, coreEnv, bScope, bId);
          brand = await partnerPublic(env.KUERRE_DB, bPid, url.origin);
        }
        return new Response(JSON.stringify(brand), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60'
          }
        });
      }

      // ── Logo del partner desde R2 ─────────────────────────────────────────
      const partnerLogoMatch = path.match(/^\/api\/partners\/([a-z0-9-]{1,60})\/logo$/);
      if (partnerLogoMatch && method === 'GET') {
        const pRow = await env.KUERRE_DB.prepare('SELECT logo_key FROM partners WHERE slug = ?')
          .bind(partnerLogoMatch[1]).first();
        if (!pRow || !pRow.logo_key) return new Response('Not found', { status: 404 });
        const pObj = await env.MEDIA.get(pRow.logo_key);
        if (!pObj) return new Response('Not found', { status: 404 });
        return new Response(pObj.body, {
          headers: {
            'Content-Type': (pObj.httpMetadata && pObj.httpMetadata.contentType) || 'image/png',
            'Cache-Control': 'public, max-age=86400',
            'X-Content-Type-Options': 'nosniff',
            // Un SVG servido desde el origen del worker podría ejecutar script:
            // esta CSP lo neutraliza sin bloquear el render de la imagen.
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
            'Access-Control-Allow-Origin': '*'
          }
        });
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
        const fotoHeaders = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*'
        };
        // Range: sin esto un video servido desde R2 no se puede adelantar.
        const fotoRange = request.headers.get('Range');
        if (fotoRange) {
          const meta = await env.MEDIA.head(key);
          if (!meta) return new Response('Not found', { status: 404 });
          const m = fotoRange.match(/bytes=(\d+)-(\d*)/);
          if (!m) return new Response('Range Not Satisfiable', { status: 416 });
          const offset = parseInt(m[1]);
          const end = m[2] ? Math.min(parseInt(m[2]), meta.size - 1) : meta.size - 1;
          if (offset > end) return new Response('Range Not Satisfiable', { status: 416 });
          const length = end - offset + 1;
          const part = await env.MEDIA.get(key, { range: { offset, length } });
          return new Response(part?.body ?? null, {
            status: 206,
            headers: { ...fotoHeaders,
              'Content-Type': meta.httpMetadata?.contentType || 'image/jpeg',
              'Content-Range': `bytes ${offset}-${end}/${meta.size}`,
              'Content-Length': String(length)
            }
          });
        }
        const obj = await env.MEDIA.get(key);
        if (!obj) return new Response('Not found', { status: 404 });
        return new Response(obj.body, {
          headers: { ...fotoHeaders,
            'Content-Type': obj.httpMetadata?.contentType || 'image/jpeg',
            'Content-Length': String(obj.size)
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

      // ── Invitaciones: descarga video de Drive y lo guarda en R2 ─────────────────
      const invMediaFromDriveMatch = path.match(/^\/invite-media\/([a-zA-Z0-9_-]+)\/from-drive$/);
      if (invMediaFromDriveMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const invId = invMediaFromDriveMatch[1];
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
        if (!resp.ok) return json({ error: 'Drive respondió ' + resp.status }, 502);
        const contentType = resp.headers.get('content-type') || 'video/mp4';
        await env.MEDIA.put(`invite-media/${invId}.mp4`, resp.body, { httpMetadata: { contentType } });
        const workerOrigin = new URL(request.url).origin;
        // ?v= cambia en cada carga -- el edge cachea por URL completa (24hs), así que sin
        // esto un video nuevo podía seguir sirviendo el viejo hasta que vencía el TTL.
        return json({ ok: true, url: `${workerOrigin}/invite-media/${invId}?v=${Date.now()}` });
      }

      // ── Invitaciones: sirve el video guardado en R2 (cacheado en el edge, con Range) ─
      const invMediaMatch = path.match(/^\/invite-media\/([a-zA-Z0-9_-]+)$/);
      if (invMediaMatch && method === 'GET') {
        const invId = invMediaMatch[1];
        const key = `invite-media/${invId}.mp4`;
        const cache = caches.default;
        const cacheKey = new Request(new URL(path + url.search, request.url).toString(), { method: 'GET' });

        let buf, contentType;
        const cached = await cache.match(cacheKey);
        if (cached) {
          contentType = cached.headers.get('Content-Type') || 'video/mp4';
          buf = await cached.arrayBuffer();
        } else {
          const obj = await env.MEDIA.get(key);
          if (!obj) return new Response('Not found', { status: 404 });
          contentType = obj.httpMetadata?.contentType || 'video/mp4';
          buf = await obj.arrayBuffer();
          ctx.waitUntil(cache.put(cacheKey, new Response(buf, {
            headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' }
          })));
        }

        const commonHeaders = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        };
        const size = buf.byteLength;
        const rangeHeader = request.headers.get('Range');
        if (rangeHeader) {
          const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
          if (!m) return new Response('Range Not Satisfiable', { status: 416 });
          const offset = parseInt(m[1]);
          const end = m[2] ? Math.min(parseInt(m[2]), size - 1) : size - 1;
          return new Response(buf.slice(offset, end + 1), {
            status: 206,
            headers: { ...commonHeaders,
              'Content-Type': contentType,
              'Content-Range': `bytes ${offset}-${end}/${size}`,
              'Content-Length': String(end - offset + 1),
            }
          });
        }
        return new Response(buf, {
          headers: { ...commonHeaders, 'Content-Type': contentType, 'Content-Length': String(size) }
        });
      }

      // ── Google Drive video proxy (bypasses CORS + virus warning) ───────────
      if (path.startsWith('/api/gdrive/')) {
        const fileId = path.split('/api/gdrive/')[1]?.split('/')[0];
        if (!fileId) return json({ error: 'No file ID' }, 400);
        return proxyGdrive(fileId, request, env);
      }

      if (path === '/api/health') return json({ ok: true, worker: 'kuerre-worker', ts: new Date().toISOString() });

      // ── Partners (marca blanca) — ABM admin ───────────────────────────────
      if (path === '/partners' && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { results } = await env.KUERRE_DB.prepare(
          'SELECT id, slug, nombre, slogan, logo_key, whatsapp, instagram, web, activo, mostrar_credito, usuario, pass_hash, created_at FROM partners ORDER BY (id = \'kuerre\') DESC, nombre ASC'
        ).all();
        const out = (results || []).map(function(p) {
          const tiene_clave = !!p.pass_hash;
          // Un usuario sin contraseña, o una contraseña sin usuario, no entra:
          // /partner/login exige ambos (WHERE usuario = ? AND usuario != '').
          const tiene_acceso = tiene_clave && !!p.usuario;
          const { pass_hash, ...rest } = p;
          return Object.assign({}, rest, { tiene_clave, tiene_acceso });
        });
        return json(out);
      }

      if (path === '/partners' && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const nombre = String(b.nombre || '').trim();
        if (!nombre) return json({ error: 'nombre requerido' }, 400);
        const pid  = crypto.randomUUID();
        const slug = await partnerFreeSlug(env.KUERRE_DB, partnerSlugify(nombre));
        const nuevoUser = String(b.usuario || '').trim();
        if (nuevoUser) {
          const taken = await env.KUERRE_DB.prepare(
            "SELECT id FROM partners WHERE usuario = ? AND usuario != ''"
          ).bind(nuevoUser).first();
          if (taken) return json({ error: 'Ese usuario ya lo tiene otra marca' }, 409);
        }
        const nuevoHash = b.pass ? await makePassHash(String(b.pass)) : '';
        const cols = ['id', 'slug', 'nombre', 'slogan', 'whatsapp', 'instagram', 'web', 'usuario', 'pass_hash'];
        const vals = [pid, slug, nombre, String(b.slogan || '').trim(), String(b.whatsapp || '').trim(),
                      String(b.instagram || '').trim(), String(b.web || '').trim(), nuevoUser, nuevoHash];
        if (b.mostrar_credito !== undefined) { cols.push('mostrar_credito'); vals.push(b.mostrar_credito ? 1 : 0); }
        await env.KUERRE_DB.prepare(
          `INSERT INTO partners (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
        ).bind(...vals).run();
        return json({ ok: true, id: pid, slug });
      }

      const partnerIdMatch = path.match(/^\/partners\/([A-Za-z0-9-]{1,64})$/);
      if (partnerIdMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const b = await request.json().catch(() => ({}));
        const sets = [], vals = [];
        for (const col of ['nombre', 'slogan', 'whatsapp', 'instagram', 'web']) {
          if (b[col] !== undefined) { sets.push(`${col} = ?`); vals.push(String(b[col]).trim()); }
        }
        if (b.activo !== undefined) { sets.push('activo = ?'); vals.push(b.activo ? 1 : 0); }
        if (b.mostrar_credito !== undefined) { sets.push('mostrar_credito = ?'); vals.push(b.mostrar_credito ? 1 : 0); }
        if (b.usuario !== undefined) {
          const nuevoUser = String(b.usuario).trim();
          if (nuevoUser) {
            const taken = await env.KUERRE_DB.prepare(
              "SELECT id FROM partners WHERE usuario = ? AND usuario != '' AND id != ?"
            ).bind(nuevoUser, partnerIdMatch[1]).first();
            if (taken) return json({ error: 'Ese usuario ya lo tiene otra marca' }, 409);
          }
          sets.push('usuario = ?'); vals.push(nuevoUser);
        }
        // Vacio = no tocar la clave. Solo se reemplaza si mandan una nueva.
        if (b.pass) {
          sets.push('pass_hash = ?'); vals.push(await makePassHash(String(b.pass)));
          sets.push("login_fails = ?"); vals.push('');
        }
        if (!sets.length) return json({ error: 'nada para actualizar' }, 400);
        vals.push(partnerIdMatch[1]);
        const upd = await env.KUERRE_DB.prepare(`UPDATE partners SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
        if (!upd.meta || upd.meta.changes === 0) return json({ error: 'Not found' }, 404);
        return json({ ok: true });
      }

      if (partnerIdMatch && method === 'DELETE') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const pid = partnerIdMatch[1];
        if (pid === PARTNER_DEFAULT) return json({ error: 'La marca propia no se puede borrar' }, 400);
        const row = await env.KUERRE_DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(pid).first();
        if (!row) return json({ error: 'Not found' }, 404);
        // Los clientes que apuntaban a este partner vuelven a la marca propia:
        // si quedaran colgados, sus piezas mostrarían una marca inexistente.
        const re = await env.KUERRE_DB.prepare(
          'UPDATE solicitudes SET partner_id = ? WHERE partner_id = ?'
        ).bind(PARTNER_DEFAULT, pid).run();
        await env.KUERRE_DB.prepare('DELETE FROM partners WHERE id = ?').bind(pid).run();
        if (row.logo_key) { try { await env.MEDIA.delete(row.logo_key); } catch (e) { console.log('logo delete:', e.message); } }
        return json({ ok: true, reasignados: (re.meta && re.meta.changes) || 0 });
      }

      const partnerLogoUpMatch = path.match(/^\/partners\/([A-Za-z0-9-]{1,64})\/logo$/);
      if (partnerLogoUpMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const b  = await request.json().catch(() => ({}));
        const ct = String(b.content_type || '').toLowerCase();
        const ext = PARTNER_LOGO_MIME[ct];
        // No se confía en lo que declara el browser: si no está en el allowlist, se rechaza.
        if (!ext) return json({ error: 'Formato no permitido: usar PNG, JPG, WEBP o SVG' }, 400);
        let bytes;
        try {
          bytes = Uint8Array.from(atob(String(b.data_base64 || '')), c => c.charCodeAt(0));
        } catch (e) { return json({ error: 'data_base64 inválido' }, 400); }
        if (!bytes.length || bytes.length > 2 * 1024 * 1024) return json({ error: 'El logo debe pesar menos de 2 MB' }, 400);
        const pid = partnerLogoUpMatch[1];
        const exists = await env.KUERRE_DB.prepare('SELECT id FROM partners WHERE id = ?').bind(pid).first();
        if (!exists) return json({ error: 'Not found' }, 404);
        const key = `partners/${pid}/logo.${ext}`;
        await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: ct } });
        await env.KUERRE_DB.prepare('UPDATE partners SET logo_key = ? WHERE id = ?').bind(key, pid).run();
        return json({ ok: true, logo_key: key });
      }

      const partnerLogoDriveMatch = path.match(/^\/partners\/([A-Za-z0-9-]{1,64})\/logo\/from-drive$/);
      if (partnerLogoDriveMatch && method === 'POST') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const pid = partnerLogoDriveMatch[1];
        const exists = await env.KUERRE_DB.prepare('SELECT id FROM partners WHERE id = ?').bind(pid).first();
        if (!exists) return json({ error: 'Not found' }, 404);
        const { fileId } = await request.json().catch(() => ({}));
        if (!fileId) return json({ error: 'fileId requerido' }, 400);

        const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
        let driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        let resp = await fetch(driveUrl, { headers: { 'User-Agent': ua }, redirect: 'follow' });
        let ct = resp.headers.get('content-type') || '';
        if (ct.includes('text/html')) {
          const html = await resp.text();
          const m = html.match(/confirm=([^&"'\s]+)/);
          if (!m) return json({ error: 'Drive: no se pudo obtener confirm token' }, 502);
          driveUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=${m[1]}`;
          resp = await fetch(driveUrl, { headers: { 'User-Agent': ua }, redirect: 'follow' });
          ct = resp.headers.get('content-type') || '';
        }
        if (!resp.ok) return json({ error: 'Drive respondió ' + resp.status }, 502);
        // No se confía en el nombre del archivo: el mime real que reporta Drive
        // debe matchear el mismo allowlist que usa la carga manual del logo.
        const mimeBase = ct.split(';')[0].trim().toLowerCase();
        const ext = PARTNER_LOGO_MIME[mimeBase];
        if (!ext) return json({ error: 'El archivo de Drive no es una imagen permitida (PNG, JPG, WEBP o SVG)' }, 400);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        if (!bytes.length || bytes.length > 2 * 1024 * 1024) return json({ error: 'El logo debe pesar menos de 2 MB' }, 400);

        const key = `partners/${pid}/logo.${ext}`;
        await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mimeBase } });
        await env.KUERRE_DB.prepare('UPDATE partners SET logo_key = ? WHERE id = ?').bind(key, pid).run();
        return json({ ok: true, logo_key: key });
      }

      const partnerAsignMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/partner$/);
      if (partnerAsignMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { partner_id } = await request.json().catch(() => ({}));
        const pid = String(partner_id || PARTNER_DEFAULT);
        const ok = await env.KUERRE_DB.prepare('SELECT id FROM partners WHERE id = ? AND activo = 1').bind(pid).first();
        if (!ok) return json({ error: 'Marca inexistente o inactiva' }, 400);
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET partner_id = ? WHERE id = ?')
          .bind(pid, partnerAsignMatch[1]).run();
        return json({ ok: true });
      }

      const solicitudProcesadaMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})\/procesada$/);
      if (solicitudProcesadaMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        await env.KUERRE_DB.prepare('UPDATE solicitudes SET procesada=1 WHERE id=?').bind(solicitudProcesadaMatch[1]).run();
        return json({ ok: true });
      }

      const solicitudDelMatch = path.match(/^\/solicitudes\/([A-Z2-9]{6})$/);
      if (solicitudDelMatch && method === 'GET') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const row = await env.KUERRE_DB.prepare(`
          SELECT s.*, e.tipo, e.fecha AS fecha_ev, e.nombre AS nombre_display
          FROM solicitudes s LEFT JOIN eventos e ON e.id = s.evento_id
          WHERE s.id=?`).bind(solicitudDelMatch[1]).first();
        if (!row) return json({ error: 'Not found' }, 404);
        // Todas las columnas de la DB, sin whitelist — lo que se agregue a la tabla llega solo al admin
        const { fecha_ev, data_json, ...rest } = row;
        return json({ ...rest, fecha: fecha_ev || '' });
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
          // La fecha del evento vive en la tabla eventos (fuente de verdad para el calendario)
          const sol = await env.KUERRE_DB.prepare('SELECT evento_id FROM solicitudes WHERE id=?').bind(sid).first();
          if (!sol?.evento_id) return json({ error: 'Cliente sin evento vinculado' }, 400);
          await env.KUERRE_DB.prepare('UPDATE eventos SET fecha=? WHERE id=?').bind(fecha||'', sol.evento_id).run();
        } else if (tipo === 'book') {
          await env.KUERRE_DB.prepare('UPDATE solicitudes SET book_fecha=?, book_hora=?, book_zona=? WHERE id=?').bind(fecha||'', hora||'', lugar||'', sid).run();
        } else if (tipo === 'civil') {
          await env.KUERRE_DB.prepare('UPDATE solicitudes SET civil_fecha=?, civil_hora=?, civil_dir=? WHERE id=?').bind(fecha||'', hora||'', lugar||'', sid).run();
        } else if (tipo === 'religiosa') {
          await env.KUERRE_DB.prepare('UPDATE solicitudes SET reli_fecha=?, reli_hora=?, reli_dir=? WHERE id=?').bind(fecha||'', hora||'', lugar||'', sid).run();
        }
        return json({ ok: true });
      }
      if (agendarMatch && method === 'DELETE') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        const { tipo } = await request.json().catch(() => ({}));
        if (!tipo) return json({ error: 'tipo requerido' }, 400);
        const sid = agendarMatch[1];
        if (tipo === 'evento') {
          const sol = await env.KUERRE_DB.prepare('SELECT evento_id FROM solicitudes WHERE id=?').bind(sid).first();
          if (sol?.evento_id) await env.KUERRE_DB.prepare("UPDATE eventos SET fecha='' WHERE id=?").bind(sol.evento_id).run();
        } else if (tipo === 'book') {
          await env.KUERRE_DB.prepare("UPDATE solicitudes SET book_fecha='', book_hora='', book_zona='' WHERE id=?").bind(sid).run();
        } else if (tipo === 'civil') {
          await env.KUERRE_DB.prepare("UPDATE solicitudes SET civil_fecha='', civil_hora='', civil_dir='' WHERE id=?").bind(sid).run();
        } else if (tipo === 'religiosa') {
          await env.KUERRE_DB.prepare("UPDATE solicitudes SET reli_fecha='', reli_hora='', reli_dir='' WHERE id=?").bind(sid).run();
        }
        return json({ ok: true });
      }
      const entregaConfigMatch = path.match(/^\/entrega_configs\/([A-Z2-9]{6})$/);
      if (entregaConfigMatch && method === 'PATCH') {
        if (!await isAdmin(request, coreEnv)) return json({ error: 'Unauthorized' }, 401);
        return await handleEntregaConfigPatch(entregaConfigMatch[1], request, env);
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

      // ── KV directo (branding settings read/write) ─────────────────────────
      // Al final del router: el catch-all /{key} no debe pisar rutas API de un
      // solo segmento como /contratos o /hub.
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
