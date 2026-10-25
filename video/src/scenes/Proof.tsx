import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { f, pop, ramp, typed } from "../anim";
import { Kicker } from "../components/Chrome";
import { Sfx } from "../components/Sfx";
import { Words } from "../components/Type";
import { FACTS, lineAt, wordAt } from "../data";
import { C, mono, sans } from "../theme";

const S = "proof";

/** The keeper's real log from the expiry run on Mezo Testnet (keeper/README.md), shortened to fit. */
const LOG: { text: string; tone?: "pink" | "blue" | "dim"; at: (w: (word: string) => number) => number }[] = [
  { text: "$ npm start", tone: "dim", at: () => 1.2 },
  { text: "14:00:50  keeper 0xc9Be…8653, scanning every 30s", at: () => 1.7 },
  { text: "14:52:29  BTC $80,451 · 1 trove, 0 liquidatable", at: (w) => w("keeper") - 0.1 },
  { text: "15:00:44  BTC $80,596 · 1 trove, 1 liquidatable", tone: "pink", at: (w) => w("matured") - 0.3 },
  { text: "15:01:01  liquidated 0x9A66…Fb9e (matured)", at: (w) => w("forty") - 0.2 },
  { text: "          repaid 40.20 MUSD, got 0.00054813 BTC", at: (w) => w("forty") + 0.5 },
  { text: "          $3.98 profit after gas", tone: "blue", at: (w) => w("$3.98") - 0.2 },
  { text: "15:01:01  0.00045335 BTC stays claimable", at: (w) => w("bad") - 0.3 },
];

const CURSOR = (
  <svg width={40} height={40} viewBox="0 0 26 26">
    <path d="M4 2 L4 21 L9 16.5 L12.5 24 L15.5 22.6 L12 15.2 L19 15.2 Z" fill={C.ink} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
  </svg>
);

