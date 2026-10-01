/**
 * Original audio for the Sound Garden demo, synthesized from code (no samples, no third-party
 * material). GPL-3.0 like the rest of the repo.
 *
 * Every sound is deterministic (seeded noise), so re-running the build produces the same audio.
 * Output is mono 44.1 kHz Float32; tools/build-assets.js encodes it to .ogg (and .m4a for MV).
 */
"use strict";

const SR = 44100;
const TAU = Math.PI * 2;

// ------------------------------------------------------------------ helpers
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** A buffer of `seconds` plus a `tail` that is folded back onto the start (see loopFold*). */
function canvas(seconds, tail) {
  const n = Math.round(seconds * SR);
  const t = Math.round((tail || 0) * SR);
  return { n, t, buf: new Float32Array(n + t) };
}
function add(c, start, data, gain) {
  const s = Math.round(start * SR);
  for (let i = 0; i < data.length && s + i < c.buf.length; i++) c.buf[s + i] += data[i] * gain;
}
/** Musical loops: notes ringing past the loop point continue at the start (seamless, no fade). */
function loopWrap(c) {
  const out = c.buf.slice(0, c.n);
  for (let i = 0; i < c.t; i++) out[i % c.n] += c.buf[c.n + i];
  return out;
}
/** Noise beds: crossfade the overrun into the start so filter state is continuous at the seam. */
function loopCrossfade(c) {
  const out = c.buf.slice(0, c.n);
  for (let i = 0; i < c.t; i++) {
    const k = i / c.t;
    out[i] = c.buf[i] * k + c.buf[c.n + i] * (1 - k);
  }
  return out;
}
function normalize(data, peak) {
  let m = 0;
  for (const v of data) m = Math.max(m, Math.abs(v));
  if (m > 0) for (let i = 0; i < data.length; i++) data[i] *= peak / m;
  return data;
}
function env(n, a, d, s, r, holdSec) {
  // ADSR in seconds; holdSec = how long the key is held (the release starts from wherever the
  // attack/decay had got to, so very short notes still end smoothly)
  const out = new Float32Array(n);
  const A = Math.max(1, a * SR), D = Math.max(1, d * SR), H = holdSec * SR, R = Math.max(1, r * SR);
  let level = 0;
  for (let i = 0; i < n; i++) {
    if (i < H) {
      if (i < A) level = i / A;
      else if (i < A + D) level = 1 - (1 - s) * ((i - A) / D);
      else level = s;
      out[i] = level;
    } else {
      out[i] = level * Math.max(0, 1 - (i - H) / R);
    }
  }
  return out;
}
function onePoleLP(data, cutoff) {
  const a = Math.exp((-TAU * cutoff) / SR);
  let y = 0;
  for (let i = 0; i < data.length; i++) data[i] = y = (1 - a) * data[i] + a * y;
  return data;
}
function biquad(data, kind, freq, q) {
  const w = (TAU * freq) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (kind === "bp") [b0, b1, b2] = [al, 0, -al];
  else if (kind === "hp") [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
  else [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
  const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    data[i] = y;
  }
  return data;
}
function noise(n, rnd) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rnd() * 2 - 1;
  return out;
}

