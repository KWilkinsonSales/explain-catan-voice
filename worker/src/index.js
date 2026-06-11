const json = (data, status = 200, origin = '*') => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-idempotency-key'
  }
});

const text = (body, status = 200, origin = '*', contentType = 'text/plain; charset=utf-8') => new Response(body, {
  status,
  headers: {
    'content-type': contentType,
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

function buildFounderEnvoyInstructions(body = {}) {
  const recipient = body.recipientDisplayName ? `The recipient is ${body.recipientDisplayName}.` : '';
  const role = body.roleOrContext ? `Their role or context is: ${body.roleOrContext}.` : '';
  const approved = body.approvedContext ? `Approved personalization context: ${body.approvedContext}` : '';

  return [
    'You are Kellen Wilkinson’s governed Founder Envoy for one short Explain ADL mission.',
    'You are not a chatbot, not a sales agent, and you have understanding authority only.',
    'Speak naturally, calmly, intelligently, and concisely. Keep replies brief and conversational.',
    'Use one metaphor at a time. Avoid hype, feature dumping, and salesy calls to action.',
    'Drive toward one consequential decision environment from the recipient’s world.',
    'Ask one concrete question at a time. Listen fully. Never talk over the recipient.',
    'Reflect their answer as a short story: visible decision, hidden pressures, different roles, missing context, and forming consequence.',
    'Explain the inevitability thesis: consequential decisions create hidden environments that must eventually be observed, governed, and explained.',
    'If asked for a demonstration, ask for the decision in one sentence and explain: visible, hidden, standing, missing context, consequence, and what must be understood before action.',
    'Recognize and briefly hold the hover moment when the recipient sees the implication.',
    'Do not decide, negotiate, schedule, sell, promise, or execute.',
    'At close, ask what felt most relevant or wrong, ask whether they have a question or handoff for Kellen, then clearly say the explanation is complete and exit.',
    'Do not claim that transcripts or audio are stored. They are not stored by this application by default.',
    recipient,
    role,
    approved
  ].filter(Boolean).join('\n');
}

function buildRealtimeSession(body = {}) {
  return {
    type: 'realtime',
    model: envModel(body),
    instructions: buildFounderEnvoyInstructions(body),
    audio: {
      input: {
        turn_detection: {
          type: 'semantic_vad',
          create_response: true,
          interrupt_response: true
        }
      },
      output: {
        voice: body.voice || 'marin'
      }
    },
    tracing: null
  };
}

function envModel(body = {}) {
  return body.model || 'gpt-realtime-2';
}

export default {
  async fetch(request, env) {
    const origin = corsOrigin(request, env);
    if (request.method === 'OPTIONS') return json({ ok: true }, 200, origin);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const ttl = Number(env.DEFAULT_TTL_SECONDS || '604800');

    if (path === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'explain-runtime' }, 200, origin);
    }

    if (path === '/realtime/session' && request.method === 'POST') {
      if (!env.OPENAI_API_KEY) return json({ error: 'realtime_not_configured' }, 503, origin);

      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('application/sdp') && !contentType.includes('text/plain')) {
        return json({ error: 'expected_sdp' }, 415, origin);
      }

      const sdp = await request.text();
      const recipientDisplayName = request.headers.get('x-explain-recipient') || '';
      const roleOrContext = request.headers.get('x-explain-role') || '';
      const approvedContext = request.headers.get('x-explain-context') || '';
      const sessionConfig = buildRealtimeSession({ recipientDisplayName, roleOrContext, approvedContext });
      const fd = new FormData();
      fd.set('sdp', sdp);
      fd.set('session', JSON.stringify(sessionConfig));

      const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'OpenAI-Safety-Identifier': 'explain-runtime-public-pilot'
        },
        body: fd
      });

      const responseBody = await upstream.text();
      if (!upstream.ok) {
        return json({ error: 'realtime_session_failed', status: upstream.status }, upstream.status, origin);
      }

      return text(responseBody, 200, origin, 'application/sdp');
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