/** The keeper bot liquidating a matured loan for real, then the borrower claiming what was left. */
export const Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const w = (word: string) => wordAt(S, 0, word);
  const l1 = lineAt(S, 1);
  const tClaimed = wordAt(S, 1, "claimed");
  const out = ramp(frame, l1.start - 0.35, 0.4);
  const inCard = ramp(frame, l1.start - 0.1, 0.5);

  const stats = [
    { big: "48s", text: "from due date to liquidation, on chain", at: w("forty") - 0.1 },
    { big: "$3.98", text: "keeper profit after gas, 40 MUSD loan", at: w("$3.98") - 0.1 },
    { big: "0", text: "bad debt", at: w("bad") - 0.2 },
  ];

  // The cursor glides to the claim button and clicks on "claimed".
  const click = tClaimed - 0.05;
  const move = ramp(frame, l1.start + 0.15, Math.max(0.3, click - l1.start - 0.25));
  const cx = interpolate(move, [0, 1], [1700, 1500]);
  const cy = interpolate(move, [0, 1], [880, 500]);
  const pressed = frame >= f(click) && frame < f(click) + 5;
  const done = frame >= f(click) + 4;
  const toast = ramp(frame, click + 0.35, 0.35);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      <AbsoluteFill style={{ opacity: 1 - out, transform: `translateX(${-out * 60}px)` }}>
        <Kicker index="06" label="Proof" style={{ position: "absolute", left: 160, top: 140, opacity: ramp(frame, 0.1, 0.4) }} />
        <Words words={["Then", "we", "proved", "it", "live."].map((x) => [x, w(x)] as [string, number])} size={96} color={C.ink} accent={{ 4: C.blue }} style={{ position: "absolute", left: 160, top: 196 }} />

        {/* The keeper's terminal. */}
        <div
          style={{
            position: "absolute",
            left: 160,
            top: 360,
            width: 980,
            height: 480,
            background: C.ink,
            boxShadow: `10px 10px 0 ${C.blue}`,
            opacity: ramp(frame, 0.9, 0.4),
          }}
        >
          <div style={{ height: 52, borderBottom: "1px solid #2a2a28", display: "flex", alignItems: "center", padding: "0 24px", gap: 10 }}>
            <span style={{ width: 12, height: 12, background: C.blueOnDark }} />
            <span style={{ fontFamily: mono, fontSize: 20, color: C.onDark }}>keeper · Mezo Testnet</span>
          </div>
          <div style={{ padding: "22px 28px", display: "flex", flexDirection: "column", gap: 12 }}>
            {LOG.map((l, i) => {
              const t = l.at(w);
              const text = typed(frame, t, l.text, 70);
              const color = l.tone === "pink" ? "#ff6f96" : l.tone === "blue" ? C.blueOnDark : l.tone === "dim" ? C.onDark : C.paper;
              return (
                <div key={i} style={{ fontFamily: mono, fontSize: 24, color, whiteSpace: "pre", height: 32, fontWeight: l.tone === "blue" ? 700 : 400 }}>
                  {text}
                </div>
              );
            })}
          </div>
        </div>

        {/* What it proved. */}
        <div style={{ position: "absolute", left: 1220, top: 360, display: "flex", flexDirection: "column", gap: 26 }}>
          {stats.map((s) => {
            const u = pop(frame, s.at);
            return (
              <div key={s.big} style={{ opacity: Math.min(1, u), transform: `translateY(${(1 - Math.min(1, u)) * 24}px)`, borderTop: `2px solid ${C.ink}`, paddingTop: 14, width: 540 }}>
                <div style={{ fontSize: 100, fontWeight: 600, letterSpacing: -4.5, lineHeight: 1, color: C.blue }}>{s.big}</div>
                <div style={{ fontSize: 26, color: C.ink2, marginTop: 6 }}>{s.text}</div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* The borrower's claim, as the app showed it. */}
      <AbsoluteFill style={{ opacity: inCard, transform: `translateY(${(1 - inCard) * 30}px)` }}>
        <Kicker index="06" label="Proof · the borrower’s side" style={{ position: "absolute", left: 160, top: 140 }} />
        <div
          style={{
            position: "absolute",
            left: 260,
            top: 380,
            width: 1400,
            background: C.panel,
            border: `2px solid ${C.ink}`,
            borderLeft: `10px solid ${C.blue}`,
            boxShadow: `10px 10px 0 ${C.ink}`,
            padding: "44px 52px",
            display: "flex",
            alignItems: "center",
            gap: 48,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 52, fontWeight: 600, letterSpacing: -1.5 }}>BTC waiting for you</div>
            <div style={{ fontSize: 28, color: C.ink2, marginTop: 14, lineHeight: 1.4 }}>
              A keeper repaid your matured loan. The collateral left after their premium, <b style={{ color: C.ink }}>0.00045335 BTC</b>, is yours to claim.
            </div>
          </div>
          <div
            style={{
              background: done ? C.ink : C.blue,
              color: "#fff",
              fontSize: 28,
              fontWeight: 500,
              padding: "22px 30px",
              whiteSpace: "nowrap",
              transform: `scale(${pressed ? 0.96 : 1})`,
            }}
          >
            {done ? "Claimed ✓" : "Claim 0.00045335 BTC"}
          </div>
        </div>
        <div style={{ position: "absolute", left: 260, top: 640, fontFamily: mono, fontSize: 24, color: C.ink2, opacity: toast }}>
          claimSurplus · tx {FACTS.claimTx.slice(0, 10)}…{FACTS.claimTx.slice(-6)} · Mezo Testnet
        </div>
        <div
          style={{
            position: "absolute",
            right: 160,
            bottom: 140,
            background: C.ink,
            color: C.paper,
            borderLeft: `6px solid ${C.blue}`,
            padding: "16px 22px",
            fontSize: 24,
            opacity: toast,
            transform: `translateY(${(1 - toast) * 16}px)`,
          }}
        >
          <b>Claim BTC</b>
          <div style={{ color: C.onDark, marginTop: 4 }}>Confirmed</div>
        </div>
        <div style={{ position: "absolute", left: cx, top: cy, transform: `scale(${pressed ? 0.82 : 1})`, transformOrigin: "6px 3px", opacity: inCard }}>{CURSOR}</div>
      </AbsoluteFill>

      {stats.map((s) => (
        <Sfx key={s.big} src="sfx/pop.wav" at={s.at} volume={0.35} />
      ))}
      <Sfx src="sfx/click.wav" at={click} volume={0.5} />
      <Sfx src="sfx/confirm.wav" at={click + 0.35} volume={0.4} />
    </AbsoluteFill>
  );
};