// ------------------------------------------------------------- instruments
function kick(rnd) {
  const n = Math.round(0.35 * SR), out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (45 + 110 * Math.exp(-t * 28))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 9) + (i < 90 ? (rnd() - 0.5) * 0.3 : 0);
  }
  return out;
}
function snare(rnd) {
  const n = Math.round(0.25 * SR);
  const nz = biquad(noise(n, rnd), "bp", 2200, 0.7);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    nz[i] = nz[i] * 1.4 * Math.exp(-t * 18) + Math.sin(TAU * 190 * t) * 0.5 * Math.exp(-t * 30);
  }
  return nz;
}
function hat(rnd, open) {
  const n = Math.round((open ? 0.22 : 0.06) * SR);
  const nz = biquad(noise(n, rnd), "hp", 7000, 0.7);
  for (let i = 0; i < n; i++) nz[i] *= Math.exp(-(i / SR) * (open ? 14 : 60));
  return nz;
}
function pluckBass(f, dur) {
  const n = Math.round((dur + 0.2) * SR), out = new Float32Array(n);
  const e = env(n, 0.005, 0.25, 0.6, 0.12, dur);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += f / SR;
    const saw = 2 * (ph - Math.floor(ph + 0.5));
    out[i] = (saw * 0.5 + Math.sin(TAU * ph)) * e[i];
  }
  return onePoleLP(out, 700);
}
function pad(freqs, dur, rnd) {
  const n = Math.round((dur + 1.2) * SR), out = new Float32Array(n);
  const e = env(n, 0.6, 0.4, 0.8, 1.1, dur);
  for (const f0 of freqs) {
    for (const det of [-0.004, 0.004]) {
      const f = f0 * (1 + det), p0 = rnd() * TAU;
      for (let h = 1; h <= 5; h++) {
        const amp = 1 / Math.pow(h, 1.6);
        const w = (TAU * f * h) / SR;
        for (let i = 0; i < n; i++) out[i] += Math.sin(w * i + p0 * h) * amp;
      }
    }
  }
  for (let i = 0; i < n; i++) out[i] *= e[i] * (1 + 0.12 * Math.sin((TAU * 0.25 * i) / SR));
  return out;
}
function mallet(f, dur) {
  const n = Math.round(Math.max(dur, 0.6) * SR + 0.6 * SR), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] =
      Math.sin(TAU * f * t) * Math.exp(-t * 3.2) +
      0.35 * Math.sin(TAU * f * 3.95 * t) * Math.exp(-t * 14) +
      0.12 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 6);
    if (i < 200) out[i] *= i / 200;
  }
  return out;
}
function bell(f, len) {
  const n = Math.round(len * SR), out = new Float32Array(n);
  const partials = [[1, 1, 1.6], [2.76, 0.5, 3], [5.4, 0.25, 5], [8.93, 0.12, 8]];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [m, a, d] of partials) v += a * Math.sin(TAU * f * m * t) * Math.exp(-t * d);
    out[i] = v * (i < 60 ? i / 60 : 1);
  }
  return out;
}
function brass(f, dur) {
  const n = Math.round((dur + 0.3) * SR), out = new Float32Array(n);
  const e = env(n, 0.03, 0.15, 0.75, 0.25, dur);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    ph += (f * (1 + 0.004 * Math.sin((TAU * 5.5 * i) / SR))) / SR;
    out[i] = 2 * (ph - Math.floor(ph + 0.5)) * e[i];
  }
  return onePoleLP(onePoleLP(out, 2400), 3200);
}

// ------------------------------------------------------- the garden band
// 100 BPM, 8 bars of 4/4 = 19.2 s. All four stems are exactly the same length so they stay in
// sync forever when started together with syncplay-bgm.
const BPM = 100, BEAT = 60 / BPM, BARS = 8, LOOP = BARS * 4 * BEAT;
const CHORDS = [
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 48, notes: [55, 60, 64] }, // C
  { root: 43, notes: [55, 59, 62] }, // G
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 48, notes: [55, 60, 64] }, // C
  { root: 40, notes: [56, 59, 64] }, // E
];
const MELODY = [
  [0, 76, 1], [1, 72, 0.5], [1.5, 74, 0.5], [2, 76, 1], [3, 69, 1],
  [4, 72, 1.5], [5.5, 69, 0.5], [6, 72, 1], [7, 74, 1],
  [8, 76, 1], [9, 79, 1], [10, 76, 0.5], [10.5, 74, 0.5], [11, 72, 1],
  [12, 74, 2], [14, 71, 1], [15, 67, 1],
  [16, 76, 1], [17, 72, 0.5], [17.5, 74, 0.5], [18, 76, 1], [19, 81, 1],
  [20, 79, 1.5], [21.5, 77, 0.5], [22, 76, 1], [23, 72, 1],
  [24, 74, 1], [25, 76, 1], [26, 72, 1], [27, 67, 1],
  [28, 68, 1], [29, 71, 1], [30, 69, 2],
];

