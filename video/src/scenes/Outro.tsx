import { AbsoluteFill, useCurrentFrame } from "remotion";
import { pop, ramp } from "../anim";
import { BrandMark, Wordmark } from "../components/Brand";
import { Words } from "../components/Type";
import { FACTS, LINKS, wordAt } from "../data";
import { C, mono, sans } from "../theme";

const S = "outro";

/** The end card, on ink like the deck's close. */
export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const w = (word: string) => wordAt(S, 0, word);
  const tName = w("Microtrove");
  const tStart = w("Start");
  const tGrow = w("Grow");
  const mark = pop(frame, tName - 0.15, 12);
  const inner = pop(frame, tName + 0.25, 9);
  const foot = ramp(frame, tGrow + 0.6, 0.6);
  const rows = [
    ...LINKS,
    { label: "Loan book", value: FACTS.loans },
    { label: "Vault", value: FACTS.vault },
    { label: "Chain", value: "Mezo Testnet, 31611" },
  ];
  return (
    <AbsoluteFill style={{ background: C.ink, fontFamily: sans, padding: "120px 160px", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ transform: `scale(${mark})` }}>
          <BrandMark size={72} inner={inner} dark />
        </div>
        <div style={{ opacity: ramp(frame, tName, 0.4) }}>
          <Wordmark size={64} color={C.paper} />
        </div>
      </div>
      <div>
        <Words
          words={[
            ["Start", tStart],
            ["with", w("with")],
            ["$50", w("$50")],
            ["of", w("of")],
            ["bitcoin.", w("bitcoin")],
          ]}
          size={128}
          color={C.paper}
          style={{ letterSpacing: -6 }}
        />
        <Words
          words={[
            ["Grow", tGrow],
            ["into", w("into")],
            ["MUSD.", w("MUSD")],
          ]}
          size={128}
          color={C.paper}
          accent={{ 2: C.blueOnDark }}
          style={{ letterSpacing: -6 }}
        />
      </div>
      <div
        style={{
          borderTop: `2px solid ${C.paper}`,
          paddingTop: 26,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px 64px",
          opacity: foot,
          transform: `translateY(${(1 - foot) * 16}px)`,
        }}
      >
        {rows.map((r) => (
          <div key={r.label} style={{ fontFamily: mono, fontSize: 24, color: C.onDark }}>
            <span style={{ color: C.blueOnDark, marginRight: 18 }}>{r.label}</span>
            {r.value}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
