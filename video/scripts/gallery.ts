// Renders caption-free stills of key moments for submission galleries: out/gallery/<n>-<scene>.png.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { readTiming } from "./env.ts";

// Scene and seconds into it; each picked where the scene's graphic is complete.
const SHOTS: [string, number][] = [
  ["borrow", 9.0],
  ["keepers", 16.0],
  ["proof", 9.6],
  ["promote", 5.2],
];

const timing = readTiming();
const start: Record<string, number> = {};
let at = 0;
for (const s of timing.scenes) {
  start[s.id] = at;
  at += s.frames;
}

mkdirSync("out/gallery", { recursive: true });
SHOTS.forEach(([scene, t], i) => {
  const frame = start[scene] + Math.round(t * timing.fps);
  const out = `out/gallery/${i + 2}-${scene}.png`;
  execFileSync("npx", ["remotion", "still", "src/index.ts", "Microtrove", out, `--frame=${frame}`, `--props={"captions":false}`], { stdio: "inherit" });
});
