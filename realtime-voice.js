(function () {
  let pc = null;
  let dataChannel = null;
  let remoteAudio = null;
  let localStream = null;
  let connected = false;

  function apiBase() {
    if (!window.EXPLAIN_API) throw new Error('EXPLAIN_API is not configured');
    return window.EXPLAIN_API.replace(/\/$/, '');
  }

  async function connect({ recipientDisplayName = '', roleOrContext = '', approvedContext = '' } = {}) {
    stop();

    pc = new RTCPeerConnection();
    remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    pc.ontrack = event => {
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play().catch(() => {});
    };

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

    dataChannel = pc.createDataChannel('oai-events');
    dataChannel.onopen = () => {
      connected = true;
      window.dispatchEvent(new CustomEvent('explain:realtime-state', { detail: { state: 'LISTENING' } }));
    };
    dataChannel.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'response.audio.started') {
          window.dispatchEvent(new CustomEvent('explain:realtime-state', { detail: { state: 'SPEAKING' } }));
        }
        if (message.type === 'response.audio.done' || message.type === 'response.done') {
          window.dispatchEvent(new CustomEvent('explain:realtime-state', { detail: { state: 'LISTENING' } }));
        }
        if (message.type === 'input_audio_buffer.speech_started') {
          window.dispatchEvent(new CustomEvent('explain:realtime-state', { detail: { state: 'INTERRUPTED' } }));
        }
      } catch {}
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const response = await fetch(`${apiBase()}/realtime/session`, {
      method: 'POST',
      headers: {
        'content-type': 'application/sdp',
        'x-explain-recipient': recipientDisplayName,
        'x-explain-role': roleOrContext,
        'x-explain-context': approvedContext
      },
      body: offer.sdp
    });

    if (!response.ok) {
      stop();
      throw new Error(`REALTIME_SESSION_FAILED_${response.status}`);
    }

    await pc.setRemoteDescription({ type: 'answer', sdp: await response.text() });
    return { ok: true };
  }

  async function speak(input) {
    if (!connected || !dataChannel || dataChannel.readyState !== 'open') {
      throw new Error('REALTIME_NEURAL_UNAVAILABLE');
    }

    input.onStart?.();
    dataChannel.send(JSON.stringify({
      type: 'response.create',
      response: {
        instructions: input.text,
        modalities: ['audio']
      }
    }));

    return { ok: true, engineLabel: 'REALTIME_NEURAL' };
  }

  function stop() {
    try { dataChannel?.close(); } catch {}
    try { pc?.close(); } catch {}
    try { localStream?.getTracks().forEach(track => track.stop()); } catch {}
    try {
      if (remoteAudio) {
        remoteAudio.pause();
        remoteAudio.srcObject = null;
      }
    } catch {}
    dataChannel = null;
    pc = null;
    localStream = null;
    remoteAudio = null;
    connected = false;
    window.dispatchEvent(new CustomEvent('explain:realtime-state', { detail: { state: 'CLOSED' } }));
  }

  window.ExplainRealtimeVoice = { connect, speak, stop };
})();
