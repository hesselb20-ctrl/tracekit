# tracekit tutorial and README media

A standalone [Remotion](https://www.remotion.dev) project. It is not part of the npm workspace, so install it on its own:

```bash
cd tutorial
npm install
```

Everything visual in the repo comes from here and shares one palette and type scale (`src/theme.ts`).

| Output | Source | Command (run in `tutorial/`) |
| --- | --- | --- |
| `media/tutorial.mp4` | `Tutorial` composition, 1920x1080, 30 fps, 76 s | `npm run render:video` |
| `media/preview.gif` | derived from the mp4 (2x speed, 800 px, 10 fps) | `npm run gif` |
| `media/hero.png`, `media/clustering.png` | `Hero` and `Clustering` stills | `npm run render:stills` |
| `media/how-it-works.svg`, `media/output-tree.svg` | `scripts/make-svgs.ts` | `npm run svg` |

## Preview

```bash
npm run studio
```

## Notes

- `render:video` renders a PNG sequence into `out/frames` and encodes it with ffmpeg (H.264, yuv420p, bt709 tags). ffmpeg must be on your PATH.
- The scenes live in `src/scenes`, in playback order: Title, Record, Redact, Cluster, Schema, Files, Terminal, Install. Scene lengths are set in `src/Root.tsx`.
- The request list, endpoints and output tree shown in the video are data in `src/data.ts` and `src/tree.ts`. They mirror the example in `/examples`.
- `npm run svg` needs a Node version that runs TypeScript directly (22.18 or newer).
- On Windows, a checkout in a very deep folder can push the bundled headless browser past the 260 character path limit and the render fails with `spawn ... ENOENT`. Move the repo to a shorter path, or pass a browser yourself: `npx remotion render ... --browser-executable="C:\path\to\chrome-headless-shell.exe"`.