function gardenDrums() {
  const rnd = mulberry32(11), c = canvas(LOOP, 1);
  const K = kick(rnd), S = snare(rnd);
  for (let bar = 0; bar < BARS; bar++) {
    const b = bar * 4 * BEAT;
    add(c, b, K, 1); add(c, b + 2 * BEAT, K, 0.9); add(c, b + 2.5 * BEAT, K, 0.6);
    add(c, b + BEAT, S, 0.8); add(c, b + 3 * BEAT, S, 0.8);
    if (bar % 4 === 3) add(c, b + 3.75 * BEAT, S, 0.35);
    for (let e = 0; e < 8; e++) {
      const swing = e % 2 ? 0.08 * BEAT : 0;
      add(c, b + e * 0.5 * BEAT + swing, hat(rnd, e === 7), e % 2 ? 0.22 : 0.32);
    }
  }
  return normalize(loopWrap(c), 0.85);
}
function gardenBass() {
  const c = canvas(LOOP, 1);
  CHORDS.forEach((ch, bar) => {
    const b = bar * 4 * BEAT, r = midi(ch.root);
    add(c, b, pluckBass(r, 1.2 * BEAT), 1);
    add(c, b + 1.5 * BEAT, pluckBass(r, 0.4 * BEAT), 0.7);
    add(c, b + 2 * BEAT, pluckBass(r * 1.5, 0.9 * BEAT), 0.85);
    add(c, b + 3 * BEAT, pluckBass(r * 2, 0.4 * BEAT), 0.7);
    add(c, b + 3.5 * BEAT, pluckBass(r * 1.5, 0.4 * BEAT), 0.6);
  });
  return normalize(loopWrap(c), 0.8);
}
function gardenPads() {
  const rnd = mulberry32(23), c = canvas(LOOP, 2);
  CHORDS.forEach((ch, bar) => add(c, bar * 4 * BEAT, pad(ch.notes.map(midi), 4 * BEAT - 0.3, rnd), 1));
  return normalize(loopWrap(c), 0.7);
}
function gardenLead() {
  const c = canvas(LOOP, 2);
  for (const [beat, m, d] of MELODY) add(c, beat * BEAT, mallet(midi(m), d * BEAT), 1);
  // a soft echo, one dotted eighth later
  const echo = c.buf.slice();
  add(c, 0.75 * BEAT, echo, 0.25);
  return normalize(loopWrap(c), 0.8);
}

/** A cheerful little jingle for the radio prop (C major, 120 BPM, 4 bars = 8 s). */
function radioTune() {
  const beat = 0.5, bars = 4, c = canvas(bars * 4 * beat, 1.5);
  const roots = [48, 53, 55, 48];
  const tune = [
    [0, 72, 0.5], [0.5, 76, 0.5], [1, 79, 1], [2, 76, 0.5], [2.5, 79, 0.5], [3, 84, 1],
    [4, 81, 0.5], [4.5, 77, 0.5], [5, 81, 1], [6, 84, 1], [7, 81, 1],
    [8, 79, 0.5], [8.5, 83, 0.5], [9, 86, 1], [10, 83, 1], [11, 79, 1],
    [12, 84, 1], [13, 79, 1], [14, 76, 1], [15, 72, 1],
  ];
  roots.forEach((r, bar) => {
    for (let q = 0; q < 4; q++) {
      const f = midi(q % 2 ? r + 19 : r + 12);
      add(c, (bar * 4 + q) * beat, pluckBass(f, 0.3 * beat), q % 2 ? 0.35 : 0.6);
    }
  });
  for (const [b, m, d] of tune) add(c, b * beat, mallet(midi(m), d * beat), 0.9);
  return normalize(loopWrap(c), 0.85);
}

