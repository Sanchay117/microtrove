import { AbsoluteFill, Easing, interpolate, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { CLAMP, f, ramp } from "../anim";
import type { Box } from "../data";
import { C, mono, W } from "../theme";

/** A camera keyframe: at `t` seconds, zoom `scale` towards the point (`x`, `y`), as fractions of the footage. */
export interface Cam {
  t: number;
  scale: number;
  x: number;
  y: number;
}
type CamState = Omit<Cam, "t">;

// The app footage (1600×900 at 1.5×) sits 1:1 in a window under the header, above the captions.
export const WIN = { x: 160, y: 80, w: 1600, h: 900 };

/** Map a point in footage fractions to composition pixels for a camera state, for overlays that track the UI. */
export function project(cam: CamState, px: number, py: number): [number, number] {
  const ox = cam.x * WIN.w;
  const oy = cam.y * WIN.h;
  return [WIN.x + ox + (px * WIN.w - ox) * cam.scale, WIN.y + oy + (py * WIN.h - oy) * cam.scale];
}

export function camAt(cams: Cam[], frame: number): CamState {
  if (frame <= f(cams[0].t)) return cams[0];
  for (let i = 1; i < cams.length; i++) {
    const a = cams[i - 1];
    const b = cams[i];
    if (frame <= f(b.t)) {
      const u = interpolate(frame, [f(a.t), f(b.t)], [0, 1], { ...CLAMP, easing: Easing.inOut(Easing.cubic) });
      return { scale: a.scale + (b.scale - a.scale) * u, x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  return cams[cams.length - 1];
}

/**
 * The recorded app in a square-cornered window with the app's hard shadow. `startFrom` skips into the clip;
 * `delay` holds the window's entrance until that many seconds into the sequence.
 */
export const Footage: React.FC<{
  src: string;
  cams: Cam[];
  startFrom?: number;
  delay?: number;
  overlay?: (cam: CamState) => React.ReactNode;
}> = ({ src, cams, startFrom = 0, delay = 0, overlay }) => {
  const frame = useCurrentFrame();
  const cam = camAt(cams, frame);
  const enter = ramp(frame, delay, 0.5);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute",
          left: WIN.x,
          top: WIN.y,
          width: WIN.w,
          height: WIN.h,
          overflow: "hidden",
          outline: `2px solid ${C.ink}`,
          boxShadow: `10px 10px 0 ${C.ink}`,
          background: C.paper,
          opacity: enter,
          transform: `translateY(${(1 - enter) * 24}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile(src)}
          startFrom={f(startFrom)}
          muted
          style={{ width: "100%", height: "100%", transformOrigin: `${cam.x * 100}% ${cam.y * 100}%`, transform: `scale(${cam.scale})` }}
        />
      </div>
      {overlay?.(cam)}
    </AbsoluteFill>
  );
};

/**
 * A blue frame around a region of the footage (footage fractions) that follows the camera, with a label tag.
 * The tag sits below the frame, or above it near the window's bottom; `side="left"` puts it beside the frame instead.
 */
export const Spotlight: React.FC<{
  cam: CamState;
  box: Box;
  at: number;
  until: number;
  label?: string;
  color?: string;
  dim?: boolean;
  side?: "auto" | "left";
}> = ({ cam, box, at, until, label, color = C.blue, dim = true, side = "auto" }) => {
  const frame = useCurrentFrame();
  const inn = ramp(frame, at, 0.35);
  const out = interpolate(frame, [f(until) - 8, f(until)], [1, 0], CLAMP);
  if (inn <= 0 || out <= 0) return null;
  const pad = 0.006;
  let [x0, y0] = project(cam, box[0] - pad, box[1] - pad * 1.6);
  let [x1, y1] = project(cam, box[2] + pad, box[3] + pad * 1.6);
  // Keep the frame inside the window.
  [x0, y0, x1, y1] = [Math.max(x0, WIN.x + 4), Math.max(y0, WIN.y + 4), Math.min(x1, WIN.x + WIN.w - 4), Math.min(y1, WIN.y + WIN.h - 4)];
  const grow = (1 - inn) * 18;
  const below = y1 + 56 < WIN.y + WIN.h;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x0 - grow,
          top: y0 - grow,
          width: x1 - x0 + 2 * grow,
          height: y1 - y0 + 2 * grow,
          border: `4px solid ${color}`,
          boxShadow: dim ? `0 0 0 9999px rgba(241,241,236,${0.55 * inn * out})` : undefined,
          opacity: inn * out,
        }}
      />
      {label && (
        <div
          style={{
            position: "absolute",
            ...(side === "left" ? { right: W - x0 + 12, top: (y0 + y1) / 2 - 21 } : { left: x0, top: below ? y1 + 10 : y0 - 50 }),
            fontFamily: mono,
            fontSize: 24,
            fontWeight: 500,
            color: "#fff",
            background: color,
            padding: "6px 14px",
            opacity: inn * out,
            transform: `translateY(${(1 - inn) * 10}px)`,
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      )}
    </>
  );
};
