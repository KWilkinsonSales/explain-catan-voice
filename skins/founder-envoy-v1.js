window.EXPLAIN_SKINS = window.EXPLAIN_SKINS || {};

window.EXPLAIN_SKINS.founder_envoy_consequence_narrator_v1 = {
  id: 'founder_envoy_consequence_narrator_v1',
  name: 'Founder Envoy / Consequence Narrator',
  intent: 'Calm, cinematic, consequential',
  constraints: {
    noChatBubbles: true,
    noGenericCards: true,
    singleCentralPresence: true,
    restrainedMotion: true,
    maxSimultaneousAnimations: 1
  },
  voice: {
    provider: 'realtime',
    fallbackProvider: 'browser',
    ttsVoice: 'alloy',
    prosody: {
      paceWpm: 145,
      pauseProfile: 'cinematic',
      warmth: 0.65,
      gravity: 0.8,
      pitchRange: 0.35,
      dynamicRange: 0.4
    },
    emphasisRules: {
      consequenceWords: ['risk', 'cost', 'tradeoff', 'consequence', 'commitment'],
      orientationWords: ['context', 'map', 'where we are', 'signal']
    },
    punctuationStrategy: 'short-lines'
  },
  language: {
    register: 'founder-brief',
    sentenceLength: 'short-to-medium',
    cadence: 'measured',
    allowedDevices: ['one-metaphor-at-a-time', 'three-beat-emphasis-rare'],
    forbiddenDevices: ['overhype', 'salesy-cta']
  },
  typography: {
    primaryFont: 'Georgia, serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    base: 16,
    h1: 36,
    h2: 28,
    caption: {
      case: 'sentence',
      weight: 500,
      opacity: 0.82
    }
  },
  color: {
    field: '#07080B',
    fieldSecondary: '#111C2D',
    consequenceGold: '#C9A24A',
    orientationTeal: '#2BB3A9',
    textPrimary: '#EDEFF3',
    textSecondary: '#A7AFBD'
  },
  motion: {
    tempo: 'slow',
    easing: 'cubic-bezier(.22,.61,.36,1)',
    reveal: { style: 'fade-subtle-lift', durationMs: 420 },
    hover: { style: 'glow-edge', durationMs: 160 },
    close: { style: 'fade-to-black-receipt', durationMs: 520 }
  },
  imagery: {
    treatment: {
      grade: 'low-saturation',
      contrast: 'soft',
      vignette: 'subtle',
      grain: 'very-light'
    },
    composition: {
      centralSubject: true,
      backgroundNoise: 'minimal'
    },
    allowedMediaSlots: [
      'recipientPhoto',
      'decisionDiagram',
      'metaphorImage',
      'highlightedExcerpt',
      'missionApprovedAttachment'
    ]
  },
  interaction: {
    hoverStateBehavior: {
      show: ['term-definition', 'stakes-highlight'],
      neverShow: ['feature-menu', 'cards-grid']
    },
    states: {
      listening: { accent: 'orientationTeal', visuals: ['ambient-field', 'breathing-indicator'] },
      speaking: { accent: 'textPrimary', visuals: ['central-presence', 'timed-reveals'] },
      reveal: { accent: 'consequenceGold', visuals: ['single-reveal-plate'] },
      hover: { accent: 'consequenceGold', visuals: ['edge-glow'] },
      close: { accent: 'textSecondary', visuals: ['fade-black', 'receipt'] }
    }
  }
};
