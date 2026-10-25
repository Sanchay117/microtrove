import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, f } from "../anim";
import { Footage, Spotlight, WIN, type Cam } from "../components/Footage";
import { ClipSounds, Sfx } from "../components/Sfx";
import { clips, lineAt, wordAt, type Box } from "../data";
import { C } from "../theme";

const S = "borrow";
const clip = clips.borrow;
const box = (name: string) => clip.boxes[name].box;
const short = (hash: string) => `${hash.slice(0, 6)}…${hash.slice(-4)}`;

/** The live app: a 25 MUSD loan against $50 of BTC, opened for real on Mezo Testnet. */
export const Borrow: React.FC = () => {
  const frame = useCurrentFrame();
  const cut = clip.cues.find((c) => c.kind === "cut")!.t;
  const l1 = lineAt(S, 1);
  const l2 = lineAt(S, 2);
  const tFifty = wordAt(S, 0, "$50");
  const tRate = wordAt(S, 0, "5%");
  const tSee = wordAt(S, 1, "see");
  const tLive = wordAt(S, 2, "live");

  const cams: Cam[] = [
    { t: 0, scale: 1, x: 0.5, y: 0.5 },
    { t: 2.7, scale: 1, x: 0.5, y: 0.5 },
    { t: 3.4, scale: 1.3, x: 0.3, y: 0.42 },
    { t: tFifty - 0.3, scale: 1.3, x: 0.66, y: 0.45 },
    { t: tRate - 0.5, scale: 1.3, x: 0.2, y: 0.12 },
    { t: l1.start + 0.4, scale: 1.3, x: 0.2, y: 0.12 },
    { t: l1.start + 1.0, scale: 1.25, x: 0.36, y: 0.52 },
    { t: tSee, scale: 1.3, x: 0.7, y: 0.72 },
    { t: l2.start - 0.3, scale: 1.3, x: 0.7, y: 0.72 },
    { t: l2.start + 0.3, scale: 1.2, x: 0.3, y: 0.6 },
    { t: cut, scale: 1.2, x: 0.3, y: 0.6 },
    { t: cut + 1 / 30, scale: 1.0, x: 0.5, y: 0.45 },
    { t: tLive - 0.6, scale: 1.08, x: 0.5, y: 0.42 },
  ];

  const rate: Box = [box("rate")[0], 0.075, box("rate")[2], box("rate")[3]];
  const flash = frame < f(cut) ? 0 : interpolate(frame, [f(cut), f(cut) + 9], [1, 0], CLAMP);

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Footage
        src="clips/borrow.mp4"
        cams={cams}
        overlay={(cam) => (
          <>
            <Spotlight cam={cam} box={box("value")} at={tFifty - 0.1} until={tRate - 0.6} label="$50 of BTC locked" />
            <Spotlight cam={cam} box={rate} at={tRate - 0.3} until={l1.start + 0.5} label="Fixed for 90 days" />
            <Spotlight cam={cam} box={box("owe")} at={tSee - 0.1} until={l2.start - 0.1} label="Debt, due date, liquidation price" />
            <Spotlight
              cam={cam}
              box={box("trove")}
              at={tLive - 0.2}
              until={30}
              dim={false}
              label={`Live on Mezo Testnet · tx ${short(clip.tx ?? "")}`}
            />
          </>
        )}
      />
      {/* A paper flash hides the jump from the click to the confirmed loan. */}
      <div style={{ position: "absolute", left: WIN.x, top: WIN.y, width: WIN.w, height: WIN.h, background: C.paper, opacity: flash, pointerEvents: "none" }} />
      <ClipSounds clip={clip} />
      <Sfx src="sfx/confirm.wav" at={cut} volume={0.5} />
    </AbsoluteFill>
  );
};
