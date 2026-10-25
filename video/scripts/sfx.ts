// Sound design, synthesized from scratch (no samples, nothing to license):
//   public/sfx/*.wav     UI clicks, key presses, pops, a stamp, a chime, a pen stroke, transitions
//   public/music/bed.wav a 100 BPM track in F major: pad and pulse until the Microtrove reveal, then a
//                        light beat that stops for the end card, which rings out on the tonic.
// Deterministic: a seeded PRNG drives all noise. Reads src/generated/timing.json and words.json for the cues.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readTiming } from "./env.ts";

const SR = 48000;
const TAU = Math.PI * 2;

let seed = 0x5eed1e;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 0xffffffff) * 2 - 1;
};

function wav(path: string, left: Float32Array, right = left) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  const s = (x: number) => Math.round(Math.max(-1, Math.min(1, x)) * 32767);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(s(left[i]), 44 + i * 4);
    buf.writeInt16LE(s(right[i]), 46 + i * 4);
  }
  writeFileSync(new URL(`../public/${path}`, import.meta.url), buf);
  console.log(`${path}  ${(n / SR).toFixed(2)} s`);
}

const peakOf = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
function normalize(x: Float32Array, peak: number) {
  const m = peakOf(x);
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

/** Chamberlin state-variable filter with a time-varying cutoff. */
function svf(input: Float32Array, cutoff: (i: number) => number, q: number, mode: "bp" | "lp" | "hp") {
  const out = new Float32Array(input.length);
  let low = 0;
  let band = 0;
  for (let i = 0; i < input.length; i++) {
    const fc = 2 * Math.sin((Math.PI * Math.min(cutoff(i), SR / 6)) / SR);
    low += fc * band;
    const high = input[i] - low - q * band;
    band += fc * high;
    out[i] = mode === "bp" ? band : mode === "lp" ? low : high;
  }
  return out;
}

const make = (seconds: number, fn: (t: number) => number) => Float32Array.from({ length: Math.floor(SR * seconds) }, (_, i) => fn(i / SR));
const noise = (seconds: number) => Float32Array.from({ length: Math.floor(SR * seconds) }, () => rand());

// --- one-shots ---------------------------------------------------------------------------------

const key = () => normalize(svf(make(0.05, (t) => (0.5 * Math.sin(TAU * 3100 * t) * Math.exp(-t / 0.006) + rand() * Math.exp(-t / 0.0018)) * Math.min(1, t / 0.0003)), () => 2600, 0.9, "hp"), 0.7);

const click = () =>
  normalize(
    make(0.07, (t) => (0.8 * Math.sin(TAU * 1700 * t) * Math.exp(-t / 0.008) + 0.6 * rand() * Math.exp(-t / 0.003)) * Math.min(1, t / 0.0004)),
    0.8,
  );

function pop() {
  let ph = 0;
  return normalize(
    make(0.12, (t) => {
      ph += (TAU * (760 + 520 * Math.exp(-t / 0.012))) / SR;
      return Math.sin(ph) * Math.exp(-t / 0.035) * Math.min(1, t / 0.001);
    }),
    0.7,
  );
}

const tick = () => normalize(make(0.06, (t) => Math.sin(TAU * 1250 * t) * Math.exp(-t / 0.018) * Math.min(1, t / 0.0005)), 0.6);

function whoosh() {
  const n = Math.floor(SR * 0.7);
  const bp = svf(noise(0.7), (i) => 400 + 3200 * Math.sin((Math.PI * i) / n) ** 2, 0.6, "bp");
  for (let i = 0; i < n; i++) bp[i] *= Math.sin((Math.PI * i) / n) ** 2;
  return normalize(bp, 0.8);
}

function hit() {
  let ph = 0;
  const x = make(1.6, (t) => {
    ph += (TAU * (48 + 60 * Math.exp(-t / 0.05))) / SR;
    return Math.sin(ph) * Math.exp(-t / 0.4) * Math.min(1, t / 0.002) + 0.15 * rand() * Math.exp(-t / 0.06);
  });
  return normalize(svf(x, () => 1000, 0.8, "lp"), 0.9);
}

function stamp() {
  let ph = 0;
  const body = make(0.35, (t) => {
    ph += (TAU * (70 + 90 * Math.exp(-t / 0.02))) / SR;
    return Math.sin(ph) * Math.exp(-t / 0.09);
  });
  const slap = svf(noise(0.35), () => 1400, 0.7, "lp");
  for (let i = 0; i < slap.length; i++) slap[i] *= Math.exp(-i / SR / 0.025);
  return normalize(body.map((v, i) => v + 0.9 * slap[i]), 0.9);
}

/** Two rising notes, like a transaction confirming. */
function confirm() {
  const x = make(0.6, (t) => {
    const a = Math.sin(TAU * 1046.5 * t) * Math.exp(-t / 0.18);
    const t2 = t - 0.085;
    const b = t2 > 0 ? Math.sin(TAU * 1568 * t2) * Math.exp(-t2 / 0.25) : 0;
    return (a + b) * Math.min(1, t / 0.002);
  });
  return normalize(x, 0.6);
}

/** A soft rising swell. */
function swell() {
  let ph = 0;
  const n = SR * 0.7;
  return normalize(
    make(0.7, (t) => {
      ph += (TAU * (220 + 440 * (t / 0.7) ** 2)) / SR;
      const env = Math.sin((Math.PI * t) / 0.7) ** 2;
      return (Math.sin(ph) + 0.3 * Math.sin(2 * ph)) * env * (t * SR < n ? 1 : 0);
    }),
    0.5,
  );
}

/** A pen stroke: band-passed noise that wanders. */
function draw() {
  const n = Math.floor(SR * 1.0);
  const x = svf(noise(1.0), (i) => 2600 + 900 * Math.sin((TAU * i) / SR / 0.13), 1.2, "bp");
  for (let i = 0; i < n; i++) x[i] *= Math.min(1, i / (SR * 0.05)) * Math.min(1, (n - i) / (SR * 0.2)) * (0.6 + 0.4 * Math.sin((TAU * i) / SR / 0.09));
  return normalize(x, 0.5);
}

/** A quick signature scribble: three short strokes. */
function sign() {
  const n = Math.floor(SR * 0.8);
  const x = svf(noise(0.8), (i) => 3200 + 1500 * Math.sin((TAU * i) / SR / 0.07), 1.0, "bp");
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const stroke = [0, 0.25, 0.5].some((s) => t >= s && t < s + 0.2) ? Math.sin((Math.PI * ((t % 0.25) / 0.2)) % Math.PI) : 0;
    x[i] *= stroke;
  }
  return normalize(x, 0.5);
}

