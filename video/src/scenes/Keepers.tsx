import { AbsoluteFill, useCurrentFrame } from "remotion";
import { pop, ramp } from "../anim";
import { Kicker } from "../components/Chrome";
import { Sfx } from "../components/Sfx";
import { Words } from "../components/Type";
import { lineAt, wordAt } from "../data";
import { C, mono, sans } from "../theme";

const S = "keepers";

// Chart: keeper profit on a matured loan, as % of the debt repaid, against the collateral ratio.
const PX0 = 300;
const PX1 = 1150;
const PY_TOP = 470; // +40%
const PY_BOT = 900; // −100%
const xOf = (cr: number) => PX0 + ((cr - 1.1) / (5 - 1.1)) * (PX1 - PX0);
const yOf = (pct: number) => PY_TOP + ((40 - pct) / 140) * (PY_BOT - PY_TOP);
const rfc2 = (cr: number) => (0.1 * cr - 1) * 100; // RFC-2: 10% of the collateral, for repaying all of the debt
const OURS = 10; // Microtrove: BTC worth the debt plus 10%

/** RFC-2's reward never pays; Microtrove's always does, and the borrower keeps the rest. */
export const Keepers: React.FC = () => {
  const frame = useCurrentFrame();
  const t110 = wordAt(S, 0, "110%");
  const tPast = wordAt(S, 0, "past");
  const l1 = lineAt(S, 1);
  const tPaid = wordAt(S, 1, "paid");
  const tHalf = wordAt(S, 1, "half");
  const tNobody = wordAt(S, 1, "Nobody");
  const tPay = wordAt(S, 2, "pay");
  const t10 = wordAt(S, 2, "10%");
  const tDebt = wordAt(S, 2, "debt");
  const tClaims = wordAt(S, 2, "claims");

  const axes = ramp(frame, l1.start - 0.4, 0.6);
  const red = ramp(frame, tPaid - 0.1, 1.4);
  const blue = ramp(frame, tPay - 0.1, 1.1);
  const half = pop(frame, tHalf - 0.1);
  const nobody = pop(frame, tNobody - 0.05, 12);
  const label10 = ramp(frame, t10 - 0.1, 0.4);

  const path = (fn: (cr: number) => number, u: number) => {
    const pts = [];
    for (let i = 0; i <= 40 * u; i++) {
      const cr = 1.1 + (i / 40) * 3.9;
      pts.push(`${i === 0 ? "M" : "L"} ${xOf(cr).toFixed(1)} ${yOf(fn(cr)).toFixed(1)}`);
    }
    return pts.join(" ");
  };

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      <Kicker index="05" label="Keepers" style={{ position: "absolute", left: 160, top: 140, opacity: ramp(frame, 0.1, 0.4) }} />
      <Words
        words={[
          ["Liquidation", 0.4],
          ["has", 0.55],
          ["to", 0.65],
          ["pay.", 0.8],
        ]}
        size={96}
        color={C.ink}
        accent={{ 3: C.blue }}
        style={{ position: "absolute", left: 160, top: 196 }}
      />
      {/* When a loan can be liquidated. */}
      <div style={{ position: "absolute", left: 1320, top: 214, display: "flex", flexDirection: "column", gap: 14 }}>
        <Chip u={pop(frame, t110 - 0.15)} swatch={C.pink} text="Collateral below 110%" />
        <Chip u={pop(frame, tPast - 0.15)} swatch={C.ink} text="Past the due date" />
      </div>

      {/* Axes. */}
      <div style={{ opacity: axes }}>
        <div style={{ position: "absolute", left: 160, top: 410, fontFamily: mono, fontSize: 22, color: C.ink2, letterSpacing: 1 }}>
          MATURED LOAN · KEEPER PROFIT, % OF THE DEBT THEY REPAY
        </div>
        {[10, 0, -50, -100].map((p) => (
          <div key={p}>
            <div style={{ position: "absolute", left: PX0, top: yOf(p), width: PX1 - PX0, height: p === 0 ? 3 : 1, background: p === 0 ? C.ink : C.ruleSoft }} />
            <div style={{ position: "absolute", right: 1920 - PX0 + 18, top: yOf(p) - 15, fontFamily: mono, fontSize: 22, color: p === 0 ? C.ink : C.ink2 }}>
              {p > 0 ? `+${p}%` : `${p}%`}
            </div>
          </div>
        ))}
        <div style={{ position: "absolute", left: PX1 - 150, top: yOf(0) + 8, fontFamily: mono, fontSize: 20, color: C.ink2 }}>break-even</div>
        {[1.1, 2, 3, 4, 5].map((cr) => (
          <div key={cr} style={{ position: "absolute", left: xOf(cr), top: PY_BOT + 14, transform: "translateX(-50%)", fontFamily: mono, fontSize: 22, color: C.ink2 }}>
            {Math.round(cr * 100)}%
          </div>
        ))}
        <div style={{ position: "absolute", left: PX0, top: PY_BOT + 48, fontFamily: mono, fontSize: 20, color: C.ink3 }}>collateral ratio →</div>
      </div>

      <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
        {/* The loss RFC-2 asks of a keeper. */}
        {red > 0 && (
          <path
            d={`${path(rfc2, red)} L ${xOf(1.1 + 3.9 * Math.min(1, red)).toFixed(1)} ${yOf(0)} L ${xOf(1.1)} ${yOf(0)} Z`}
            fill={C.pinkSoft}
            opacity={0.8}
          />
        )}
        {red > 0 && <path d={path(rfc2, red)} fill="none" stroke={C.pink} strokeWidth={6} />}
        {blue > 0 && <path d={path(() => OURS, blue)} fill="none" stroke={C.blue} strokeWidth={6} />}
        {half > 0 && <circle cx={xOf(5)} cy={yOf(rfc2(5))} r={12 * half} fill={C.pink} />}
      </svg>

      <Callout
        x={xOf(1.35)}
        y={yOf(-26)}
        u={ramp(frame, tPaid + 0.6, 0.4) * (1 - ramp(frame, tNobody - 0.3, 0.25))}
        color={C.pink}
        title="RFC-2"
        text="10% of the collateral"
      />
      <Callout x={870} y={yOf(rfc2(5)) - 96} u={half} color={C.pink} title="At best: −50%" text="at the 500% cap" />
      <div
        style={{
          position: "absolute",
          left: xOf(1.35),
          top: yOf(-28),
          fontFamily: mono,
          fontWeight: 700,
          fontSize: 40,
          color: C.pink,
          border: `5px solid ${C.pink}`,
          padding: "6px 18px",
          transform: `rotate(-4deg) scale(${1.6 - 0.6 * nobody})`,
          opacity: Math.min(1, nobody * 1.5),
          background: C.paper,
        }}
      >
        NO KEEPER ACTS
      </div>
      <Callout x={xOf(1.1) + 40} y={yOf(OURS) - 86} u={label10} color={C.blue} title="Microtrove: +10%" text="debt plus 10%, at every ratio" />

      {/* Where the collateral goes, at 200%. */}
      <CollateralBar frame={frame} tDebt={tDebt} t10={t10} tClaims={tClaims} />

      <Sfx src="sfx/pop.wav" at={t110 - 0.15} volume={0.3} />
      <Sfx src="sfx/pop.wav" at={tPast - 0.15} volume={0.3} />
      <Sfx src="sfx/draw.wav" at={tPaid - 0.1} volume={0.3} />
      <Sfx src="sfx/stamp.wav" at={tNobody - 0.05} volume={0.5} />
      <Sfx src="sfx/draw.wav" at={tPay - 0.1} volume={0.3} />
      <Sfx src="sfx/confirm.wav" at={t10 - 0.1} volume={0.35} />
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ u: number; swatch: string; text: string }> = ({ u, swatch, text }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 16,
      border: `2px solid ${C.ink}`,
      background: C.panel,
      padding: "12px 20px",
      fontSize: 32,
      fontWeight: 500,
      opacity: Math.min(1, u),
      transform: `translateX(${(1 - u) * 40}px)`,
    }}
  >
    <span style={{ width: 22, height: 22, background: swatch, flex: "none" }} />
    {text}
  </div>
);

