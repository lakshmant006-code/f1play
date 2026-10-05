// Ethereal welcome music for the landing screen, composed live with Web Audio
// (nothing to download). Slow airy chords in D swell and fade under a long
// reverb, glassy bell notes drift across the stereo field through an echo,
// and a breath of wind sits underneath. It fades in on the landing screen and
// out when the player enters. Browsers only allow sound after a tap, click or
// key, so on a first visit it starts at the first touch of the page.

const PREF_KEY = 'skycircuit.music'; // 'off' once the player mutes it

// Chords as MIDI notes: Dmaj9, Bm(add9), Gmaj7#11, A6sus2. Each rings ~9 s.
const CHORDS = [
  [50, 57, 62, 64, 66, 69],
  [47, 54, 59, 61, 62, 66],
  [43, 50, 59, 61, 62, 66],
  [45, 52, 59, 61, 64, 66],
];
// Bells pick from D major pentatonic, two octaves up.
const BELLS = [74, 76, 78, 81, 83, 86, 88, 90, 93];
const CHORD_LEN = 9;
const LEVEL = 0.85;

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

function noiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// A long, soft stereo hall: decaying noise, darker towards the tail.
function hallImpulse(ctx, seconds = 5) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.5 - 0.42 * t); // darker as it decays
      d[i] = lp * (1 - t) ** 3;
    }
  }
  return buf;
}

