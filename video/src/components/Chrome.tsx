import { AbsoluteFill, useCurrentFrame } from "remotion";
import { ramp } from "../anim";
import { C, mono } from "../theme";
import { BrandMark } from "./Brand";

/** The thin header every scene shares: the mark on the left, the section on the right. */
export const Chrome: React.FC<{ index: number; total: number; label?: string; dark?: boolean }> = ({ index, total, label, dark = false }) => {
  const frame = useCurrentFrame();
  const inn = ramp(frame, 0.05, 0.4);
  const fg = dark ? C.onDark : C.ink2;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: 160, top: 28, display: "flex", alignItems: "center", gap: 12, opacity: inn }}>
        <BrandMark size={20} dark={dark} />
        <span style={{ fontFamily: mono, fontSize: 20, color: dark ? C.paper : C.ink, letterSpacing: 0.5 }}>microtrove</span>
      </div>
      <div style={{ position: "absolute", right: 160, top: 30, fontFamily: mono, fontSize: 20, color: fg, letterSpacing: 1, opacity: inn }}>
        <span style={{ color: dark ? C.blueOnDark : C.blue }}>{String(index).padStart(2, "0")}</span>
        <span> / {String(total).padStart(2, "0")}  </span>
        {label && <span style={{ textTransform: "uppercase" }}>{label}</span>}
      </div>
    </AbsoluteFill>
  );
};

/** A mono kicker, as in the app: blue index, grey label. */
export const Kicker: React.FC<{ index: string; label: string; style?: React.CSSProperties; dark?: boolean }> = ({ index, label, style, dark }) => (
  <div style={{ fontFamily: mono, fontSize: 24, letterSpacing: 1.5, textTransform: "uppercase", color: dark ? C.onDark : C.ink2, ...style }}>
    <span style={{ color: dark ? C.blueOnDark : C.blue, marginRight: 16 }}>{index}</span>
    {label}
  </div>
);
