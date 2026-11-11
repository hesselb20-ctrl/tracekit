// Writes the two README diagrams into /media.
// Run from the repo root:  node tutorial/scripts/make-svgs.ts
// (Node 22.18+ / 24+ strips the types natively.)

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { palette, svgFonts, type } from "../src/theme.ts";
import { outputTree } from "../src/tree.ts";

const here = dirname(fileURLToPath(import.meta.url));
const mediaDir = join(here, "..", "..", "media");
mkdirSync(mediaDir, { recursive: true });

// Both SVGs use a 1200-unit wide viewBox. GitHub shows READMEs about 830 px wide,
// so one unit is ~0.69 px. The type scale steps are scaled up to keep the smallest
// text at ~14 px on the page.
const K = 20 / type.xs;
const fs = {
  xs: Math.round(type.xs * K), // 20 -> ~14 px
  sm: Math.round(type.sm * K), // 27 -> ~18 px
  md: Math.round(type.md * K), // 36 -> ~25 px
};
const W = 1200;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface TextOpts {
  size?: number;
  fill?: string;
  mono?: boolean;
  weight?: number;
  anchor?: "start" | "middle" | "end";
}

const text = (x: number, y: number, s: string, o: TextOpts = {}) =>
  `<text x="${x}" y="${y}" font-family="${o.mono ? svgFonts.mono : svgFonts.sans}" font-size="${o.size ?? fs.xs}" ` +
  `font-weight="${o.weight ?? 400}" fill="${o.fill ?? palette.text}" text-anchor="${o.anchor ?? "start"}">${esc(s)}</text>`;

const box = (x: number, y: number, w: number, h: number, fill: string = palette.panel, stroke: string = palette.line, rx = 14) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;

