import { AbsoluteFill } from "remotion";
import { BrandMark, Wordmark } from "./components/Brand";
import { C, mono, sans } from "./theme";

// The trove square's side; the micro trove's is scaled by the square root of $50 / $2,200, so the areas are true.
const BIG = 560;
const SMALL = Math.round(BIG * Math.sqrt(50 / 2200));

/** The video's cover: the pitch in one line, and the gap drawn to scale. */
export const Thumbnail: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
    <div style={{ position: "absolute", left: 110, top: 96, display: "flex", alignItems: "center", gap: 22 }}>
      <BrandMark size={60} />
      <Wordmark size={54} />
    </div>

    <div style={{ position: "absolute", left: 104, top: 236, fontSize: 168, fontWeight: 600, letterSpacing: -8, lineHeight: 0.98, color: C.ink }}>
      <div>
        Borrow <span style={{ color: C.blue }}>MUSD</span>
      </div>
      <div>with $50 of</div>
      <div>bitcoin.</div>
    </div>

    {/* $2,200 of BTC for the smallest MUSD trove against $50 for a micro trove, by area. */}
    <div style={{ position: "absolute", right: 120, top: 250, width: BIG, height: BIG, background: C.ink, boxShadow: `14px 14px 0 ${C.blue}` }}>
      <div style={{ position: "absolute", left: 30, top: 28, fontFamily: mono, fontSize: 30, color: C.paper }}>$2,200</div>
      <div style={{ position: "absolute", left: 30, top: 70, fontFamily: mono, fontSize: 22, color: C.onDark }}>to open a MUSD trove</div>
      <div style={{ position: "absolute", left: 30, bottom: 30, width: SMALL, height: SMALL, background: C.blueOnDark, outline: `3px solid ${C.paper}` }} />
      <div style={{ position: "absolute", left: 30 + SMALL + 22, bottom: 30, fontFamily: mono, lineHeight: 1.25 }}>
        <div style={{ fontSize: 30, color: C.paper }}>$50</div>
        <div style={{ fontSize: 22, color: C.onDark }}>a micro trove</div>
      </div>
    </div>

    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 104,
        background: C.blue,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 110px",
        fontFamily: mono,
        fontSize: 30,
        letterSpacing: 1,
        textTransform: "uppercase",
      }}
    >
      <span>RFC-2 microloans · live on Mezo Testnet</span>
      <span>Demo · 2:10</span>
    </div>
  </AbsoluteFill>
);
