// Derives media/preview.gif from media/tutorial.mp4 with ffmpeg.
// The GIF plays the whole tutorial at 2x speed, 800 px wide, 10 fps.
// Run from tutorial/:  npm run gif

import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const media = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "media");
const input = join(media, "tutorial.mp4");
const output = join(media, "preview.gif");

const SPEED = 2;
const FPS = 10;
const WIDTH = 800;

const filter =
  `setpts=PTS/${SPEED},fps=${FPS},scale=${WIDTH}:-1:flags=lanczos,split[a][b];` +
  `[a]palettegen=max_colors=96:stats_mode=diff[p];` +
  `[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;

const res = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", input, "-filter_complex", filter, "-loop", "0", output], {
  stdio: "inherit",
});
if (res.status !== 0) process.exit(res.status ?? 1);
console.log(`wrote media/preview.gif (${(statSync(output).size / 1024 / 1024).toFixed(2)} MB)`);
