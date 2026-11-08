import borrowClip from "../public/clips/borrow.json";
import lendClip from "../public/clips/lend.json";
import passportClip from "../public/clips/passport.json";
import promoteClip from "../public/clips/promote.json";
import timingJson from "./generated/timing.json";
import wordsJson from "./generated/words.json";

export interface TimedLine {
  file: string;
  text: string;
  start: number;
  seconds: number;
}

export interface TimedScene {
  id: string;
  start: number;
  seconds: number;
  frames: number;
  lines: TimedLine[];
}

export const timing = timingJson as { fps: number; total: number; scenes: TimedScene[] };
export const sceneById = (id: string) => timing.scenes.find((s) => s.id === id)!;

const words = wordsJson as Record<string, { w: string; start: number; end: number }[]>;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9%$]/g, "");

/** Scene-relative seconds at which `word` (its `nth` occurrence, prefix match) is spoken in line `line` (0-based). */
export function wordAt(sceneId: string, line: number, word: string, nth = 0): number {
  const scene = sceneById(sceneId);
  const list = words[`${sceneId}-${line + 1}`] ?? [];
  const hit = list.filter((x) => norm(x.w).startsWith(norm(word)))[nth];
  if (!hit) throw new Error(`"${word}" not found in ${sceneId}-${line + 1}`);
  return scene.lines[line].start + hit.start;
}

/**
 * Pairs the words of an on-screen headline with the times they are spoken in line `line`. The headline must
 * have the same number of words as the transcript; otherwise the words are spread evenly over the line.
 */
export function spoken(sceneId: string, line: number, headline: string): [string, number][] {
  const display = headline.split(" ");
  const heard = words[`${sceneId}-${line + 1}`] ?? [];
  const l = sceneById(sceneId).lines[line];
  return display.map((w, i) => [w, l.start + (heard.length === display.length ? heard[i].start : (i / display.length) * l.seconds)]);
}

/** Scene-relative seconds at which line `line` starts and ends. */
export const lineAt = (sceneId: string, line: number) => {
  const l = sceneById(sceneId).lines[line];
  return { start: l.start, end: l.start + l.seconds };
};

export type Box = [number, number, number, number];
export interface Clip {
  frames: number;
  cues: { t: number; kind: "click" | "key" | "cut" }[];
  boxes: Record<string, { t: number; box: Box }>;
  tx?: string;
}

// The JSON's boxes are plain number arrays; capture.ts always writes four values.
export const clips = {
  borrow: borrowClip as unknown as Clip,
  lend: lendClip as unknown as Clip,
  promote: promoteClip as unknown as Clip,
  passport: passportClip as unknown as Clip,
};

/**
 * Facts shown on screen, all from Mezo Testnet (deployments/mezo-testnet.json and the keeper's log). The
 * keeper's liquidation and the claim ran on the Wave 1 contracts; everything else is the Wave 2 deployment.
 */
export const FACTS = {
  loans: "0xE0e2155f9C5a5B55eADf952d0a01d3E691092dcf",
  vault: "0x11fc55CD01411bd1453EE62b40cB4e653f7726eA",
  timelock: "0xD3B072154FE07F302Ec173C7D9d0cAB6089d764a",
  handoverTx: "0x21d507e6be67e8f9d3c7cfb8d97414209f43794e47e213345655691bd1224c93",
  promotionTx: "0x9f1a1aae9d3d0106e48dddae8ef4bf22c4e48cebad975a48c9f05dae139b9642",
  liquidationTx: "0xfe7a0c608465370d633178d33ef1d7696ad057026eb36172b0f28c32a48dcd51",
  claimTx: "0xc3a17a4a897a2284c6d53a65e6dcb524019358363927c54a8b6d67db5d4e568a",
};

/** Links for the end card. */
export const LINKS: { label: string; value: string }[] = [
  { label: "App", value: "microtrove.vercel.app" },
  { label: "Code", value: "github.com/Sanchay117/microtrove" },
];

export const short = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`;
