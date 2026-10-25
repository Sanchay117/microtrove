import { AbsoluteFill, Audio, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { CLAMP, f } from "./anim";
import { Captions } from "./components/Captions";
import { Chrome } from "./components/Chrome";
import { timing, type TimedScene } from "./data";
import { Borrow } from "./scenes/Borrow";
import { Keepers } from "./scenes/Keepers";
import { Lenders } from "./scenes/Lenders";
import { Mezo } from "./scenes/Mezo";
import { Open } from "./scenes/Open";
import { Outro } from "./scenes/Outro";
import { Promote } from "./scenes/Promote";
import { Proof } from "./scenes/Proof";
import { Rfc } from "./scenes/Rfc";
import { Shipped } from "./scenes/Shipped";
import { C, FPS } from "./theme";

// `label` names the section in the header for scenes without a kicker of their own; `chrome: false` hides it.
const SCENES: Record<string, { comp: React.FC; label?: string; chrome?: false }> = {
  open: { comp: Open },
  rfc: { comp: Rfc, label: "RFC-2" },
  borrow: { comp: Borrow, label: "Borrow" },
  lenders: { comp: Lenders },
  keepers: { comp: Keepers },
  proof: { comp: Proof },
  promote: { comp: Promote },
  mezo: { comp: Mezo },
  shipped: { comp: Shipped },
  outro: { comp: Outro, chrome: false },
};

// Lines whose words are already on screen as a headline.
const NO_CAPTION = new Set(["audio/open-1.wav", "audio/rfc-2.wav", "audio/outro-1.wav"]);

const STARTS = timing.scenes.reduce<number[]>((acc, s, i) => [...acc, i === 0 ? 0 : acc[i - 1] + timing.scenes[i - 1].frames], []);
const VOICE = timing.scenes.flatMap((s, i) => s.lines.map((l) => [STARTS[i] / FPS + l.start, STARTS[i] / FPS + l.start + l.seconds] as const));
const LAST_WORD = VOICE[VOICE.length - 1][1];

/** Music sits under the voice: ducked while a line is spoken, up in the gaps and after the last line. */
function musicVolume(frame: number): number {
  const t = frame / FPS;
  let duck = 0;
  for (const [a, b] of VOICE) {
    if (t < a - 0.3 || t > b + 0.45) continue;
    duck = Math.max(duck, Math.min(1, (t - (a - 0.3)) / 0.3, (b + 0.45 - t) / 0.45));
  }
  const tail = interpolate(t, [LAST_WORD, LAST_WORD + 0.8], [0, 1], CLAMP);
  return 0.2 - 0.11 * duck + 0.08 * tail;
}

/** A blue panel sweeps across each cut, Swiss-poster style; the cut happens while it covers the frame. */
const Wipe: React.FC = () => {
  const frame = useCurrentFrame();
  const n = 8;
  const x = frame < n ? interpolate(frame, [0, n], [-100, 0], CLAMP) : interpolate(frame, [n, 2 * n], [0, 100], CLAMP);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, background: C.blue, transform: `translateX(${x}%)` }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, width: 28, left: `${x + 100}%`, background: C.ink, transform: "translateX(-100%)" }} />
    </AbsoluteFill>
  );
};

const Scene: React.FC<{ scene: TimedScene; index: number }> = ({ scene, index }) => {
  const { comp: Comp, label, chrome } = SCENES[scene.id];
  return (
    <>
      <Comp />
      {chrome !== false && <Chrome index={index + 1} total={timing.scenes.length - 1} label={label} />}
      <Captions scene={scene} skip={NO_CAPTION} />
      {scene.lines.map((l) => (
        <Sequence key={l.file} from={f(l.start)} layout="none">
          <Audio src={staticFile(l.file)} />
        </Sequence>
      ))}
    </>
  );
};

export const Video: React.FC = () => (
  <AbsoluteFill style={{ background: C.paper }}>
    {timing.scenes.map((s, i) => (
      <Sequence key={s.id} from={STARTS[i]} durationInFrames={s.frames} name={s.id}>
        <Scene scene={s} index={i} />
      </Sequence>
    ))}
    {STARTS.slice(1).map((st) => (
      <Sequence key={st} from={st - 8} durationInFrames={16} name="wipe">
        <Wipe />
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.16} />
      </Sequence>
    ))}
    <Audio src={staticFile("music/bed.wav")} volume={musicVolume} />
  </AbsoluteFill>
);

export const TOTAL_FRAMES = timing.scenes.reduce((n, s) => n + s.frames, 0);
