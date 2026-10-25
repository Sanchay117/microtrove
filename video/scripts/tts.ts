// Narration audio from Deepgram Aura-2: one WAV per line, plus a timing manifest that the composition and
// the footage capture both read. Writes public/audio/<scene>-<n>.wav and src/generated/timing.json.
// Lines whose spoken text is unchanged are reused.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { SCRIPT, VOICE } from "../src/narration.ts";
import { deepgramKey } from "./env.ts";

const FPS = 30;
const GAP = 0.3; // seconds between lines

/** Duration of a PCM WAV from its fmt and data chunks. */
function wavSeconds(buf: Buffer): number {
  let off = 12;
  let byteRate = 0;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(off + 16);
    if (id === "data") {
      // Streamed WAVs can carry a placeholder size; fall back to the rest of the file.
      if (size === 0 || size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8;
      return size / byteRate;
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk");
}

/**
 * Trims the silence Aura leaves before and after speech, keeping a short lead-in and release, and rewrites
 * the header with the real data size. Idempotent, so cached files pass through unchanged.
 */
function trimSilence(buf: Buffer): Buffer {
  let off = 12;
  let fmt: { channels: number; rate: number; bits: number } | undefined;
  let data: Buffer | undefined;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") {
      if (size === 0 || size === 0xffffffff || off + 8 + size > buf.length) size = buf.length - off - 8;
      data = buf.subarray(off + 8, off + 8 + size);
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data || fmt.bits !== 16) throw new Error("expected 16-bit PCM");
  const frame = fmt.channels * 2;
  const n = Math.floor(data.length / frame);
  const loud = (i: number) => Math.abs(data.readInt16LE(i * frame)) > 0.006 * 32768;
  let first = 0;
  while (first < n && !loud(first)) first++;
  let last = n - 1;
  while (last > first && !loud(last)) last--;
  const a = Math.max(0, first - Math.round(0.04 * fmt.rate));
  const b = Math.min(n, last + Math.round(0.12 * fmt.rate));
  const pcm = data.subarray(a * frame, b * frame);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(fmt.channels, 22);
  head.writeUInt32LE(fmt.rate, 24);
  head.writeUInt32LE(fmt.rate * frame, 28);
  head.writeUInt16LE(frame, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

async function speak(key: string, text: string): Promise<Buffer> {
  const url = `https://api.deepgram.com/v1/speak?model=${VOICE}&encoding=linear16&sample_rate=48000&container=wav`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if (attempt >= 3) throw new Error(`Deepgram ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await new Promise((res) => setTimeout(res, 1500 * attempt));
  }
}

const key = deepgramKey();
const audioDir = new URL("../public/audio/", import.meta.url);
const genDir = new URL("../src/generated/", import.meta.url);
mkdirSync(audioDir, { recursive: true });
mkdirSync(genDir, { recursive: true });
const cachePath = new URL("tts-cache.json", genDir);
const cache: Record<string, string> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};

const scenes = [];
let start = 0;
for (const scene of SCRIPT) {
  let t = scene.lead ?? 0.4;
  const lines = [];
  for (const [i, line] of scene.lines.entries()) {
    const file = `${scene.id}-${i + 1}.wav`;
    const say = line.say ?? line.text;
    const hash = createHash("sha256").update(`${VOICE}|${say}`).digest("hex").slice(0, 16);
    const path = new URL(file, audioDir);
    let buf: Buffer;
    if (cache[file] === hash && existsSync(path)) buf = readFileSync(path);
    else {
      buf = await speak(key, say);
      cache[file] = hash;
      console.log(`spoke ${file}`);
    }
    const trimmed = trimSilence(buf);
    if (!trimmed.equals(buf)) writeFileSync(path, trimmed);
    buf = trimmed;
    const seconds = wavSeconds(buf);
    lines.push({ file: `audio/${file}`, text: line.text, start: t, seconds });
    t += seconds + GAP;
  }
  const frames = Math.ceil((t - GAP + (scene.tail ?? 0.8)) * FPS);
  scenes.push({ id: scene.id, start, seconds: frames / FPS, frames, lines });
  start += frames / FPS;
}

writeFileSync(cachePath, JSON.stringify(cache, null, 2));
writeFileSync(new URL("timing.json", genDir), JSON.stringify({ fps: FPS, total: start, scenes }, null, 2));
for (const s of scenes) console.log(`${s.id.padEnd(9)} ${s.seconds.toFixed(1).padStart(5)}s  ${s.lines.map((l) => l.seconds.toFixed(1)).join(" + ")}`);
console.log(`total ${start.toFixed(1)}s`);
