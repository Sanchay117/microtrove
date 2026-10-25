import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, f } from "../anim";
import type { TimedScene } from "../data";
import { C, sans } from "../theme";

/** Sentence captions under the picture, synced to the line being spoken. Lines in `skip` are already on screen. */
export const Captions: React.FC<{ scene: TimedScene; skip?: Set<string> }> = ({ scene, skip }) => {
  const frame = useCurrentFrame();
  const line = scene.lines.find((l) => frame >= f(l.start) - 3 && frame < f(l.start + l.seconds) + 6);
  if (!line || skip?.has(line.file)) return null;
  const a = f(line.start) - 3;
  const b = f(line.start + line.seconds) + 6;
  const opacity = interpolate(frame, [a, a + 5, b - 5, b], [0, 1, 1, 0], CLAMP);
  const y = interpolate(frame, [a, a + 6], [8, 0], CLAMP);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 26, pointerEvents: "none" }}>
      <div
        style={{
          opacity,
          transform: `translateY(${y}px)`,
          maxWidth: 1500,
          textAlign: "center",
          fontFamily: sans,
          fontSize: 30,
          fontWeight: 500,
          lineHeight: 1.35,
          color: C.paper,
          padding: "8px 20px",
          background: "rgba(14,14,14,0.86)",
          textWrap: "balance",
        }}
      >
        {line.text}
      </div>
    </AbsoluteFill>
  );
};
