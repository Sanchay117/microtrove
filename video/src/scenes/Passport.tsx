import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { CLAMP, f } from "../anim";
import { Footage, Spotlight, WIN, type Cam } from "../components/Footage";
import { ClipSounds, Sfx } from "../components/Sfx";
import { clips, lineAt, short, wordAt, type Box } from "../data";
import { C } from "../theme";

const S = "passport";
const clip = clips.passport;
const box = (name: string) => clip.boxes[name].box;

/** A Bitcoin wallet borrowing through Mezo Passport, recorded live on Mezo Testnet. */
export const Passport: React.FC = () => {
  const frame = useCurrentFrame();
  const cuts = clip.cues.filter((c) => c.kind === "cut").map((c) => c.t);
  const [connected, confirmed] = cuts;
  const l1 = lineAt(S, 1);
  const l2 = lineAt(S, 2);
  const w = (line: number, word: string) => wordAt(S, line, word);
  const tMenu = clip.boxes.group.t;
  const tSmart = w(1, "smart");
  const tOpens = w(1, "opens");
  const tRelayer = w(1, "relayer");
  const tBalances = clip.boxes.balances.t;

  const menuCam = (y: number) => ({ scale: 1.5, x: 0.76, y });
  const cams: Cam[] = [
    { t: 0, scale: 1, x: 0.5, y: 0.5 },
    { t: tMenu - 0.2, scale: 1, x: 0.5, y: 0.5 },
    { t: tMenu + 0.5, ...menuCam(0.3) },
    { t: connected, ...menuCam(0.3) },
    { t: connected + 0.6, ...menuCam(0.2) },
    { t: tOpens - 0.75, ...menuCam(0.2) },
    { t: tOpens - 0.15, scale: 1.3, x: 0.3, y: 0.66 },
    { t: confirmed, scale: 1.3, x: 0.3, y: 0.66 },
    { t: confirmed + 1 / 30, scale: 1.0, x: 0.5, y: 0.45 },
    { t: tRelayer - 0.4, scale: 1.08, x: 0.5, y: 0.4 },
    { t: tBalances - 0.2, scale: 1.08, x: 0.5, y: 0.4 },
    { t: tBalances + 0.4, ...menuCam(0.25) },
  ];

  // The Bitcoin address sits at the top of the connected menu, above "Your Mezo account".
  const btc = box("btc");
  const account = box("account");
  const wallet: Box = [btc[0], btc[1], btc[2], account[1] - 0.012];
  const flash = (at: number) => (frame < f(at) ? 0 : interpolate(frame, [f(at), f(at) + 9], [1, 0], CLAMP));

  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <Footage
        src="clips/passport.mp4"
        cams={cams}
        overlay={(cam) => (
          <>
            <Spotlight cam={cam} box={box("group")} at={w(0, "Mezo") - 0.2} until={l1.start - 0.05} label="Unisat · OKX Wallet · Xverse" side="left" />
            <Spotlight cam={cam} box={wallet} at={w(1, "signs") - 0.1} until={tSmart - 0.15} label="Your Bitcoin wallet" side="left" />
            <Spotlight cam={cam} box={account} at={tSmart - 0.1} until={tOpens - 0.8} label="Its smart account on Mezo" side="left" />
            <Spotlight
              cam={cam}
              box={box("trove")}
              at={tRelayer - 0.25}
              until={tBalances - 0.3}
              dim={false}
              label={`Sent by Mezo’s relayer · tx ${short(clip.tx ?? "")}`}
            />
            <Spotlight cam={cam} box={box("balances")} at={w(2, "account") - 0.2} until={l2.end + 1} label="Gas came out of this BTC" side="left" />
          </>
        )}
      />
      {/* A paper flash hides each jump while the wallet connects and while the loan confirms. */}
      <div
        style={{
          position: "absolute",
          left: WIN.x,
          top: WIN.y,
          width: WIN.w,
          height: WIN.h,
          background: C.paper,
          opacity: Math.max(flash(connected), flash(confirmed)),
          pointerEvents: "none",
        }}
      />
      <ClipSounds clip={clip} />
      <Sfx src="sfx/sign.wav" at={connected} volume={0.35} />
      <Sfx src="sfx/confirm.wav" at={confirmed} volume={0.5} />
    </AbsoluteFill>
  );
};
