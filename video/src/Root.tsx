import { Composition, Still } from "remotion";
import { FPS, H, W } from "./theme";
import { Thumbnail } from "./Thumbnail";
import { TOTAL_FRAMES, Video } from "./Video";

export const Root: React.FC = () => (
  <>
    <Composition id="Microtrove" component={Video} durationInFrames={TOTAL_FRAMES} fps={FPS} width={W} height={H} />
    <Still id="Thumbnail" component={Thumbnail} width={W} height={H} />
  </>
);