// --- music -------------------------------------------------------------------------------------

const BPM = 100;
const BEAT = 60 / BPM;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
// F major, I–V–vi–IV, two bars each: F, C, Dm, B♭.
const CHORDS = [
  [41, 57, 60, 64, 69],
  [36, 55, 60, 64, 67],
  [38, 57, 62, 65, 69],
  [34, 53, 58, 62, 65],
];
const CHORD_LEN = 8 * BEAT;

function reverb(x: Float32Array, ch: number) {
  const spread = ch * 23;
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d: d + spread, buf: new Float32Array(d + spread), i: 0 }));
  const alls = [225, 556].map((d) => ({ d: d + spread, buf: new Float32Array(d + spread), i: 0 }));
  const out = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let wet = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.buf[c.i] = x[n] + y * 0.82;
      c.i = (c.i + 1) % c.d;
      wet += y;
    }
    wet /= combs.length;
    for (const a of alls) {
      const y = a.buf[a.i];
      const v = wet + y * -0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.d;
      wet = y - v * -0.5;
    }
    out[n] = 0.7 * x[n] + 0.5 * wet;
  }
  return out;
}

function add(dst: Float32Array, src: Float32Array, at: number, gain: number) {
  const i0 = Math.floor(at * SR);
  for (let i = 0; i < src.length && i0 + i < dst.length; i++) if (i0 + i >= 0) dst[i0 + i] += src[i] * gain;
}

