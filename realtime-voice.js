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

  function dispatchState(state, detail = {}) {
    window.dispatchEvent(new CustomEvent('explain:realtime-state', { detail: { state, ...detail } }));
  }

  function waitForDataChannelOpen(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      if (dataChannel?.readyState === 'open') return resolve();
      const timeout = setTimeout(() => reject(new Error('REALTIME_DATA_CHANNEL_TIMEOUT')), timeoutMs);
      const onOpen = () => {
        clearTimeout(timeout);
        dataChannel?.removeEventListener('open', onOpen);
        resolve();
      };
      dataChannel?.addEventListener('open', onOpen, { once: true });
    });
  }

  async function connect({ recipientDisplayName = '', roleOrContext = '', approvedContext = '' } = {}) {
    stop();
    dispatchState('CONNECTING');

    pc = new RTCPeerConnection();
    remoteAudio = document.createElement('audio');
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.muted = false;
    remoteAudio.volume = 1;

    pc.ontrack = event => {
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.play().catch(error => {
        dispatchState('AUDIO_BLOCKED', { error: error?.message || 'play_failed' });
      });
    };

    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) throw new Error('MICROPHONE_TRACK_MISSING');
    pc.addTrack(audioTrack, localStream);

    dataChannel = pc.createDataChannel('oai-events');
    dataChannel.onopen = () => {
      connected = true;
      dispatchState('LISTENING');
    };
    dataChannel.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'response.output_audio.started') dispatchState('SPEAKING');
        if (message.type === 'response.output_audio.done' || message.type === 'response.done') dispatchState('LISTENING');
        if (message.type === 'input_audio_buffer.speech_started') dispatchState('INTERRUPTED');
        if (message.type === 'error') dispatchState('ERROR', { error: message.error?.message || 'realtime_error' });
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
    await waitForDataChannelOpen();
    return { ok: true };
  }

  async function speak(input) {
    if (!connected || !dataChannel || dataChannel.readyState !== 'open') {
      throw new Error('REALTIME_NEURAL_UNAVAILABLE');
    }

    input.onStart?.();
    dataChannel.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: input.text }]
      }
    }));
    dataChannel.send(JSON.stringify({
      type: 'response.create',
      response: {
        output_modalities: ['audio']
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
    dispatchState('CLOSED');
  }

  window.ExplainRealtimeVoice = { connect, speak, stop };
})();
