const ExplainMission = (() => {
  const KEY = 'explain.missions.v1';
  const now = () => new Date().toISOString();
  const id = () => 'mis_' + Math.random().toString(36).slice(2, 10);
  const token = () => Math.random().toString(36).slice(2, 8).toUpperCase();

  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
    catch { return {}; }
  }

  function writeAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  function create(config = {}) {
    const all = readAll();
    const missionId = id();
    const inviteToken = token();
    const mission = {
      missionId,
      inviteToken,
      issuer: config.issuer || 'Kellen Wilkinson',
      recipient: config.recipient || null,
      topic: config.topic || 'Explain ADL',
      skin: config.skin || 'Founder Envoy / Consequence Narrator',
      approvedContext: config.approvedContext || {},
      authority: 'understanding_only',
      status: 'waiting',
      createdAt: now(),
      startedAt: null,
      completedAt: null,
      expiresAt: config.expiresAt || null,
      receipt: null
    };
    all[missionId] = mission;
    writeAll(all);
    return mission;
  }

  function getById(missionId) {
    return readAll()[missionId] || null;
  }

  function getByInvite(inviteToken) {
    return Object.values(readAll()).find(m => m.inviteToken === inviteToken) || null;
  }

  function update(missionId, patch) {
    const all = readAll();
    if (!all[missionId]) return null;
    all[missionId] = { ...all[missionId], ...patch };
    writeAll(all);
    return all[missionId];
  }

  function start(missionId) {
    return update(missionId, { status: 'running', startedAt: now() });
  }

  function close(missionId, receipt = {}) {
    const minimalReceipt = {
      missionId,
      issuer: receipt.issuer || 'Kellen Wilkinson',
      recipient: receipt.recipient || null,
      topic: receipt.topic || 'Explain ADL',
      startedAt: receipt.startedAt || null,
      completedAt: now(),
      outcomeCode: receipt.outcomeCode || 'closed_no_handoff',
      hoverSignal: Boolean(receipt.hoverSignal),
      handoffRequested: Boolean(receipt.handoffRequested),
      handoffType: receipt.handoffType || null,
      primaryQuestion: receipt.primaryQuestion || null,
      status: 'closed'
    };
    return update(missionId, {
      status: 'closed',
      completedAt: minimalReceipt.completedAt,
      receipt: minimalReceipt,
      approvedContext: {}
    });
  }

  function list() {
    return Object.values(readAll());
  }

  function remove(missionId) {
    const all = readAll();
    delete all[missionId];
    writeAll(all);
  }

  return { create, getById, getByInvite, start, close, update, list, remove };
})();
window.ExplainMission = ExplainMission;