function kick() {
  let ph = 0;
  return make(0.35, (t) => {
    ph += (TAU * (50 + 100 * Math.exp(-t / 0.03))) / SR;
    return Math.sin(ph) * Math.exp(-t / 0.18) + 0.2 * rand() * Math.exp(-t / 0.003);
  });
}
function hat() {
  const h = svf(noise(0.05), () => 8000, 0.8, "hp");
  for (let i = 0; i < h.length; i++) h[i] *= Math.exp(-i / SR / 0.014);
  return h;
}
function clap() {
  const x = svf(noise(0.2), () => 1500, 0.8, "bp");
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] *= 1.6 * (Math.exp(-t / 0.06) + 0.6 * (t > 0.012 ? Math.exp(-(t - 0.012) / 0.05) : 0));
  }
  return x;
}
function pluck(freq: number, len = 0.32) {
  return make(len, (t) => {
    const p = TAU * freq * t;
    return (Math.sin(p) + 0.45 * Math.sin(2 * p) * Math.exp(-t / 0.06) + 0.2 * Math.sin(3 * p) * Math.exp(-t / 0.03)) * Math.exp(-t / 0.14) * Math.min(1, t / 0.003);
  });
}
function riser(seconds: number) {
  const n = Math.floor(SR * seconds);
  const bp = svf(noise(seconds), (i) => 300 + 5000 * (i / n) ** 2, 0.5, "bp");
  for (let i = 0; i < n; i++) bp[i] *= (i / n) ** 2;
  return bp;
}

