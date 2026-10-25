import { loadFont as loadSans } from "@remotion/google-fonts/InterTight";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

export const sans = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
export const mono = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily;

/** The app's palette (web/src/styles.css), so footage and motion graphics read as one product. */
export const C = {
  paper: "#f1f1ec",
  panel: "#ffffff",
  ink: "#0e0e0e",
  ink2: "#5a5a55",
  ink3: "#96968f",
  ruleSoft: "#dcdcd4",
  blue: "#1f3bff",
  blueSoft: "#e5e8ff",
  blueOnDark: "#6b7bff",
  pink: "#f2205f",
  pinkSoft: "#ffe2eb",
  onDark: "#b9b9b2",
};

export const W = 1920;
export const H = 1080;
export const FPS = 30;
