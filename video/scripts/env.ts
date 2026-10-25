// Reads DEEPGRAM_API_KEY from video/.env (git-ignored). The key is never printed.

import { readFileSync } from "node:fs";

export function deepgramKey(): string {
  const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const key = env.match(/^\s*DEEPGRAM_API_KEY\s*=\s*"?([^"\n\r]+)"?/m)?.[1]?.trim();
  if (!key) throw new Error("DEEPGRAM_API_KEY missing from video/.env");
  return key;
}

export interface Timing {
  fps: number;
  total: number;
  scenes: { id: string; start: number; seconds: number; frames: number; lines: { file: string; text: string; start: number; seconds: number }[] }[];
}

export const readTiming = (): Timing => JSON.parse(readFileSync(new URL("../src/generated/timing.json", import.meta.url), "utf8"));
