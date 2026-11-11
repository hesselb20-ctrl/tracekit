// The folder `tracekit build` writes. Shared by the video and the README SVG.

export interface TreeRow {
  name: string;
  depth: number;
  last: boolean; // last child of its parent
  parentLast?: boolean; // for depth 2: is the parent the last child of the root
  dir?: boolean;
  note?: string;
}

export const outputTree: TreeRow[] = [
  { name: "my-tool/", depth: 0, last: true, dir: true },
  { name: "openapi.yaml", depth: 1, last: false, note: "OpenAPI 3.1 spec" },
  { name: "tracekit.json", depth: 1, last: false, note: "endpoints, auth, call graph" },
  { name: "sdk/", depth: 1, last: false, dir: true, note: "typed TypeScript SDK" },
  { name: "index.ts", depth: 2, last: false, parentLast: false },
  { name: "client.ts", depth: 2, last: false, parentLast: false },
  { name: "types.ts", depth: 2, last: true, parentLast: false },
  { name: "mcp-server/", depth: 1, last: true, dir: true, note: "ready-to-run MCP server" },
  { name: "package.json", depth: 2, last: false, parentLast: true },
  { name: "index.js", depth: 2, last: false, parentLast: true },
  { name: "README.md", depth: 2, last: true, parentLast: true },
];
