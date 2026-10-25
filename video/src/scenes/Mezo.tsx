import { AbsoluteFill, useCurrentFrame } from "remotion";
import { pop, ramp } from "../anim";
import { BrandMark } from "../components/Brand";
import { Kicker } from "../components/Chrome";
import { Sfx } from "../components/Sfx";
import { Words } from "../components/Type";
import { wordAt } from "../data";
import { C, mono, sans } from "../theme";

const S = "mezo";

/** Mezo contracts Microtrove calls (deployments/mezo-testnet.json), lit as the voice names them. */
export const Mezo: React.FC = () => {
  const frame = useCurrentFrame();
  const w = (word: string) => wordAt(S, 0, word);
  const end = w("sorted") + 0.7;
  const tiles = [
    { name: ["MUSD"], role: "Loan currency and vault asset", addr: "0x1189…c503", at: w("MUSD") - 0.1 },
    { name: ["PriceFeed"], role: "Prices every collateral check", addr: "0x86bC…9366", at: w("price") - 0.1 },
    { name: ["BorrowerOperations", "Signatures"], role: "Opens a trove from a signature", addr: "0xD757…639e", at: w("borrower") - 0.1 },
    { name: ["HintHelpers"], role: "Approximate sorted-list hint", addr: "0x4e4c…BCF6", at: w("hint") - 0.1 },
    { name: ["SortedTroves"], role: "Exact insert position", addr: "0x722E…68fA", at: w("sorted") - 0.1 },
    { name: ["TroveManager"], role: "Recovery mode check", addr: "0xE47c…6bb0", at: end },
    { name: ["BTC"], role: "Native gas and collateral", addr: "no wrapping", at: end + 0.2 },
  ];
  const ours = ramp(frame, 0.5, 0.4);
  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      <Kicker index="08" label="Built on Mezo" style={{ position: "absolute", left: 160, top: 140, opacity: ramp(frame, 0.1, 0.4) }} />
      <Words
        words={[
          ["Mezo’s", w("Mezo") - 0.1],
          ["own", w("own") - 0.05],
          ["contracts,", w("contracts") - 0.05],
          ["doing", w("contracts") + 0.15],
          ["real", w("contracts") + 0.3],
          ["work.", w("contracts") + 0.45],
        ]}
        size={96}
        color={C.ink}
        accent={{ 0: C.blue }}
        style={{ position: "absolute", left: 160, top: 196 }}
      />
      <div style={{ position: "absolute", left: 160, top: 380, width: 1600, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
        {/* Microtrove's own two contracts, the hub the others plug into. */}
        <div style={{ height: 250, background: C.blue, color: "#fff", padding: "24px 26px", opacity: ours, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: `6px 6px 0 ${C.ink}` }}>
          <BrandMark size={34} />
          <div>
            <div style={{ fontFamily: mono, fontSize: 26, lineHeight: 1.25 }}>Microtroves</div>
            <div style={{ fontFamily: mono, fontSize: 26, lineHeight: 1.25 }}>MicrotroveVault</div>
            <div style={{ fontSize: 22, marginTop: 10, color: C.blueSoft }}>Ours, verified on Sourcify</div>
          </div>
        </div>
        {tiles.map((t, i) => {
          const u = pop(frame, t.at, 13);
          const on = Math.min(1, u);
          return (
            <div
              key={t.name.join("")}
              style={{
                height: 250,
                background: C.panel,
                border: `2px solid ${on > 0.05 ? C.ink : C.ruleSoft}`,
                boxShadow: `${6 * on}px ${6 * on}px 0 ${C.ink}`,
                padding: "24px 26px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                transform: `translate(${-6 * on}px, ${-6 * on}px)`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 20 }}>
                <span style={{ color: on > 0.05 ? C.blue : C.ink3 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ color: C.ink3 }}>{t.addr}</span>
              </div>
              <div style={{ opacity: 0.35 + 0.65 * on }}>
                {t.name.map((n) => (
                  <div key={n} style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, lineHeight: 1.2, color: C.ink }}>
                    {n}
                  </div>
                ))}
                <div style={{ fontSize: 23, color: C.ink2, marginTop: 10 }}>{t.role}</div>
              </div>
            </div>
          );
        })}
      </div>
      {tiles.map((t) => (
        <Sfx key={t.name.join("")} src="sfx/tick.wav" at={t.at} volume={0.35} />
      ))}
    </AbsoluteFill>
  );
};
