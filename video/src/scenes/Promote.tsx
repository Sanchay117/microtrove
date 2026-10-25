import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { f, pop, ramp, typed } from "../anim";
import { Kicker } from "../components/Chrome";
import { Footage, Spotlight } from "../components/Footage";
import { Sfx } from "../components/Sfx";
import { Words } from "../components/Type";
import { clips, lineAt, wordAt } from "../data";
import { C, FPS, mono, sans } from "../theme";

const S = "promote";

// MUSD's EIP-712 OpenTrove message, as web/src/views/Promote.tsx signs it, with the card's suggested values.
const TYPED = [
  "domain    BorrowerOperationsSignatures · v1 · 31611",
  "OpenTrove {",
  "  assetAmount  0.039771 BTC",
  "  debtAmount   1,800 MUSD",
  "  borrower     0x9A66…Fb9e",
  "  recipient    Microtroves",
  "  nonce        0",
  "  deadline     now + 30 min",
  "}",
];
const SIG = "0x7c4e1f09b2d8a3c65e0f4a71d93b28c6f05e7a1d4b9c2e83f6a05d17c9e2b4f8a1";

/** Signing MUSD's own OpenTrove message, the real promotion card, then micro troves feeding MUSD. */
export const Promote: React.FC = () => {
  const frame = useCurrentFrame();
  const l1 = lineAt(S, 1);
  const l2 = lineAt(S, 2);
  const from = l1.start - 0.3; // footage window, matches PROMOTE_FROM in scripts/capture.ts
  const tOutgrows = wordAt(S, 0, "outgrows");
  const tSign = wordAt(S, 0, "sign");
  const tMessage = wordAt(S, 0, "message");

  const partA = 1 - ramp(frame, from - 0.3, 0.35);
  const partC = ramp(frame, l2.start - 0.15, 0.4);
  const grow = pop(frame, tOutgrows - 0.1, 10);
  const card = ramp(frame, tSign - 0.4, 0.4);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      {/* A: the borrower outgrows the micro trove and signs. */}
      <AbsoluteFill style={{ opacity: partA }}>
        <Kicker index="07" label="Promotion" style={{ position: "absolute", left: 160, top: 140, opacity: ramp(frame, 0.1, 0.4) }} />
        <Words
          words={[
            ["Grow", 0.4],
            ["into", 0.52],
            ["a", 0.62],
            ["full", 0.72],
            ["MUSD", 0.84],
            ["trove.", 0.98],
          ]}
          size={96}
          color={C.ink}
          accent={{ 4: C.blue, 5: C.blue }}
          style={{ position: "absolute", left: 160, top: 196 }}
        />
        <div style={{ position: "absolute", left: 200, top: 420, width: 400, height: 400, border: `3px dashed ${C.ink3}`, opacity: ramp(frame, 0.6, 0.4) }} />
        <div
          style={{
            position: "absolute",
            left: 400 - (150 + 270 * grow) / 2,
            top: 620 - (150 + 270 * grow) / 2,
            width: 150 + 270 * grow,
            height: 150 + 270 * grow,
            background: C.blue,
            boxShadow: `8px 8px 0 ${C.ink}`,
            opacity: ramp(frame, 0.7, 0.3),
          }}
        />
        <div style={{ position: "absolute", left: 200, top: 862, fontFamily: mono, fontSize: 24, color: C.ink2, opacity: ramp(frame, 0.8, 0.4) }}>
          micro trove · up to 200 MUSD
        </div>

        <div
          style={{
            position: "absolute",
            left: 820,
            top: 400,
            width: 940,
            height: 500,
            background: C.ink,
            boxShadow: `10px 10px 0 ${C.blue}`,
            opacity: card,
            transform: `translateY(${(1 - card) * 30}px)`,
          }}
        >
          <div style={{ height: 52, borderBottom: "1px solid #2a2a28", display: "flex", alignItems: "center", padding: "0 24px", gap: 10 }}>
            <span style={{ width: 12, height: 12, background: C.blueOnDark }} />
            <span style={{ fontFamily: mono, fontSize: 20, color: C.onDark }}>EIP-712 · sign MUSD’s OpenTrove</span>
          </div>
          <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 8 }}>
            {TYPED.map((line, i) => (
              <div key={i} style={{ fontFamily: mono, fontSize: 24, color: i === 0 ? C.onDark : C.paper, whiteSpace: "pre", height: 30 }}>
                {typed(frame, tSign - 0.2 + i * 0.12, line, 90)}
              </div>
            ))}
            <div style={{ fontFamily: mono, fontSize: 24, color: C.blueOnDark, whiteSpace: "pre", height: 30, marginTop: 8 }}>
              {typed(frame, tMessage - 0.3, `signature ${SIG.slice(0, 44)}…`, 80)}
            </div>
          </div>
        </div>
      </AbsoluteFill>

      {/* B: the real promotion card. */}
      <Sequence from={f(from)} durationInFrames={f(l2.start + 0.2 - from)} layout="none">
        <PromoteFootage from={from} />
      </Sequence>

      {/* C: every borrower who grows becomes an MUSD trove. */}
      <AbsoluteFill style={{ opacity: partC }}>
        <Feed start={l2.start} />
      </AbsoluteFill>

      <Sfx src="sfx/swell.wav" at={tOutgrows - 0.2} volume={0.3} />
      <Sfx src="sfx/sign.wav" at={tMessage - 0.3} volume={0.4} />
    </AbsoluteFill>
  );
};

