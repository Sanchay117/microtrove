import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fmt, ramp } from "../anim";
import { Kicker } from "../components/Chrome";
import { Sfx } from "../components/Sfx";
import { Count, Words } from "../components/Type";
import { spoken, wordAt } from "../data";
import { C, mono, sans } from "../theme";

const S = "open";
// The bar's scale: $0 to $2,400 across the content width.
const X0 = 160;
const SPAN = 1600;
const MAX = 2400;
const px = (usd: number) => X0 + (usd / MAX) * SPAN;
const BAR_Y = 600;
const BAR_H = 64;

/** The gap: a trove needs 1,800 MUSD of debt plus 200 of gas deposit, so about $2,200 of BTC at 110%. */
export const Open: React.FC = () => {
  const frame = useCurrentFrame();
  const tDebt = wordAt(S, 1, "1,800");
  const tGas = wordAt(S, 1, "MUSD");
  const tLock = wordAt(S, 1, "locking");
  const tBig = wordAt(S, 1, "$2,200");

  const grid = ramp(frame, 0, 1.0);
  const debt = ramp(frame, tDebt - 0.1, 0.7);
  const gas = ramp(frame, tGas, 0.45);
  const coll = ramp(frame, tLock - 0.1, 0.8);
  const big = ramp(frame, tBig - 0.15, 0.5);
  const axis = ramp(frame, tDebt - 0.6, 0.6);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      {/* Twelve-column grid, drawn in from the top. */}
      {Array.from({ length: 13 }, (_, i) => (
        <div
          key={i}
          style={{ position: "absolute", left: X0 + (i * SPAN) / 12, top: 0, width: 1, height: 1080 * grid, background: C.ruleSoft, opacity: 0.8 }}
        />
      ))}

      <Kicker index="01" label="The gap" style={{ position: "absolute", left: X0, top: 140, opacity: ramp(frame, 0.3, 0.4) }} />
      <Words
        words={spoken(S, 0, "Mezo’s MUSD lets you borrow against bitcoin.")}
        size={118}
        color={C.ink}
        accent={{ 6: C.blue }}
        style={{ position: "absolute", left: X0, top: 196, width: 1500 }}
      />

      {/* The dollar axis under the bar. */}
      <div style={{ position: "absolute", left: X0, top: BAR_Y + BAR_H + 18, width: SPAN * axis, height: 2, background: C.ink }} />
      {Array.from({ length: 7 }, (_, i) => i * 400).map((usd) => (
        <div key={usd} style={{ position: "absolute", left: px(usd), top: BAR_Y + BAR_H + 18, opacity: ramp(frame, tDebt - 0.6 + usd / 4000, 0.3) }}>
          <div style={{ width: 2, height: 14, background: C.ink }} />
          <div style={{ fontFamily: mono, fontSize: 20, color: C.ink2, marginTop: 8, transform: "translateX(-50%)", marginLeft: 1 }}>${fmt(usd)}</div>
        </div>
      ))}

      {/* Collateral needed at 110%, outlined behind the debt. */}
      <div
        style={{
          position: "absolute",
          left: X0 - 8,
          top: BAR_Y - 10,
          width: (px(2200) - X0 + 16) * coll,
          height: BAR_H + 20,
          border: coll > 0 ? `4px solid ${C.blue}` : undefined,
          background: C.blueSoft,
          opacity: coll > 0 ? 1 : 0,
        }}
      />
      <div style={{ position: "absolute", left: X0, top: BAR_Y, width: (px(1800) - X0) * debt, height: BAR_H, background: C.ink }} />
      <div
        style={{
          position: "absolute",
          left: px(1800),
          top: BAR_Y,
          width: (px(2000) - px(1800)) * gas,
          height: BAR_H,
          background: `repeating-linear-gradient(135deg, ${C.ink2} 0 6px, ${C.paper} 6px 12px)`,
          outline: gas > 0 ? `2px solid ${C.ink}` : undefined,
        }}
      />

      {/* Segment labels above the bar. */}
      <Label at={px(1800)} y={BAR_Y - 70} u={ramp(frame, tDebt + 0.4, 0.4)} align="right" text="1,800 MUSD minimum debt" />
      <Label at={px(2000)} y={BAR_Y - 70} u={gas} align="left" text="+ 200 gas deposit" offset={18} />
      <Label at={px(2200)} y={BAR_Y + 12} u={ramp(frame, tLock + 0.5, 0.4)} align="left" text="× 110%" color={C.blue} offset={22} />

      {/* The number. */}
      <div style={{ position: "absolute", left: X0 - 8, top: 752, display: "flex", alignItems: "baseline", gap: 36, opacity: big, transform: `translateY(${(1 - big) * 30}px)` }}>
        <span style={{ fontSize: 180, fontWeight: 600, letterSpacing: -8, color: C.blue, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
          <Count to={2200} start={tBig - 0.15} dur={0.9} format={(x) => `$${fmt(x)}`} />
        </span>
        <span style={{ fontSize: 40, fontWeight: 500, color: C.ink, lineHeight: 1.2, whiteSpace: "nowrap" }}>of bitcoin locked, just to try MUSD.</span>
      </div>

      <Sfx src="sfx/pop.wav" at={tDebt} volume={0.35} />
      <Sfx src="sfx/pop.wav" at={tGas} volume={0.3} />
      <Sfx src="sfx/swell.wav" at={tLock - 0.1} volume={0.35} />
      <Sfx src="sfx/hit.wav" at={tBig - 0.1} volume={0.5} />
    </AbsoluteFill>
  );
};

const Label: React.FC<{ at: number; y: number; u: number; text: string; align: "left" | "right"; color?: string; offset?: number }> = ({
  at,
  y,
  u,
  text,
  align,
  color = C.ink,
  offset = 0,
}) => (
  <div
    style={{
      position: "absolute",
      top: y,
      ...(align === "right" ? { right: 1920 - at } : { left: at + offset }),
      fontFamily: mono,
      fontSize: 26,
      color,
      opacity: u,
      transform: `translateY(${(1 - u) * 12}px)`,
      whiteSpace: "nowrap",
      display: "flex",
      alignItems: "center",
      gap: 12,
    }}
  >
    {align === "right" && text}
    <span style={{ width: 2, height: 40, background: color }} />
    {align === "left" && text}
  </div>
);
