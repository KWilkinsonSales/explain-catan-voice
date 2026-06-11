(function () {
  const VoiceEngineLabel = Object.freeze({
    REALTIME_NEURAL: 'REALTIME_NEURAL',
    BROWSER_TTS: 'BROWSER_TTS',
    NONE: 'NONE'
  });

  const VoiceMode = Object.freeze({
    NORMAL: 'NORMAL',
    DEGRADED_FALLBACK: 'DEGRADED_FALLBACK',
    DISABLED: 'DISABLED'
  });

  const APPROVED_ENGINE_PATH = 'voice-engine.js';

  let runtimeState = Object.freeze({
    mode: VoiceMode.DISABLED,
    engineLabel: VoiceEngineLabel.NONE,
    enginePath: APPROVED_ENGINE_PATH,
    engineEnabled: false
  });

  function assertVoiceStateInvariant(state, actualAudioPath = state.engineLabel) {
    if (state.enginePath !== APPROVED_ENGINE_PATH) {
      throw new Error(`[VOICE_ENGINE_INVARIANT] enginePath mismatch: ${state.enginePath}`);
    }

    if (!state.engineEnabled && state.engineLabel !== VoiceEngineLabel.NONE) {
      throw new Error('VOICE_GATE: engine disabled');
    }

    if (state.engineLabel === VoiceEngineLabel.BROWSER_TTS && state.mode !== VoiceMode.DEGRADED_FALLBACK) {
      throw new Error('[VOICE_ENGINE_INVARIANT] BROWSER_TTS allowed only in DEGRADED_FALLBACK');
    }

    if (state.engineLabel === VoiceEngineLabel.REALTIME_NEURAL && state.mode !== VoiceMode.NORMAL) {
      throw new Error('[VOICE_ENGINE_INVARIANT] REALTIME_NEURAL requires NORMAL mode');
    }

    if (state.engineLabel === VoiceEngineLabel.NONE && state.mode !== VoiceMode.DISABLED) {
      throw new Error('[VOICE_ENGINE_INVARIANT] NONE requires DISABLED mode');
    }

    if (state.engineLabel !== actualAudioPath) {
      throw new Error(`VOICE_GATE_MISMATCH: label=${state.engineLabel} runtime=${runtimeState.engineLabel} actual=${actualAudioPath}`);
    }

    if (state.engineLabel !== runtimeState.engineLabel || state.mode !== runtimeState.mode) {
      throw new Error(`VOICE_GATE_MISMATCH: label=${state.engineLabel} runtime=${runtimeState.engineLabel} actual=${actualAudioPath}`);
    }
  }

  function setVoiceRuntimeState(next) {
    const normalized = Object.freeze({
      mode: next.mode,
      engineLabel: next.engineLabel,
      enginePath: APPROVED_ENGINE_PATH,
      engineEnabled: Boolean(next.engineEnabled)
    });
    assertVoiceStateInvariant(normalized, normalized.engineLabel);
    runtimeState = normalized;
    window.dispatchEvent(new CustomEvent('explain:voice-state', { detail: runtimeState }));
    return runtimeState;
  }

  function getVoiceRuntimeState() {
    assertVoiceStateInvariant(runtimeState, runtimeState.engineLabel);
    return runtimeState;
  }

  function getUiEngineLabel() {
    return getVoiceRuntimeState().engineLabel;
  }

  function emitBrowserTts(input) {
    const actualAudioPath = VoiceEngineLabel.BROWSER_TTS;
    assertVoiceStateInvariant(runtimeState, actualAudioPath);

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(input.text);
      utterance.rate = input.rate ?? 0.92;
      utterance.pitch = input.pitch ?? 0.98;
      utterance.onstart = () => input.onStart?.();
      utterance.onend = () => { input.onEnd?.(); resolve({ ok: true, engineLabel: actualAudioPath }); };
      utterance.onerror = event => reject(new Error(event.error || 'BROWSER_TTS_FAILED'));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }

  async function emitRealtimeNeural(input) {
    const actualAudioPath = VoiceEngineLabel.REALTIME_NEURAL;
    assertVoiceStateInvariant(runtimeState, actualAudioPath);
    window.speechSynthesis.cancel();

    if (!window.ExplainRealtimeVoice?.speak) {
      throw new Error('REALTIME_NEURAL_UNAVAILABLE');
    }

    return window.ExplainRealtimeVoice.speak(input);
  }

  async function speak(input) {
    const state = getVoiceRuntimeState();

    if (state.engineLabel === VoiceEngineLabel.NONE) {
      return { ok: false, engineLabel: VoiceEngineLabel.NONE, error: 'Voice disabled' };
    }

    if (state.engineLabel === VoiceEngineLabel.REALTIME_NEURAL) {
      return emitRealtimeNeural(input);
    }

    if (state.engineLabel === VoiceEngineLabel.BROWSER_TTS) {
      return emitBrowserTts(input);
    }

    throw new Error(`VOICE_ENGINE_UNHANDLED: ${state.engineLabel}`);
  }

  function stop() {
    window.speechSynthesis.cancel();
    if (window.ExplainRealtimeVoice?.stop) window.ExplainRealtimeVoice.stop();
  }

  window.ExplainVoiceEngine = {
    VoiceEngineLabel,
    VoiceMode,
    setVoiceRuntimeState,
    getVoiceRuntimeState,
    getUiEngineLabel,
    speak,
    stop,
    assertVoiceStateInvariant
  };
})();
