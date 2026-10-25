import { useCurrentFrame } from "remotion";
import { f, ramp } from "../anim";

/**
 * Kinetic headline: each word rises out of a mask at its own time (seconds into the sequence).
 * `words` pairs each word with its time; `accent` colours words by index.
 */
export const Words: React.FC<{
  words: [string, number][];
  size: number;
  color: string;
  accent?: Record<number, string>;
  weight?: number;
  style?: React.CSSProperties;
}> = ({ words, size, color, accent = {}, weight = 600, style }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", columnGap: size * 0.24, rowGap: size * 0.02, fontSize: size, fontWeight: weight, letterSpacing: -size * 0.04, lineHeight: 1.02, color, ...style }}>
      {words.map(([w, t], i) => {
        const u = ramp(frame, t, 0.45);
        return (
          <span key={i} style={{ display: "inline-block", overflow: "hidden", paddingBottom: size * 0.08, marginBottom: -size * 0.08 }}>
            <span style={{ display: "inline-block", transform: `translateY(${(1 - u) * 105}%)`, color: accent[i] ?? color, opacity: frame >= f(t) - 1 ? 1 : 0 }}>{w}</span>
          </span>
        );
      })}
    </div>
  );
};

/** A number that counts up from `from` to `to` between `start` and `start + dur` seconds. */
export const Count: React.FC<{ to: number; start: number; dur?: number; from?: number; format: (x: number) => string }> = ({ to, start, dur = 0.8, from = 0, format }) => {
  const frame = useCurrentFrame();
  const u = ramp(frame, start, dur);
  return <>{format(from + (to - from) * u)}</>;
};
