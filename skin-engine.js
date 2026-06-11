(function () {
  const STATE_CLASSES = ['skin-listening','skin-speaking','skin-reveal','skin-hover','skin-close'];

  function hexToRgb(hex) {
    const value = hex.replace('#','');
    const normalized = value.length === 3 ? value.split('').map(c => c + c).join('') : value;
    const int = parseInt(normalized, 16);
    return { r:(int>>16)&255, g:(int>>8)&255, b:int&255 };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function applyVariables(skin) {
    const root = document.documentElement;
    const c = skin.color;
    root.style.setProperty('--skin-field', c.field);
    root.style.setProperty('--skin-field-2', c.fieldSecondary);
    root.style.setProperty('--skin-gold', c.consequenceGold);
    root.style.setProperty('--skin-teal', c.orientationTeal);
    root.style.setProperty('--skin-text', c.textPrimary);
    root.style.setProperty('--skin-muted', c.textSecondary);
    root.style.setProperty('--skin-gold-soft', rgba(c.consequenceGold, .18));
    root.style.setProperty('--skin-teal-soft', rgba(c.orientationTeal, .18));
    root.style.setProperty('--skin-primary-font', skin.typography.primaryFont);
    root.style.setProperty('--skin-body-font', skin.typography.bodyFont);
    root.style.setProperty('--skin-motion-ease', skin.motion.easing);
    root.style.setProperty('--skin-reveal-ms', `${skin.motion.reveal.durationMs}ms`);
    root.style.setProperty('--skin-close-ms', `${skin.motion.close.durationMs}ms`);
  }

  function applyConstraints(skin) {
    document.documentElement.dataset.skinId = skin.id;
    document.documentElement.dataset.noChatBubbles = String(Boolean(skin.constraints.noChatBubbles));
    document.documentElement.dataset.singleCentralPresence = String(Boolean(skin.constraints.singleCentralPresence));
    document.documentElement.dataset.maxAnimations = String(skin.constraints.maxSimultaneousAnimations || 1);
  }

  function setRoomState(state) {
    const body = document.body;
    STATE_CLASSES.forEach(c => body.classList.remove(c));
    body.classList.add(`skin-${state}`);
    body.dataset.roomState = state;
    window.dispatchEvent(new CustomEvent('explain:room-state', { detail: { state } }));
  }

  function renderCue(cue = {}) {
    const plate = document.getElementById('revealPlate');
    if (!plate) return;
    const type = cue.type || 'orientationMoment';
    const text = cue.text || '';
    plate.dataset.cueType = type;
    plate.textContent = text;
    plate.classList.remove('active');
    requestAnimationFrame(() => {
      setRoomState(type === 'consequenceMoment' ? 'reveal' : 'hover');
      plate.classList.add('active');
    });
  }

  function clearCue() {
    const plate = document.getElementById('revealPlate');
    if (plate) plate.classList.remove('active');
  }

  function applySkin(skinId) {
    const skin = window.EXPLAIN_SKINS?.[skinId];
    if (!skin) throw new Error(`Unknown skin: ${skinId}`);
    applyVariables(skin);
    applyConstraints(skin);
    window.currentExplainSkin = skin;
    setRoomState('listening');
    return skin;
  }

  window.ExplainSkinEngine = { applySkin, setRoomState, renderCue, clearCue };
})();
