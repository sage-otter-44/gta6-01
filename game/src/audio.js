// All sound is synthesized with WebAudio: no audio files, no network. The
// context is created on the first user gesture; in screenshot mode (no
// gesture) every call is a silent no-op.

export function createAudio() {
  let ctx = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type ?? 'sine';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      osc.connect(gain).connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + dur);
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  function noise(dur, vol, lowpass) {
    const c = ensure();
    if (!c || muted) return;
    try {
      const len = Math.floor(c.sampleRate * dur);
      const buffer = c.createBuffer(1, len, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      src.buffer = buffer;
      const gain = c.createGain();
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      let node = src;
      if (lowpass) {
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = lowpass;
        src.connect(filter);
        node = filter;
      }
      node.connect(gain).connect(c.destination);
      src.start();
    } catch {
      // Audio is decoration; a failure never stops the game.
    }
  }

  return {
    unlock,
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    shot() { noise(0.12, 0.35, 3000); },
    hit() { tone(180, 0.15, 'square', 0.2, 90); },
    pickup() { tone(880, 0.12, 'sine', 0.25, 1320); },
    enter() { tone(320, 0.1, 'triangle', 0.2, 480); },
    crash() { noise(0.25, 0.4, 900); },
    mission() {
      tone(523, 0.12, 'sine', 0.25);
      setTimeout(() => tone(659, 0.12, 'sine', 0.25), 110);
      setTimeout(() => tone(784, 0.25, 'sine', 0.25), 220);
    },
    busted() { tone(220, 0.5, 'sawtooth', 0.2, 110); },
    /** Engine hum follows the car's speed; call every frame, 0 to stop. */
    engine(speed, maxSpeed) {
      const c = ensure();
      if (!c || muted) { this.stopEngine(); return; }
      try {
        if (!engineOsc) {
          engineOsc = c.createOscillator();
          engineGain = c.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.value = 60;
          engineGain.gain.value = 0;
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 500;
          engineOsc.connect(filter).connect(engineGain).connect(c.destination);
          engineOsc.start();
        }
        const ratio = Math.abs(speed) / maxSpeed;
        engineOsc.frequency.setValueAtTime(55 + ratio * 130, c.currentTime);
        engineGain.gain.setValueAtTime(0.02 + ratio * 0.05, c.currentTime);
      } catch {
        // Audio is decoration.
      }
    },
    stopEngine() {
      try {
        if (engineOsc) { engineOsc.stop(); engineOsc = null; engineGain = null; }
      } catch {
        engineOsc = null;
        engineGain = null;
      }
    },
    /** Two-tone police siren while any unit is chasing. */
    siren(on) {
      const c = ensure();
      if (!c || muted || !on) {
        try {
          if (sirenOsc) { sirenOsc.stop(); sirenOsc = null; sirenGain = null; }
          if (sirenTimer) { clearInterval(sirenTimer); sirenTimer = null; }
        } catch {
          sirenOsc = null;
          sirenGain = null;
        }
        return;
      }
      try {
        if (sirenOsc) return;
        sirenOsc = c.createOscillator();
        sirenGain = c.createGain();
        sirenOsc.type = 'sine';
        sirenOsc.frequency.value = 700;
        sirenGain.gain.value = 0.035;
        sirenOsc.connect(sirenGain).connect(c.destination);
        sirenOsc.start();
        let high = false;
        sirenTimer = setInterval(() => {
          if (!sirenOsc) return;
          high = !high;
          sirenOsc.frequency.setValueAtTime(high ? 950 : 700, c.currentTime);
        }, 450);
      } catch {
        // Audio is decoration.
      }
    },
  };
}
