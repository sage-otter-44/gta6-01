// Sound for Solmar Bay, all synthesized with WebAudio: no audio files, no
// network. Every effect is a short oscillator or noise burst wrapped in an
// envelope. The context is created lazily on the first user gesture; in a
// screenshot run there is no gesture, so everything stays silent and safe.
export function createAudio() {
  let context = null;
  let engineNodes = null;
  let sirenNodes = null;
  let muted = false;

  function ensure() {
    if (context) return context;
    try {
      const AudioContext = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
    } catch {
      context = null;
    }
    return context;
  }

  /** Call from a user gesture so the browser lets sound start. */
  function unlock() {
    const ctx = ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function setMuted(value) {
    muted = value;
    if (muted) stopEngine();
  }

  function tone(freq, duration, type, volume, slideTo) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + duration);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(duration, volume, filterFreq) {
    const ctx = ensure();
    if (!ctx || muted) return;
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
    } catch {
      // Sound is garnish.
    }
  }

  function shot() {
    noise(0.14, 0.5, 1800);
    tone(160, 0.1, 'square', 0.25, 60);
  }

  function pickup() {
    tone(660, 0.09, 'sine', 0.3);
    setTimeout(() => tone(880, 0.12, 'sine', 0.3), 70);
  }

  function missionDone() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => setTimeout(() => tone(freq, 0.22, 'triangle', 0.32), i * 110));
  }

  function busted() {
    tone(392, 0.3, 'sawtooth', 0.25, 196);
    setTimeout(() => tone(311, 0.5, 'sawtooth', 0.25, 155), 260);
  }

  function click() {
    tone(440, 0.05, 'square', 0.15);
  }

  function crash() {
    noise(0.25, 0.5, 700);
  }

  /** A continuous engine hum that follows the car's speed (0..1). */
  function engine(speedRatio) {
    const ctx = ensure();
    if (!ctx || muted) { stopEngine(); return; }
    try {
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start();
        engineNodes = { osc, gain };
      }
      const target = speedRatio > 0.02 ? 0.05 + speedRatio * 0.06 : 0;
      engineNodes.osc.frequency.setTargetAtTime(55 + speedRatio * 110, ctx.currentTime, 0.08);
      engineNodes.gain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
    } catch {
      // Sound is garnish.
    }
  }

  function stopEngine() {
    if (!engineNodes) return;
    try {
      engineNodes.gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
    } catch {
      // Already gone.
    }
  }

  /** The two-tone police siren, on while any cop is chasing. */
  function siren(on) {
    const ctx = ensure();
    if (!ctx || muted || !on) {
      if (sirenNodes) {
        try { sirenNodes.osc.stop(); } catch { /* already stopped */ }
        sirenNodes = null;
      }
      return;
    }
    try {
      if (sirenNodes) return;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const gain = ctx.createGain();
      gain.gain.value = 0.045;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 320;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.frequency.value = 880;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo };
    } catch {
      // Sound is garnish.
    }
  }

  return {
    unlock, setMuted, shot, pickup, missionDone, busted, click, crash,
    engine, stopEngine, siren,
  };
}