// ------------------------------------------------------------- ambiences
function birds() {
  const rnd = mulberry32(31), c = canvas(16, 1);
  const wind = onePoleLP(noise(c.buf.length, rnd), 400);
  for (let i = 0; i < wind.length; i++) c.buf[i] += wind[i] * 0.6 * (0.6 + 0.4 * Math.sin((TAU * i) / (8 * SR)));
  for (let k = 0; k < 26; k++) {
    const start = rnd() * 15, f0 = 2600 + rnd() * 1800, notes = 2 + Math.floor(rnd() * 4);
    for (let j = 0; j < notes; j++) {
      const n = Math.round(0.07 * SR), out = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        ph += (TAU * f0 * (1 + 0.35 * Math.sin(Math.PI * t) - 0.15 * t)) / SR;
        out[i] = Math.sin(ph) * Math.sin(Math.PI * t);
      }
      add(c, start + j * 0.11, out, 0.25 + rnd() * 0.15);
    }
  }
  return normalize(loopCrossfade(c), 0.7);
}
function campfire() {
  const rnd = mulberry32(41), c = canvas(10, 1);
  const rumble = onePoleLP(onePoleLP(noise(c.buf.length, rnd), 300), 300);
  for (let i = 0; i < rumble.length; i++) c.buf[i] += rumble[i] * 3;
  for (let k = 0; k < 260; k++) {
    const n = Math.round((0.004 + rnd() * 0.02) * SR);
    const pop = biquad(noise(n, rnd), "bp", 1500 + rnd() * 3500, 1.2);
    for (let i = 0; i < n; i++) pop[i] *= Math.exp(-(i / n) * 5);
    add(c, rnd() * 10, pop, 0.5 + rnd() * 1.5);
  }
  return normalize(loopCrossfade(c), 0.8);
}
function buzz() {
  // 4 s, 220 Hz with a 5 Hz wobble: whole numbers of cycles, so the loop is seamless.
  const n = 4 * SR, out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (220 + 6 * Math.sin(TAU * 5 * t)) / SR;
    const saw = 2 * (ph - Math.floor(ph + 0.5));
    out[i] = saw * (0.75 + 0.25 * Math.sin(TAU * 25 * t));
  }
  return normalize(biquad(biquad(out, "bp", 900, 0.8), "lp", 3000, 0.7), 0.7);
}
function rain() {
  const rnd = mulberry32(53), c = canvas(10, 1);
  const hiss = biquad(noise(c.buf.length, rnd), "lp", 5000, 0.5);
  for (let i = 0; i < hiss.length; i++) c.buf[i] += hiss[i] * 0.5;
  for (let k = 0; k < 900; k++) {
    const n = Math.round(0.01 * SR), f = 2000 + rnd() * 5000, d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = Math.sin((TAU * f * i) / SR) * Math.exp(-(i / n) * 6);
    add(c, rnd() * 10.9, d, 0.05 + rnd() * 0.15);
  }
  return normalize(loopCrossfade(c), 0.75);
}
function windChimes() {
  const rnd = mulberry32(61), c = canvas(12, 2);
  const wind = biquad(noise(c.buf.length, rnd), "bp", 600, 0.6);
  for (let i = 0; i < wind.length; i++) c.buf[i] += wind[i] * (0.5 + 0.5 * Math.sin((TAU * i) / (6 * SR)) ** 2);
  const scale = [84, 86, 88, 91, 93, 96];
  for (let k = 0; k < 22; k++) add(c, rnd() * 12, bell(midi(scale[Math.floor(rnd() * scale.length)]), 2.5), 0.12 + rnd() * 0.1);
  return normalize(loopCrossfade(c), 0.7);
}
function caveDrips() {
  const rnd = mulberry32(71), c = canvas(10, 2);
  const air = onePoleLP(onePoleLP(noise(c.buf.length, rnd), 120), 120);
  for (let i = 0; i < air.length; i++) c.buf[i] += air[i] * 4;
  for (let k = 0; k < 14; k++) {
    const n = Math.round(0.25 * SR), f = 900 + rnd() * 900, d = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (TAU * f * (1 + 1.2 * Math.exp(-t * 40))) / SR;
      d[i] = Math.sin(ph) * Math.exp(-t * 18);
    }
    const at = rnd() * 9.5;
    for (let e = 0; e < 4; e++) add(c, at + e * 0.19, d, 0.5 * Math.pow(0.45, e));
  }
  return normalize(loopCrossfade(c), 0.75);
}

// ------------------------------------------------------------- one-shots
function step(seed, center) {
  const rnd = mulberry32(seed), n = Math.round(0.14 * SR);
  const d = biquad(noise(n, rnd), "bp", center, 0.9);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    d[i] *= (t < 0.05 ? t / 0.05 : 1) * Math.exp(-t * 6) * (0.7 + 0.3 * rnd());
  }
  return normalize(d, 0.8);
}
function chime() {
  const c = canvas(1.6, 0);
  [79, 84, 88].forEach((m, i) => add(c, i * 0.09, bell(midi(m), 1.3), 0.5));
  return normalize(c.buf, 0.85);
}
function fanfare() {
  const c = canvas(4.2, 0);
  const notes = [[0, 60, 0.15], [0.17, 64, 0.15], [0.34, 67, 0.15], [0.51, 72, 0.6], [1.2, 70, 0.2], [1.45, 72, 1.4]];
  for (const [t, m, d] of notes) {
    add(c, t, brass(midi(m), d), 0.6);
    add(c, t, brass(midi(m - 12), d), 0.35);
  }
  add(c, 1.45, pad([60, 64, 67].map(midi), 1.2, mulberry32(5)), 0.08);
  return normalize(c.buf, 0.85);
}

/** Every file the demo uses: [folder, name, render()]. */
const SOUNDS = [
  ["bgm", "GardenDrums", gardenDrums],
  ["bgm", "GardenBass", gardenBass],
  ["bgm", "GardenPads", gardenPads],
  ["bgm", "GardenLead", gardenLead],
  ["bgm", "GardenRadio", radioTune],
  ["bgs", "GardenBirds", birds],
  ["bgs", "GardenCampfire", campfire],
  ["bgs", "GardenBee", buzz],
  ["bgs", "GardenRain", rain],
  ["bgs", "GardenChimes", windChimes],
  ["bgs", "GardenCave", caveDrips],
  ["se", "GardenStep1", () => step(81, 900)],
  ["se", "GardenStep2", () => step(82, 1300)],
  ["se", "GardenStep3", () => step(83, 1700)],
  ["se", "GardenChime", chime],
  ["me", "GardenFanfare", fanfare],
];

module.exports = { SR, SOUNDS, LOOP_SECONDS: LOOP };
