import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, f, pop, ramp } from "../anim";
import { BrandMark, Wordmark } from "../components/Brand";
import { Sfx } from "../components/Sfx";
import { lineAt, wordAt } from "../data";
import { C, mono, sans } from "../theme";

const S = "rfc";
const SKELETON = [0.92, 0.84, 0.97, 0.6, 0, 0.88, 0.95, 0.72, 0.9, 0.5];

/** RFC-2 was designed and never shipped; the card gives way to the Microtrove mark. */
export const Rfc: React.FC = () => {
  const frame = useCurrentFrame();
  const tRfc = wordAt(S, 0, "RFC");
  const tShipped = wordAt(S, 0, "shipped");
  const l1 = lineAt(S, 1).start;
  const tBuilt = wordAt(S, 1, "built");
  const tName = wordAt(S, 1, "Microtrove");

  const cardIn = ramp(frame, 0.05, 0.6);
  const cardOut = ramp(frame, l1 - 0.25, 0.45);
  const under = ramp(frame, tRfc, 0.5);
  const stamp = pop(frame, tShipped - 0.05, 11);

  const mark = pop(frame, tBuilt - 0.25, 13);
  const inner = pop(frame, tBuilt + 0.25, 9);
  const name = ramp(frame, tName - 0.1, 0.5);
  const sub = ramp(frame, tName + 0.5, 0.5);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      {/* The RFC, as a page. */}
      <div
        style={{
          position: "absolute",
          left: 440,
          top: 210,
          width: 1040,
          height: 600,
          background: C.panel,
          border: `2px solid ${C.ink}`,
          boxShadow: `10px 10px 0 ${C.ink}`,
          padding: "40px 56px",
          opacity: cardIn * (1 - cardOut),
          transform: `translateY(${(1 - cardIn) * 60}px) scale(${1 - 0.15 * cardOut})`,
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 22, color: C.ink2 }}>mezo-org/musd · rfc-2 · docs/rfc/rfc-2.md</div>
        <div style={{ marginTop: 26, fontSize: 60, fontWeight: 600, letterSpacing: -2, lineHeight: 1.05, display: "inline-block", position: "relative" }}>
          RFC-2: Lending Arbitrage Microloans
          <div style={{ position: "absolute", left: 0, bottom: -10, height: 8, width: `${under * 100}%`, background: C.blue }} />
        </div>
        <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 18 }}>
          {SKELETON.map((w, i) =>
            w === 0 ? (
              <div key={i} style={{ height: 6 }} />
            ) : (
              <div key={i} style={{ height: 14, width: `${w * 100 * ramp(frame, 0.3 + i * 0.06, 0.5)}%`, background: C.ruleSoft }} />
            ),
          )}
        </div>
        <div
          style={{
            position: "absolute",
            right: 60,
            bottom: 70,
            border: `6px solid ${C.pink}`,
            color: C.pink,
            fontFamily: mono,
            fontWeight: 700,
            fontSize: 52,
            letterSpacing: 4,
            padding: "10px 26px",
            transform: `rotate(-7deg) scale(${interpolate(stamp, [0, 1], [1.8, 1])})`,
            opacity: frame >= f(tShipped - 0.05) ? Math.min(1, stamp * 1.4) : 0,
            background: "rgba(255,255,255,0.85)",
          }}
        >
          NEVER SHIPPED
        </div>
      </div>

      {/* The mark: an MUSD trove holding a micro trove. */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", flexDirection: "column", gap: 40, opacity: interpolate(frame, [f(l1 - 0.1), f(l1)], [0, 1], CLAMP) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          <div style={{ transform: `scale(${mark})` }}>
            <BrandMark size={210} inner={inner} />
          </div>
          <div style={{ overflow: "hidden", paddingBottom: 20, marginBottom: -20 }}>
            <div style={{ transform: `translateX(${(1 - name) * -110}%)`, opacity: name > 0 ? 1 : 0 }}>
              <Wordmark size={190} />
            </div>
          </div>
        </div>
        <div style={{ fontFamily: mono, fontSize: 28, color: C.ink2, letterSpacing: 1, opacity: sub, transform: `translateY(${(1 - sub) * 10}px)` }}>
          RFC-2 microloans <span style={{ color: C.blue }}>·</span> on MUSD <span style={{ color: C.blue }}>·</span> live on Mezo Testnet
        </div>
      </AbsoluteFill>

      <Sfx src="sfx/stamp.wav" at={tShipped - 0.05} volume={0.55} />
      <Sfx src="sfx/pop.wav" at={tBuilt - 0.25} volume={0.4} />
      <Sfx src="sfx/pop.wav" at={tBuilt + 0.25} volume={0.3} />
    </AbsoluteFill>
  );
};
