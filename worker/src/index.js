const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-idempotency-key'
  }
});

const now = () => new Date().toISOString();
const addSeconds = (iso, seconds) => new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
const randomToken = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
const randomMissionId = () => `mis_${crypto.randomUUID()}`;

function corsOrigin(request, env) {
  const requested = request.headers.get('origin');
  const allowed = env.ALLOWED_ORIGIN || '*';
  return allowed === '*' || requested === allowed ? (requested || allowed) : allowed;
}

async function readJson(request) {
  try { return await request.json(); }
  catch { return {}; }
}

async function getRecord(env, key) {
  const raw = await env.EXPLAIN_MISSIONS.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function putRecord(env, key, value, expirationTtl) {
  await env.EXPLAIN_MISSIONS.put(key, JSON.stringify(value), { expirationTtl });
}

function validTransition(from, to) {
  return (from === 'waiting' && to === 'running') || (from === 'running' && to === 'closed');
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env);
    if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const ttl = Number(env.DEFAULT_TTL_SECONDS || '604800');

    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'explain-mission-api' }, 200, origin);
    }

    if (path === '/invites' && request.method === 'POST') {
      const body = await readJson(request);
      const createdAt = now();
      const token = randomToken();
      const missionId = randomMissionId();
      const expiresAt = body.expiresAt || addSeconds(createdAt, ttl);
      const record = {
        token,
        missionId,
        issuerId: body.issuerId || 'kellen',
        issuerDisplayName: body.issuerDisplayName || 'Kellen Wilkinson',
        recipientDisplayName: body.recipientDisplayName || null,
        roleOrContext: body.roleOrContext || null,
        topic: body.topic || 'Explain ADL',
        approvedPersonalizationContext: body.approvedPersonalizationContext || {},
        policyFlags: {
          transcriptDefault: false,
          receiptMode: 'minimal'
        },
        state: 'waiting',
        createdAt,
        expiresAt,
        openedAt: null,
        closedAt: null,
        receipt: null
      };
      await putRecord(env, `invite:${token}`, record, ttl);
      await putRecord(env, `mission:${missionId}`, record, ttl);
      return json({ token, missionId, inviteUrl: `${url.origin}/i/${token}`, expiresAt }, 201, origin);
    }

    const inviteMatch = path.match(/^\/invites\/([A-Za-z0-9_-]+)$/);
    if (inviteMatch && request.method === 'GET') {
      const token = inviteMatch[1];
      const record = await getRecord(env, `invite:${token}`);
      if (!record) return json({ error: 'invite_not_found' }, 404, origin);
      if (new Date(record.expiresAt) <= new Date()) return json({ error: 'invite_expired' }, 410, origin);
      const safe = {
        token: record.token,
        missionId: record.missionId,
        issuerDisplayName: record.issuerDisplayName,
        recipientDisplayName: record.recipientDisplayName,
        roleOrContext: record.roleOrContext,
        topic: record.topic,
        approvedPersonalizationContext: record.state === 'closed' ? {} : record.approvedPersonalizationContext,
        policyFlags: record.policyFlags,
        state: record.state,
        expiresAt: record.expiresAt,
        receipt: record.state === 'closed' ? record.receipt : null
      };
      return json(safe, 200, origin);
    }

    const stateMatch = path.match(/^\/missions\/([A-Za-z0-9_-]+)\/state$/);
    if (stateMatch && request.method === 'POST') {
      const token = stateMatch[1];
      const body = await readJson(request);
      const record = await getRecord(env, `invite:${token}`);
      if (!record) return json({ error: 'invite_not_found' }, 404, origin);
      if (!validTransition(record.state, body.state)) {
        return json({ error: 'invalid_transition', from: record.state, to: body.state }, 409, origin);
      }
      const updated = {
        ...record,
        state: body.state,
        openedAt: body.state === 'running' ? now() : record.openedAt,
        closedAt: body.state === 'closed' ? now() : record.closedAt,
        approvedPersonalizationContext: body.state === 'closed' ? {} : record.approvedPersonalizationContext
      };
      const remainingTtl = Math.max(60, Math.floor((new Date(updated.expiresAt).getTime() - Date.now()) / 1000));
      await putRecord(env, `invite:${token}`, updated, remainingTtl);
      await putRecord(env, `mission:${record.missionId}`, updated, remainingTtl);
      return json({ token, missionId: record.missionId, state: updated.state, openedAt: updated.openedAt, closedAt: updated.closedAt }, 200, origin);
    }

    const receiptMatch = path.match(/^\/missions\/([A-Za-z0-9_-]+)\/receipt$/);
    if (receiptMatch && request.method === 'POST') {
      const token = receiptMatch[1];
      const body = await readJson(request);
      const idempotencyKey = request.headers.get('x-idempotency-key') || body.idempotencyKey || `close:${token}`;
      const record = await getRecord(env, `invite:${token}`);
      if (!record) return json({ error: 'invite_not_found' }, 404, origin);
      if (record.receipt) return json(record.receipt, 200, origin);
      if (record.state !== 'running') return json({ error: 'mission_not_running' }, 409, origin);

      const completedAt = now();
      const receipt = {
        missionId: record.missionId,
        createdAt: completedAt,
        summary: body.summary || null,
        handoffType: body.handoffType || null,
        primaryQuestion: body.primaryQuestion || null,
        outcomeCode: body.outcomeCode || 'closed_no_handoff',
        hoverSignal: Boolean(body.hoverSignal),
        idempotencyKey,
        status: 'closed'
      };
      const updated = {
        ...record,
        state: 'closed',
        closedAt: completedAt,
        approvedPersonalizationContext: {},
        receipt
      };
      const remainingTtl = Math.max(60, Math.floor((new Date(updated.expiresAt).getTime() - Date.now()) / 1000));
      await putRecord(env, `invite:${token}`, updated, remainingTtl);
      await putRecord(env, `mission:${record.missionId}`, updated, remainingTtl);
      return json(receipt, 201, origin);
    }

    if (receiptMatch && request.method === 'GET') {
      const token = receiptMatch[1];
      const record = await getRecord(env, `invite:${token}`);
      if (!record) return json({ error: 'invite_not_found' }, 404, origin);
      if (!record.receipt) return json({ error: 'receipt_not_found' }, 404, origin);
      return json(record.receipt, 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  }
};
