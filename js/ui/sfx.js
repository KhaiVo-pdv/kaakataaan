// Tiny WebAudio synth so the game has feedback without shipping audio files.
let ctx = null;
export const sfx = { on: true };

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur = 0.12, type = 'sine', vol = 0.15, when = 0, slide = 0) {
  const a = ac();
  if (!a || !sfx.on) return;
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur = 0.2, vol = 0.12, when = 0) {
  const a = ac();
  if (!a || !sfx.on) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(g).connect(a.destination);
  src.start(a.currentTime + when);
}

// a short click of band-passed noise: dice knocking together or on wood
function burst(dur, vol, when, fc, q) {
  const a = ac();
  if (!a || !sfx.on) return;
  const n = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, n, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = fc;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.value = vol * Math.sqrt(q); // a narrow band-pass lets little through: make up for it
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + when);
}

// a woody "thock": a sine whose pitch drops fast
const knock = (freq, dur, vol, when) => tone(freq, dur, 'sine', vol, when, 0.6);

export const play = {
  // wooden dice: silent in the air, then each die bounces on the table a few times (knock + click,
  // quicker and softer each hop) in step with dice3d's drop, and a little roll as they settle.
  // A charged throw bounces more, louder, with a low thump on landing.
  dice(power = 0) {
    const p = Math.min(1, Math.max(0, +power || 0));
    const land = 0.4 * (1250 + 450 * p) / 1000;
    for (let d = 0; d < 2; d++) {
      let t = land + d * (0.025 + Math.random() * 0.03), gap = 0.13 + 0.05 * p, v = 1;
      for (let k = 0; k < 4 + Math.round(2 * p); k++, t += gap, gap *= 0.62, v *= 0.55) {
        knock(200 + Math.random() * 70, 0.05, 0.22 * v * (1 + 0.6 * p), t);
        burst(0.012, 0.16 * v * (1 + 0.5 * p), t, 1400 + Math.random() * 900, 3);
      }
    }
    if (p > 0.25) knock(90, 0.12, 0.15 + 0.15 * p, land);
    for (let i = 0; i < 3; i++) burst(0.006, 0.04, land + 0.33 + i * 0.035, 2200 + Math.random() * 800, 5);
  },
  // the dice clacking together in your hand while charging, louder the harder you shake
  rattle(power = 0) {
    burst(0.008, 0.1 + 0.12 * power, 0, 2600 + Math.random() * 1600, 6);
    burst(0.006, 0.07 + 0.08 * power, 0.015 + Math.random() * 0.03, 3200 + Math.random() * 1600, 6);
  },
  build() { tone(520, 0.08, 'triangle', 0.18); tone(780, 0.1, 'triangle', 0.14, 0.07); },
  gain() { tone(880, 0.07, 'sine', 0.08); tone(1320, 0.08, 'sine', 0.06, 0.05); },
  bad() { tone(220, 0.25, 'sawtooth', 0.08, 0, 0.6); },
  robber() { tone(180, 0.3, 'square', 0.07, 0, 0.5); noise(0.2, 0.08, 0.05); },
  click() { tone(660, 0.04, 'square', 0.05); },
  event() { [523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.12, i * 0.08)); },
  reveal() { [392, 523, 659, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.13, i * 0.09)); noise(0.4, 0.07, 0.3); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, i * 0.12)); },
  pop() { tone(420, 0.07, 'sine', 0.1, 0, 2.2); tone(980, 0.05, 'triangle', 0.05, 0.05); },
  unlock() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, 'square', 0.06, i * 0.06)); },
  boom() { noise(0.45, 0.16); tone(140, 0.4, 'sawtooth', 0.08, 0, 0.4); },
  firework() { noise(0.3, 0.07); tone(1400 + Math.random() * 600, 0.18, 'triangle', 0.03, 0.02, 0.5); },
  turn() { tone(740, 0.1, 'sine', 0.1); tone(988, 0.14, 'sine', 0.1, 0.09); },
};