const Callout: React.FC<{ x: number; y: number; u: number; color: string; title: string; text: string }> = ({ x, y, u, color, title, text }) => (
  <div style={{ position: "absolute", left: x, top: y, opacity: Math.min(1, u), transform: `translateY(${(1 - Math.min(1, u)) * 10}px)` }}>
    <div style={{ fontSize: 32, fontWeight: 600, color, letterSpacing: -0.5 }}>{title}</div>
    <div style={{ fontFamily: mono, fontSize: 22, color: C.ink2, marginTop: 4 }}>{text}</div>
  </div>
);

const BAR_X = 1340;
const BAR_TOP = 470;
const BAR_H = 430; // 200% of the debt
const CollateralBar: React.FC<{ frame: number; tDebt: number; t10: number; tClaims: number }> = ({ frame, tDebt, t10, tClaims }) => {
  const segs = [
    { pct: 100, color: C.ink, at: tDebt - 0.2, label: "Keeper: BTC worth the debt", text: C.ink },
    { pct: 10, color: C.blue, at: t10 - 0.2, label: "Keeper: +10%", text: C.blue },
    { pct: 90, color: C.blueSoft, at: tClaims - 0.3, label: "Borrower: claims the rest", text: C.ink },
  ];
  let bottom = BAR_TOP + BAR_H;
  const head = ramp(frame, tDebt - 0.5, 0.4);
  return (
    <>
      <div style={{ position: "absolute", left: BAR_X, top: 410, fontFamily: mono, fontSize: 22, color: C.ink2, letterSpacing: 1, opacity: head }}>COLLATERAL AT 200%</div>
      <div style={{ position: "absolute", left: BAR_X, top: BAR_TOP, width: 110, height: BAR_H, border: `2px dashed ${C.ink3}`, opacity: head }} />
      {segs.map((s) => {
        const h = (s.pct / 200) * BAR_H;
        bottom -= h;
        const u = ramp(frame, s.at, 0.45);
        if (u <= 0) return null;
        return (
          <div key={s.label}>
            <div style={{ position: "absolute", left: BAR_X, top: bottom + h * (1 - u), width: 110, height: h * u, background: s.color, outline: `2px solid ${C.ink}` }} />
            <div
              style={{
                position: "absolute",
                left: BAR_X + 132,
                top: bottom + h / 2 - 18,
                fontSize: 26,
                fontWeight: 500,
                color: s.text,
                opacity: u,
                width: 300,
                lineHeight: 1.15,
              }}
            >
              {s.label}
            </div>
          </div>
        );
      })}
    </>
  );
};