const frame = (h: number, title: string, desc: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" role="img" aria-labelledby="t d">\n` +
  `<title id="t">${esc(title)}</title>\n<desc id="d">${esc(desc)}</desc>\n` +
  `<rect width="${W}" height="${h}" rx="24" fill="${palette.bg}"/>\n${body}\n</svg>\n`;

/** Straight arrow from (x1,y) to (x2,y). */
const arrow = (x1: number, y: number, x2: number, color: string = palette.muted) =>
  `<path d="M ${x1} ${y} H ${x2 - 3}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" fill="none"/>` +
  `<path d="M ${x2 - 11} ${y - 8} L ${x2 - 2} ${y} L ${x2 - 11} ${y + 8}" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

// ---------------------------------------------------------------- how-it-works

function howItWorks(): string {
  const H = 520;
  const parts: string[] = [];
  parts.push(text(48, 68, "How it works", { size: fs.md, weight: 600 }));
  parts.push(text(48, 104, "One recorded session in, three artifacts out. Secrets are removed before anything is written.", { fill: palette.muted }));

  const stages = [
    { name: "HAR", color: palette.blue, lines: ["recorded", "session"] },
    { name: "Redact", color: palette.red, lines: ["tokens, keys,", "cookies, email"] },
    { name: "Cluster", color: palette.amber, lines: ["/users/123", "/users/{id}"] },
    { name: "Infer", color: palette.accent, lines: ["schemas, auth,", "call order"] },
  ];
  const sw = 176;
  const gap = 32;
  const sh = 150;
  const x0 = 48;
  const midY = 318;
  const sy = midY - sh / 2;

  stages.forEach((s, i) => {
    const x = x0 + i * (sw + gap);
    parts.push(box(x, sy, sw, sh));
    parts.push(`<rect x="${x + 20}" y="${sy + 24}" width="34" height="6" rx="3" fill="${s.color}"/>`);
    parts.push(text(x + 20, sy + 70, s.name, { size: fs.sm, weight: 600 }));
    s.lines.forEach((l, j) =>
      parts.push(
        text(x + 20, sy + 103 + j * 27, l, {
          fill: s.name === "Cluster" && j === 1 ? palette.amber : palette.muted,
          mono: s.name === "Cluster",
          size: s.name === "Cluster" ? fs.xs - 1 : fs.xs,
        }),
      ),
    );
    if (i < stages.length - 1) parts.push(arrow(x + sw + 8, midY, x + sw + gap - 6));
  });

  // Fan-out to the three outputs.
  const ox = x0 + stages.length * (sw + gap) + 18;
  const ow = W - 48 - ox;
  const oh = 96;
  const ogap = 22;
  const outputs = [
    { name: "openapi.yaml", note: "OpenAPI 3.1 spec" },
    { name: "sdk/", note: "TypeScript SDK" },
    { name: "mcp-server/", note: "MCP server" },
  ];
  const oy0 = midY - (outputs.length * oh + (outputs.length - 1) * ogap) / 2;
  const fromX = x0 + (stages.length - 1) * (sw + gap) + sw + 8;
  outputs.forEach((o, i) => {
    const y = oy0 + i * (oh + ogap);
    const cy = y + oh / 2;
    const toX = ox - 8;
    const mx = (fromX + toX) / 2;
    parts.push(
      `<path d="M ${fromX} ${midY} C ${mx} ${midY}, ${mx} ${cy}, ${toX - 10} ${cy}" stroke="${palette.accent}" stroke-opacity="0.8" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
    );
    parts.push(
      `<path d="M ${toX - 11} ${cy - 8} L ${toX - 2} ${cy} L ${toX - 11} ${cy + 8}" stroke="${palette.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
    );
    parts.push(box(ox, y, ow, oh, palette.panelHi));
    parts.push(text(ox + 22, y + 42, o.name, { size: fs.sm - 3, mono: true, fill: palette.accent, weight: 600 }));
    parts.push(text(ox + 22, y + 72, o.note, { fill: palette.muted }));
  });

  parts.push(
    text(48, H - 34, "Operation names and tool descriptions are written by Claude, from redacted data only.", { fill: palette.muted }),
  );

  return frame(
    H,
    "How tracekit works",
    "Pipeline: a HAR file is redacted, requests are clustered into templated endpoints, schemas, auth and call order are inferred, and an OpenAPI spec, a TypeScript SDK and an MCP server are generated.",
    parts.join("\n"),
  );
}

// ----------------------------------------------------------------- output-tree

function tree(): string {
  const rowH = 46;
  const top = 136;
  const H = top + outputTree.length * rowH + 34;
  const x0 = 64;
  const indent = 44;
  const parts: string[] = [];
  parts.push(text(48, 68, "What tracekit build writes", { size: fs.md, weight: 600 }));
  parts.push(text(48, 104, "tracekit build session.har --out ./my-tool", { fill: palette.muted, mono: true }));
  parts.push(box(48, top - 22, W - 96, outputTree.length * rowH + 28));

  outputTree.forEach((row, i) => {
    const cy = top + i * rowH + rowH / 2;
    const y0 = top + i * rowH;
    const line = (x: number, last: boolean) =>
      `<path d="M ${x} ${y0} V ${last ? cy : y0 + rowH} M ${x} ${cy} H ${x + 22}" stroke="${palette.line}" stroke-width="2" fill="none"/>`;
    if (row.depth === 1) parts.push(line(x0 + 12, row.last));
    if (row.depth === 2) {
      if (!row.parentLast) parts.push(`<path d="M ${x0 + 12} ${y0} V ${y0 + rowH}" stroke="${palette.line}" stroke-width="2" fill="none"/>`);
      parts.push(line(x0 + 12 + indent, row.last));
    }
    const tx = x0 + (row.depth === 0 ? 0 : row.depth * indent);
    parts.push(
      text(tx, cy + 8, row.name, {
        mono: true,
        size: fs.sm - 3,
        fill: row.dir ? palette.accent : palette.text,
        weight: row.dir ? 700 : 400,
      }),
    );
    if (row.note) parts.push(text(W - 80, cy + 7, row.note, { fill: palette.muted, anchor: "end" }));
  });

  return frame(
    H,
    "Generated folder structure",
    "my-tool contains openapi.yaml, tracekit.json, an sdk folder with index.ts, client.ts and types.ts, and an mcp-server folder with package.json, index.js and README.md.",
    parts.join("\n"),
  );
}

const files: [string, string][] = [
  ["how-it-works.svg", howItWorks()],
  ["output-tree.svg", tree()],
];
for (const [name, svg] of files) {
  writeFileSync(join(mediaDir, name), svg);
  console.log(`wrote media/${name} (${svg.length} bytes)`);
}
