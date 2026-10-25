import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { f, ramp } from "../anim";
import { Kicker } from "../components/Chrome";
import { Footage, Spotlight, type Cam } from "../components/Footage";
import { ClipSounds, Sfx } from "../components/Sfx";
import { Words } from "../components/Type";
import { clips, wordAt } from "../data";
import { C, FPS, mono, sans } from "../theme";

const S = "lenders";
/** Where the lend footage starts in this scene; matches LEND_OFFSET in scripts/capture.ts. */
const FOOTAGE_AT = 5.0;

const NODES = [
  { name: "Lenders", sub: "MUSD holders", x: 160 },
  { name: "Vault", sub: "mtMUSD · ERC-4626", x: 593 },
  { name: "Loan book", sub: "Microtroves", x: 1027, blue: true },
  { name: "Borrowers", sub: "BTC locked", x: 1460 },
];
const NODE_W = 300;
const NODE_Y = 470;
const NODE_H = 170;

/** Lenders fund the loans through the vault, then the real Lend page. */
export const Lenders: React.FC = () => {
  const frame = useCurrentFrame();
  const tLenders = wordAt(S, 0, "lenders");
  const tVault = wordAt(S, 0, "vault");
  const tFund = wordAt(S, 0, "fund");
  const shows = [tLenders - 0.2, tVault - 0.2, tVault + 0.25, tVault + 0.55];
  const out = ramp(frame, FOOTAGE_AT - 0.35, 0.35);

  // MUSD tokens, flowing from the lenders to the borrowers once the vault is up.
  const flowFrom = tVault + 0.3;
  const tokens = [];
  for (let k = 0; k < 14; k++) {
    const born = flowFrom + k * 0.28;
    const u = (frame / FPS - born) / 2.2;
    if (u < 0 || u > 1) continue;
    tokens.push(<div key={k} style={{ position: "absolute", left: 300 + u * 1300, top: NODE_Y + NODE_H / 2 - 9, width: 18, height: 18, background: C.blue }} />);
  }
  const back = ramp(frame, tFund - 0.6, 0.6);

  return (
    <AbsoluteFill style={{ background: C.paper, fontFamily: sans }}>
      <AbsoluteFill style={{ opacity: 1 - out, transform: `translateY(${-out * 30}px)` }}>
        <Kicker index="04" label="Lend" style={{ position: "absolute", left: 160, top: 140, opacity: ramp(frame, 0.1, 0.4) }} />
        <Words
          words={[
            ["Lenders", 0.5],
            ["fund", 0.65],
            ["every", 0.8],
            ["loan.", 0.95],
          ]}
          size={96}
          color={C.ink}
          accent={{ 3: C.blue }}
          style={{ position: "absolute", left: 160, top: 196 }}
        />
        {/* The line the tokens ride, under the nodes. */}
        <div style={{ position: "absolute", left: 310, top: NODE_Y + NODE_H / 2 - 1, width: 1300 * ramp(frame, flowFrom - 0.4, 0.8), height: 2, background: C.ink }} />
        {tokens}
        {NODES.map((n, i) => {
          const u = ramp(frame, shows[i], 0.4);
          return (
            <div
              key={n.name}
              style={{
                position: "absolute",
                left: n.x,
                top: NODE_Y,
                width: NODE_W,
                height: NODE_H,
                background: n.blue ? C.blue : C.panel,
                color: n.blue ? "#fff" : C.ink,
                border: `2px solid ${C.ink}`,
                boxShadow: `6px 6px 0 ${C.ink}`,
                padding: "24px 28px",
                opacity: u,
                transform: `translateY(${(1 - u) * 30}px)`,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <span style={{ fontFamily: mono, fontSize: 20, color: n.blue ? C.blueSoft : C.blue }}>{String.fromCharCode(65 + i)}</span>
              <div>
                <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.05 }}>{n.name}</div>
                <div style={{ fontFamily: mono, fontSize: 20, marginTop: 8, color: n.blue ? C.blueSoft : C.ink2 }}>{n.sub}</div>
              </div>
            </div>
          );
        })}
        {/* Interest flows back to the lenders. */}
        <svg width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0 }}>
          <path
            d={`M ${1610} ${NODE_Y + NODE_H + 8} L ${1610} ${NODE_Y + NODE_H + 110} L ${310} ${NODE_Y + NODE_H + 110} L ${310} ${NODE_Y + NODE_H + 18}`}
            fill="none"
            stroke={C.blue}
            strokeWidth={4}
            pathLength={1}
            style={{ strokeDasharray: `${back} 1` }}
          />
          <path d={`M 298 ${NODE_Y + NODE_H + 30} L 310 ${NODE_Y + NODE_H + 12} L 322 ${NODE_Y + NODE_H + 30}`} fill="none" stroke={C.blue} strokeWidth={4} opacity={back >= 1 ? 1 : 0} />
        </svg>
        <div style={{ position: "absolute", left: 740, top: NODE_Y + NODE_H + 88, padding: "4px 16px", background: C.paper, fontFamily: mono, fontSize: 24, color: C.blue, opacity: back }}>
          interest + fees back to lenders
        </div>
      </AbsoluteFill>

      <Sequence from={f(FOOTAGE_AT)} layout="none">
        <LendFootage />
      </Sequence>
      {shows.map((t, i) => (
        <Sfx key={i} src="sfx/pop.wav" at={t} volume={0.28} />
      ))}
    </AbsoluteFill>
  );
};

/** The real Lend page. Times here are seconds into the footage. */
const LendFootage: React.FC = () => {
  const clip = clips.lend;
  const at = (word: string) => wordAt(S, 1, word) - FOOTAGE_AT;
  const b = (name: string) => clip.boxes[name].box;
  const tFirst = at("first");
  const cams: Cam[] = [
    { t: 0, scale: 1.0, x: 0.5, y: 0.5 },
    { t: 0.6, scale: 1.22, x: 0.25, y: 0.62 },
    { t: at("withdraw") - 0.2, scale: 1.22, x: 0.25, y: 0.62 },
    { t: at("withdraw") + 0.5, scale: 1.3, x: 0.3, y: 0.38 },
    { t: tFirst - 0.6, scale: 1.3, x: 0.3, y: 0.38 },
    { t: tFirst + 0.1, scale: 1.22, x: 0.78, y: 0.5 },
  ];
  return (
    <>
      <Footage
        src="clips/lend.mp4"
        cams={cams}
        overlay={(cam) => (
          <>
            <Spotlight cam={cam} box={b("deposit")} at={at("earn") - 0.1} until={at("withdraw") - 0.1} label="Deposit MUSD, earn interest and fees" />
            <Spotlight cam={cam} box={b("instant")} at={at("instantly") - 0.3} until={tFirst - 0.4} label="Instant from idle MUSD" />
            <Spotlight cam={cam} box={b("queue")} at={tFirst - 0.1} until={30} label="First in, first out" />
          </>
        )}
      />
      <ClipSounds clip={clip} />
    </>
  );
};