const PromoteFootage: React.FC<{ from: number }> = ({ from }) => {
  const clip = clips.promote;
  const at = (word: string) => wordAt(S, 1, word) - from;
  const b = (name: string) => clip.boxes[name].box;
  // 1.35× with the card centred across the window, its title and every row in frame, and the (disabled) button,
  // which starts 1.7% of the frame below the last row, just out of it. Past the footage's right edge is plain paper.
  const cams = [{ t: 0, scale: 1.35, x: 1.148, y: 0.53 }];
  return (
    <Footage
      src="clips/promote.mp4"
      cams={cams}
      overlay={(cam) => (
        <>
          <Spotlight cam={cam} box={b("new")} at={at("opens") - 0.15} until={at("repays") - 0.25} label="Opens a full MUSD trove" side="left" />
          <Spotlight cam={cam} box={b("repaid")} at={at("repays") - 0.15} until={at("rest") - 0.25} label="Repays the micro loan" side="left" />
          <Spotlight cam={cam} box={b("receive")} at={at("rest") - 0.2} until={30} label="Sends you the rest" side="left" />
        </>
      )}
    />
  );
};

// Micro troves stream in from the left and land in the MUSD trove set on the right.
const POOL = { x: 1180, y: 380, size: 520 };
const Feed: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const tName = wordAt(S, 2, "Microtrove");
  const tInstead = wordAt(S, 2, "instead");
  const n = 16;
  const cols = 4;
  const cell = POOL.size / cols;
  const landed: number[] = [];
  const flying = [];
  for (let k = 0; k < n; k++) {
    const born = start + 0.1 + k * 0.22;
    const u = (frame / FPS - born) / 1.1;
    if (u >= 1) landed.push(k);
    else if (u > 0) {
      const e = 1 - (1 - u) ** 3;
      const y0 = 420 + ((k * 97) % 420);
      const tx = POOL.x + (k % cols) * cell + cell / 2;
      const ty = POOL.y + Math.floor(k / cols) * cell + cell / 2;
      const x = 160 + (tx - 160) * e;
      const y = y0 + (ty - y0) * e;
      const s = 44 + (cell - 24 - 44) * e;
      flying.push(<div key={k} style={{ position: "absolute", left: x - s / 2, top: y - s / 2, width: s, height: s, background: C.blue, opacity: 0.9 }} />);
    }
  }
  return (
    <>
      <Kicker index="07" label="Promotion" style={{ position: "absolute", left: 160, top: 140 }} />
      <Words
        words={[
          ["An", tName - 0.1],
          ["on-ramp", tName + 0.05],
          ["to", tName + 0.2],
          ["MUSD,", tName + 0.35],
          ["not", tInstead - 0.1],
          ["a", tInstead + 0.05],
          ["competitor.", tInstead + 0.2],
        ]}
        size={96}
        color={C.ink}
        accent={{ 3: C.blue }}
        style={{ position: "absolute", left: 160, top: 196, width: 960 }}
      />
      <div style={{ position: "absolute", left: POOL.x, top: POOL.y, width: POOL.size, height: POOL.size, border: `3px solid ${C.ink}`, background: C.panel, boxShadow: `10px 10px 0 ${C.ink}` }}>
        {landed.map((k) => (
          <div
            key={k}
            style={{ position: "absolute", left: (k % cols) * cell + 12, top: Math.floor(k / cols) * cell + 12, width: cell - 24, height: cell - 24, background: C.blue }}
          />
        ))}
      </div>
      <div style={{ position: "absolute", left: POOL.x, top: POOL.y + POOL.size + 24, fontFamily: mono, fontSize: 24, color: C.ink2 }}>
        MUSD troves <span style={{ color: C.blue }}>+{landed.length}</span>
      </div>
      {flying}
    </>
  );
};
