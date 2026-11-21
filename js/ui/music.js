// Background music: a short cheerful 8-bit loop synthesized with WebAudio (no audio files).
// Off by default; the choice is remembered. Browsers only allow sound after a tap or click, so a
// saved "on" starts at the first pointer press on the page.
import { storage } from './dom.js';

const KEY = 'katanittes.music';
const BPM = 108;
const STEP = 60 / BPM / 2; // one eighth note, in seconds
const VOLUME = 0.05;

// MIDI note -> Hz
const hz = n => 440 * 2 ** ((n - 69) / 12);

// 4 bars per chord, chords C - G - Am - F; each bar = 8 eighth notes. 0 = rest.
const CHORDS = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]];
const LEAD = [
  [72, 0, 76, 79, 76, 0, 74, 72], [74, 0, 71, 74, 79, 0, 77, 74],
  [76, 0, 72, 76, 81, 79, 76, 72], [77, 0, 76, 74, 72, 0, 69, 0],
  [72, 76, 79, 84, 79, 76, 74, 76], [74, 71, 67, 71, 74, 79, 77, 74],
  [72, 69, 76, 72, 81, 0, 79, 76], [77, 76, 74, 72, 74, 0, 72, 0],
];

let ctx = null, master = null, timer = null, step = 0, nextAt = 0;
export const music = { on: storage(KEY) === true };

function ac() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function note(freq, at, dur, type, vol) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + dur + 0.02);
}

function hat(at) {
  const len = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(), g = ctx.createGain();
  src.buffer = buf;
  g.gain.value = 0.25;
  src.connect(g).connect(master);
  src.start(at);
}

// one eighth note of the song: lead (square), bass (triangle), a soft chord stab and hi-hat
function playStep(i, at) {
  const bar = Math.floor(i / 8) % LEAD.length, beat = i % 8;
  const chord = CHORDS[bar % CHORDS.length];
  const lead = LEAD[bar][beat];
  if (lead) note(hz(lead), at, STEP * 0.9, 'square', 0.35);
  note(hz(chord[0] - 12), at, STEP * 0.8, 'triangle', beat % 2 ? 0.45 : 0.7);
  if (beat === 0 || beat === 4) for (const n of chord) note(hz(n + 12), at, STEP * 1.6, 'triangle', 0.12);
  if (beat % 2 === 1) hat(at);
}

// look a little ahead and schedule the notes that fall in that window
function tick() {
  while (nextAt < ctx.currentTime + 0.2) {
    playStep(step++, nextAt);
    nextAt += STEP;
  }
}

function start() {
  if (timer || !ac()) return;
  step = 0;
  nextAt = ctx.currentTime + 0.05;
  timer = setInterval(tick, 50);
  tick();
}

function stop() {
  clearInterval(timer);
  timer = null;
}

// returns the new state
export function toggleMusic() {
  music.on = !music.on;
  storage(KEY, music.on);
  if (music.on) start();
  else stop();
  return music.on;
}

// a saved "on" needs a user gesture before the browser lets it play
if (globalThis.document && music.on)
  document.addEventListener('pointerdown', () => music.on && start(), { once: true, capture: true });
