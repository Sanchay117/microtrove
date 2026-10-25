import { AbsoluteFill, useCurrentFrame } from "remotion";
import { pop, ramp } from "../anim";
import { Kicker } from "../components/Chrome";
import { Sfx } from "../components/Sfx";
import { Count, Words } from "../components/Type";
import { FACTS, wordAt } from "../data";
import { C, FPS, mono, sans } from "../theme";

const S = "shipped";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** What Wave 1 shipped, counted up as the voice says it. */
export const Shipped: React.FC = () => {
  const frame = useCurrentFrame();
  const w = (word: string) => wordAt(S, 0, word);
  const items = [
    { n: 53, label: "Foundry tests", sub: "fuzz · EIP-712 · invariant", at: w("53") - 0.1 },
    { n: 2, label: "verified contracts", sub: "Sourcify exact match", at: w("two") - 0.1 },
    { n: 1, label: "web app", sub: "React · wagmi · viem", at: w("web") - 0.1 },
    { n: 1, label: "keeper bot", sub: "TypeScript · viem", at: w("keeper") - 0.1 },
  ];
  const tLive = w("live") - 0.1;
  const live = ramp(frame, tLive, 0.45);
  const blink = 0.55 + 0.45 * Math.cos(((frame / FPS - tLive) * Math.PI * 2) / 1.2);
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      <Kicker index="09" label="Shipped in Wave 1" style={{ position: "absolute", left: 160, top: 140, opacity: ramp(frame, 0.1, 0.4) }} />
      <Words
        words={[
          ["Every", 0.2],
          ["flow", 0.32],
          ["but", 0.44],
          ["one", 0.56],
          ["has", 0.68],
          ["run", 0.8],
          ["on", 0.92],
          ["chain.", 1.04],
        ]}
        size={96}
        color={C.ink}
        accent={{ 7: C.blue }}
        style={{ position: "absolute", left: 160, top: 196 }}
      />
      <div style={{ position: "absolute", left: 160, top: 400, width: 1600, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40 }}>
        {items.map((it) => {
          const u = Math.min(1, pop(frame, it.at));
          return (
            <div key={it.label} style={{ borderTop: `3px solid ${C.ink}`, paddingTop: 18, opacity: u, transform: `translateY(${(1 - u) * 30}px)` }}>
              <div style={{ fontSize: 210, fontWeight: 600, letterSpacing: -10, lineHeight: 0.9, color: C.blue, fontVariantNumeric: "tabular-nums" }}>
                <Count to={it.n} start={it.at} dur={it.n > 9 ? 0.7 : 0.2} format={(x) => String(Math.round(x))} />
              </div>
              <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -0.5, marginTop: 18 }}>{it.label}</div>
              <div style={{ fontFamily: mono, fontSize: 21, color: C.ink2, marginTop: 8 }}>{it.sub}</div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 160,
          top: 830,
          width: 1600,
          height: 80,
          background: C.ink,
          color: C.paper,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "0 30px",
          fontFamily: mono,
          fontSize: 24,
          letterSpacing: 0.5,
          opacity: live,
          transform: `translateY(${(1 - live) * 20}px)`,
        }}
      >
        <span style={{ width: 16, height: 16, background: C.blueOnDark, opacity: blink }} />
        <span>LIVE ON MEZO TESTNET</span>
        <span style={{ color: C.onDark }}>chain 31611</span>
        <span style={{ color: C.onDark }}>loan book {short(FACTS.loans)}</span>
        <span style={{ color: C.onDark }}>vault {short(FACTS.vault)}</span>
      </div>
      {items.map((it) => (
        <Sfx key={it.label} src="sfx/pop.wav" at={it.at} volume={0.35} />
      ))}
      <Sfx src="sfx/confirm.wav" at={tLive} volume={0.35} />
    </AbsoluteFill>
  );
};
