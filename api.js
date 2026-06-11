(function () {
  function apiBase() {
    if (!window.EXPLAIN_API) throw new Error('EXPLAIN_API is not configured. Load config.js first.');
    return window.EXPLAIN_API.replace(/\/$/, '');
  }

  async function request(path, options = {}) {
    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; }
    catch { body = { raw: text }; }
    if (!response.ok) {
      const error = new Error(body?.error || `API request failed (${response.status})`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  window.ExplainAPI = {
    createInvite(payload) {
      return request('/invites', { method: 'POST', body: JSON.stringify(payload) });
    },
    getInvite(token) {
      return request(`/invites/${encodeURIComponent(token)}`);
    },
    setMissionState(token, state) {
      return request(`/missions/${encodeURIComponent(token)}/state`, {
        method: 'POST',
        body: JSON.stringify({ state })
      });
    },
    writeReceipt(token, receipt) {
      return request(`/missions/${encodeURIComponent(token)}/receipt`, {
        method: 'POST',
        headers: { 'x-idempotency-key': receipt.idempotencyKey || `close:${token}` },
        body: JSON.stringify(receipt)
      });
    },
    getReceipt(token) {
      return request(`/missions/${encodeURIComponent(token)}/receipt`);
    },
    health() {
      return request('/health');
    }
  };
})();