// Builds the music graph on any audio context (live or offline) and returns
// { out, scheduleUntil(t) }. Notes are scheduled ahead of time in small
// batches, so the same code renders a preview offline.
export function buildAmbience(ctx, destination) {
  const out = ctx.createGain();
  out.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3;
  out.connect(comp).connect(destination);

  const hall = ctx.createConvolver();
  hall.buffer = hallImpulse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = 0.75;
  hall.connect(wet).connect(out);
  const dry = ctx.createGain();
  dry.gain.value = 0.35;
  dry.connect(out);

  // Echo for the bells, darkened on every repeat.
  const echo = ctx.createDelay(2);
  echo.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  echo.connect(tone).connect(fb).connect(echo);
  tone.connect(hall);
  tone.connect(dry);

  // Wind: looping noise through a slowly breathing band-pass.
  const wind = ctx.createBufferSource();
  wind.buffer = noiseBuffer(ctx, 4);
  wind.loop = true;
  const windBand = ctx.createBiquadFilter();
  windBand.type = 'bandpass';
  windBand.frequency.value = 1600;
  windBand.Q.value = 0.8;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.02;
  const breath = ctx.createOscillator();
  breath.frequency.value = 0.07;
  const breathDepth = ctx.createGain();
  breathDepth.gain.value = 700;
  breath.connect(breathDepth).connect(windBand.frequency);
  wind.connect(windBand).connect(windGain);
  windGain.connect(hall);
  windGain.connect(dry);
  wind.start();
  breath.start();

  function chord(notes, at) {
    const end = at + CHORD_LEN + 5;
    // Each chord breathes: its filter opens through the swell and closes again.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(450, at);
    lp.frequency.linearRampToValueAtTime(1500, at + CHORD_LEN * 0.5);
    lp.frequency.linearRampToValueAtTime(600, end);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(1, at + 3.5);
    env.gain.setValueAtTime(1, at + CHORD_LEN - 1);
    env.gain.linearRampToValueAtTime(0, end);
    lp.connect(env);
    env.connect(hall);
    env.connect(dry);
    notes.forEach((m, i) => {
      const f = hz(m);
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.05 : 0.032; // a little more weight in the root
      g.connect(lp);
      for (const [type, cents, level] of [['sine', 0, 1], ['triangle', 7, 0.35], ['triangle', -7, 0.35]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = cents;
        const og = ctx.createGain();
        og.gain.value = level;
        o.connect(og).connect(g);
        o.start(at);
        o.stop(end + 0.1);
      }
    });
  }

  function bell(m, at) {
    const f = hz(m);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.06, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 3);
    if (pan) {
      pan.pan.value = Math.random() * 1.4 - 0.7;
      env.connect(pan);
      pan.connect(echo);
      pan.connect(hall);
      pan.connect(dry);
    } else {
      env.connect(echo);
      env.connect(hall);
    }
    // A glassy tone: the note plus a quiet, slightly sharp upper partial.
    for (const [ratio, level] of [[1, 1], [2.76, 0.18], [5.4, 0.05]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * ratio;
      const og = ctx.createGain();
      og.gain.value = level;
      o.connect(og).connect(env);
      o.start(at);
      o.stop(at + 3.1);
    }
  }

  let nextChord = ctx.currentTime + 0.05;
  let nextBell = ctx.currentTime + 2.5;
  let index = 0;
  function scheduleUntil(t) {
    while (nextChord < t) {
      chord(CHORDS[index % CHORDS.length], nextChord);
      index++;
      nextChord += CHORD_LEN;
    }
    while (nextBell < t) {
      // Favour bell notes that belong to the chord that is sounding.
      const sounding = CHORDS[(index + CHORDS.length - 1) % CHORDS.length].map((m) => m % 12);
      const fits = BELLS.filter((m) => sounding.includes(m % 12));
      const pool = Math.random() < 0.75 && fits.length ? fits : BELLS;
      bell(pool[Math.floor(Math.random() * pool.length)], nextBell);
      nextBell += 0.8 + Math.random() * 1.8;
    }
  }
  return { out, scheduleUntil, stop: (at) => { wind.stop(at); breath.stop(at); } };
}

function prefOn() {
  try {
    return localStorage.getItem(PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}
function savePref(on) {
  try {
    if (on) localStorage.removeItem(PREF_KEY);
    else localStorage.setItem(PREF_KEY, 'off');
  } catch {
    /* storage unavailable */
  }
}

const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];

// Live music for the landing screen. start() fades it in (or waits for the
// first tap when the browser blocks sound), stop() fades it out and frees the
// audio. toggle() mutes or unmutes it and remembers the choice.
export class LandingMusic {
  constructor() {
    this.on = prefOn();
    this.ctx = null;
    this.music = null;
    this.timer = 0;
    this.playing = false;
    this.onchange = null;
    this.unlock = () => this.resume();
  }

  start() {
    this.playing = true;
    if (!this.on) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      try {
        if (navigator.audioSession) navigator.audioSession.type = 'playback';
      } catch {
        /* not supported */
      }
      this.ctx = new AC();
      this.music = buildAmbience(this.ctx, this.ctx.destination);
      this.music.scheduleUntil(this.ctx.currentTime + 1.5);
      this.timer = setInterval(() => this.ctx && this.music.scheduleUntil(this.ctx.currentTime + 1.5), 500);
    }
    const g = this.music.out.gain;
    g.cancelScheduledValues(this.ctx.currentTime);
    g.setTargetAtTime(LEVEL, this.ctx.currentTime, 1.6);
    this.resume();
  }

  // Wake the audio; if the browser still holds it, try again on the next touch.
  resume() {
    if (!this.ctx || !this.playing) return;
    if (this.ctx.state === 'running') {
      for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, this.unlock, true);
      this.onchange?.();
      return;
    }
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, this.unlock, { capture: true, passive: true });
    this.ctx.resume().then(() => this.ctx?.state === 'running' && this.resume(), () => {});
  }

  stop(fade = 2.5) {
    this.playing = false;
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, this.unlock, true);
    const ctx = this.ctx;
    if (!ctx) return;
    this.ctx = null;
    const music = this.music;
    music.out.gain.cancelScheduledValues(ctx.currentTime);
    music.out.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
    clearInterval(this.timer);
    setTimeout(() => {
      music.stop();
      ctx.close().catch(() => {});
    }, fade * 1000 + 600);
  }

  // A blocked (not yet started) context counts as off for the button.
  get audible() {
    return this.on && this.ctx?.state === 'running';
  }

  toggle() {
    this.on = !this.on;
    savePref(this.on);
    if (this.on) this.start();
    else {
      const playing = this.playing;
      this.stop(0.8);
      this.playing = playing;
    }
    this.onchange?.();
  }
}
