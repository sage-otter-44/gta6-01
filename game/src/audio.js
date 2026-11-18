// Synthesized sound, no audio files: a WebAudio graph built on the first user gesture
// (browsers refuse audio before one). Engine hum follows the car's speed, the siren wails
// while wanted, and shots, thuds and mission jingles are short blips of oscillator and noise.
// Everything is guarded so a game with no audio device, or a muted tab, just stays quiet.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }
  function blip(freq, duration, type, volume, slideTo) {
    if (!started || muted) return;
    try {
      const osc = context.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, context.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
      const gain = context.createGain();
      gain.gain.setValueAtTime(volume, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start();
      osc.stop(context.currentTime + duration + 0.02);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }
  function noise(duration, volume, lowpass) {
    if (!started || muted) return;
    try {
      const length = Math.floor(context.sampleRate * duration);
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = lowpass;
      const gain = context.createGain();
      gain.gain.value = volume;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch {
      // Sound is garnish.
    }
  }

  return {
    /** Call on the first gesture (start button / click) so audio is allowed. */
    unlock() {
      if (ensure() && context.state === 'suspended') context.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() { return muted; },
    /** Called every frame with the driving state: speed 0..1, wanted stars. */
    update(dt, speed01, wanted) {
      if (!started) return;
      if (engineGain) engineGain.gain.value = muted ? 0 : speed01 * 0.06;
      if (engineOsc) engineOsc.frequency.value = 50 + speed01 * 130;
      if (sirenGain) sirenGain.gain.value = muted || wanted === 0 ? 0 : 0.035;
      if (sirenOsc && wanted > 0) {
        sirenTimer += dt;
        sirenOsc.frequency.value = 650 + Math.sin(sirenTimer * 4.5) * 220;
      }
    },
    shot() { noise(0.09, 0.5, 2400); },
    thud() { noise(0.16, 0.4, 500); blip(90, 0.14, 'sine', 0.35, 45); },
    coin() { blip(880, 0.09, 'sine', 0.25, 1320); },
    jingle() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        window.setTimeout(() => blip(freq, 0.16, 'triangle', 0.3), i * 110);
      });
    },
    busted() { blip(220, 0.5, 'sawtooth', 0.25, 110); },
  };
}
