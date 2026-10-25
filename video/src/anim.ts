import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./theme";

export const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const f = (seconds: number) => Math.round(seconds * FPS);

/** 0 → 1 over `dur` seconds starting at `start` seconds. */
export const ramp = (frame: number, start: number, dur = 0.4, easing = Easing.out(Easing.cubic)) =>
  interpolate(frame, [f(start), f(start) + Math.max(1, f(dur))], [0, 1], { ...CLAMP, easing });

/** A crisp, slightly overshooting spring that starts at `start` seconds. */
export const pop = (frame: number, start: number, damping = 14) => spring({ frame: frame - f(start), fps: FPS, config: { damping, mass: 0.6 } });

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** The first `n` characters of `text`, typed at `cps` characters a second from `start`. */
export const typed = (frame: number, start: number, text: string, cps = 40) =>
  text.slice(0, Math.max(0, Math.floor(((frame - f(start)) / FPS) * cps)));

export const fmt = (x: number, digits = 0) => x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
