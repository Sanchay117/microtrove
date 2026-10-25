import { Audio, Sequence, staticFile } from "remotion";
import { f } from "../anim";
import type { Clip } from "../data";

/** A one-shot sound at `at` seconds (relative to the enclosing sequence). */
export const Sfx: React.FC<{ src: string; at: number; volume?: number }> = ({ src, at, volume = 1 }) => (
  <Sequence from={f(at)} layout="none">
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

/** The clicks and key presses recorded with a clip, offset by `at` seconds. */
export const ClipSounds: React.FC<{ clip: Clip; at?: number }> = ({ clip, at = 0 }) => (
  <>
    {clip.cues.map((c, i) =>
      c.kind === "cut" ? null : (
        <Sfx key={i} src={c.kind === "click" ? "sfx/click.wav" : "sfx/key.wav"} at={at + c.t} volume={c.kind === "click" ? 0.5 : 0.3} />
      ),
    )}
  </>
);
