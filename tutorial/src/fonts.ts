import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

const inter = loadInter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
const jb = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

export const sans = inter.fontFamily;
export const mono = jb.fontFamily;