function track(seconds: number, drop: number, stop: number) {
  const n = Math.floor(SR * seconds);
  const padL = new Float32Array(n);
  const padR = new Float32Array(n);
  const beat = new Float32Array(n);
  const bass = new Float32Array(n);
  const keys = new Float32Array(n);
  // Anchor the bar grid so a downbeat lands exactly on the drop.
  const origin = drop - Math.ceil(drop / CHORD_LEN) * CHORD_LEN;
  const chordAt = (t: number) => CHORDS[(((Math.floor((t - origin) / CHORD_LEN) % 4) + 4) % 4)];

  // Pad: every chord swells in and out across its two bars; from `stop`, F holds to the end.
  const windows: { t0: number; dur: number; chord: number[] }[] = [];
  for (let c = 0; origin + c * CHORD_LEN < stop; c++) {
    const t0 = origin + c * CHORD_LEN;
    windows.push({ t0, dur: Math.min(CHORD_LEN + 1.2, stop - t0 + 0.8), chord: chordAt(t0 + 0.01) });
  }
  windows.push({ t0: stop, dur: seconds - stop + 1, chord: CHORDS[0] });
  for (const { t0, dur, chord } of windows) {
    for (const [k, m] of chord.entries()) {
      for (const det of [-0.07, 0.07]) {
        const f0 = hz(m + det);
        const pan = (k / (chord.length - 1) - 0.5) * 0.8 + det * 2;
        const gl = Math.cos(((pan + 1) * Math.PI) / 4);
        const gr = Math.sin(((pan + 1) * Math.PI) / 4);
        const amp = k === 0 ? 0.45 : 0.22;
        const i0 = Math.max(0, Math.floor((t0 - 0.6) * SR));
        const i1 = Math.min(n, Math.floor((t0 + dur) * SR));
        const ph0 = Math.abs(rand()) * TAU;
        for (let i = i0; i < i1; i++) {
          const t = i / SR - (t0 - 0.6);
          const env = Math.min(1, t / 0.8) * Math.min(1, (dur + 0.6 - t) / 1.0);
          const p = TAU * f0 * t + ph0;
          const v = (Math.sin(p) + 0.3 * Math.sin(2 * p) + 0.12 * Math.sin(3 * p)) * env * amp;
          padL[i] += v * gl;
          padR[i] += v * gr;
        }
      }
    }
  }

  // Pulse: muted plucked eighths on the chord tones, quiet before the drop, brighter after.
  const k = kick();
  const h = hat();
  const cl = clap();
  const kicks: number[] = [];
  for (let i = 0; ; i++) {
    const t = origin + i * (BEAT / 2);
    if (t >= stop) break;
    if (t < 0) continue;
    const chord = chordAt(t + 1e-6);
    const step = i % 8;
    const tones = [chord[2] + 12, chord[3] + 12, chord[4] + 12, chord[3] + 12];
    const pre = t < drop;
    const build = pre ? Math.max(0, Math.min(1, (t - (drop - 6)) / 6)) : 1;
    add(keys, pluck(hz(tones[step % 4])), t, pre ? 0.05 + 0.1 * build : 0.16);
    if (!pre) {
      if (step % 2 === 0) {
        add(beat, k, t, 0.85);
        kicks.push(t);
      }
      if (step % 2 === 1) add(beat, h, t, 0.22);
      if (step === 2 || step === 6) add(beat, cl, t, 0.3);
      const root = hz(chord[0] + 12);
      add(
        bass,
        make(0.26, (tt) => (Math.sin(TAU * root * tt) + 0.35 * Math.sin(TAU * 2 * root * tt)) * Math.exp(-tt / 0.12) * Math.min(1, tt / 0.004)),
        t,
        0.32,
      );
    }
  }

  const impact = new Float32Array(n);
  add(impact, riser(2.4), drop - 2.4, 0.35);
  add(impact, hit(), drop, 0.8);
  add(impact, hit(), stop, 0.6);

  const keysL = reverb(svf(keys, () => 3800, 1.0, "lp"), 0);
  const keysR = reverb(svf(keys, () => 3800, 1.0, "lp"), 1);
  const lfo = (i: number) => 1500 + 600 * Math.sin((TAU * i) / SR / 19);
  const [pl, pr] = [reverb(svf(padL, lfo, 1.1, "lp"), 0), reverb(svf(padR, lfo, 1.1, "lp"), 1)];
  const bassLp = svf(bass, () => 600, 1.0, "lp");

  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let next = 0;
  let last = -10;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (next < kicks.length && kicks[next] <= t) last = kicks[next++];
    const duck = 1 - 0.5 * Math.exp(-(t - last) / 0.12);
    const fade = Math.min(1, t / 2) * Math.min(1, (seconds - t) / 2.5);
    L[i] = ((pl[i] * 0.7 + bassLp[i] + keysL[i]) * duck + beat[i] * 0.55 + impact[i] * 0.5) * fade;
    R[i] = ((pr[i] * 0.7 + bassLp[i] + keysR[i]) * duck + beat[i] * 0.55 + impact[i] * 0.5) * fade;
  }
  const peak = 0.9 / Math.max(peakOf(L), peakOf(R));
  for (let i = 0; i < n; i++) {
    L[i] *= peak;
    R[i] *= peak;
  }
  return [L, R] as const;
}

mkdirSync(new URL("../public/sfx", import.meta.url), { recursive: true });
mkdirSync(new URL("../public/music", import.meta.url), { recursive: true });
wav("sfx/key.wav", key());
wav("sfx/click.wav", click());
wav("sfx/pop.wav", pop());
wav("sfx/tick.wav", tick());
wav("sfx/whoosh.wav", whoosh());
wav("sfx/hit.wav", hit());
wav("sfx/stamp.wav", stamp());
wav("sfx/confirm.wav", confirm());
wav("sfx/swell.wav", swell());
wav("sfx/draw.wav", draw());
wav("sfx/sign.wav", sign());

// The drop lands on "Microtrove" in the reveal; the beat stops when the end card starts.
const timing = readTiming();
const words = JSON.parse(readFileSync(new URL("../src/generated/words.json", import.meta.url), "utf8")) as Record<string, { w: string; start: number }[]>;
const abs = (id: string) => timing.scenes.find((s) => s.id === id)!;
const rfc = abs("rfc");
const drop = rfc.start + rfc.lines[1].start + words["rfc-2"].find((x) => x.w.startsWith("Microtrove"))!.start;
const stop = abs("outro").start;
const [l, r] = track(timing.total, drop, stop);
wav("music/bed.wav", l, r);
console.log(`drop at ${drop.toFixed(2)} s, beat stops at ${stop.toFixed(2)} s`);
