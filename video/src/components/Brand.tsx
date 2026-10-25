import { C, sans } from "../theme";

/**
 * The app's mark: a blue square (an MUSD trove) holding a small square (a micro trove).
 * `inner` scales the small square in, 0 to 1.
 */
export const BrandMark: React.FC<{ size: number; inner?: number; dark?: boolean }> = ({ size, inner = 1, dark = false }) => {
  const s = (size * 5) / 18;
  const o = (size * 4) / 18;
  return (
    <div style={{ width: size, height: size, background: dark ? C.blueOnDark : C.blue, position: "relative", flex: "none" }}>
      <div
        style={{
          position: "absolute",
          left: o,
          top: o,
          width: s,
          height: s,
          background: dark ? C.ink : C.paper,
          transform: `scale(${inner})`,
          transformOrigin: "50% 50%",
        }}
      />
    </div>
  );
};

export const Wordmark: React.FC<{ size: number; color?: string; text?: string }> = ({ size, color = C.ink, text = "microtrove" }) => (
  <span style={{ fontFamily: sans, fontSize: size, fontWeight: 600, letterSpacing: -size * 0.045, color, lineHeight: 1 }}>{text}</span>
);
