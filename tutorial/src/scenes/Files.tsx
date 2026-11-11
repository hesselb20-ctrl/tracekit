import React from "react";
import { useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { outputTree, type TreeRow } from "../tree";
import { Caret, Panel, Shell, prog, rise, typed } from "../ui";

const ROW = 54;
const INDENT = 46;
const CMD = "tracekit build session.har --out ./my-tool";
const treeAt = (i: number) => 74 + i * 11;

const Elbow: React.FC<{ x: number; last: boolean }> = ({ x, last }) => (
  <>
    <span style={{ position: "absolute", left: x, top: 0, width: 2, height: last ? ROW / 2 : ROW, background: palette.line }} />
    <span style={{ position: "absolute", left: x, top: ROW / 2 - 1, width: 24, height: 2, background: palette.line }} />
  </>
);

export const TreeLine: React.FC<{ row: TreeRow; noteWidth?: number }> = ({ row }) => (
  <div style={{ position: "relative", height: ROW, display: "flex", alignItems: "center" }}>
    {row.depth >= 1 && row.depth === 1 && <Elbow x={12} last={row.last} />}
    {row.depth === 2 && !row.parentLast && (
      <span style={{ position: "absolute", left: 12, top: 0, width: 2, height: ROW, background: palette.line }} />
    )}
    {row.depth === 2 && <Elbow x={12 + INDENT} last={row.last} />}
    <span
      style={{
        marginLeft: row.depth === 0 ? 0 : row.depth * INDENT,
        fontFamily: mono,
        fontSize: type.sm,
        fontWeight: row.dir ? 700 : 400,
        color: row.dir ? palette.accent : palette.text,
      }}
    >
      {row.name}
    </span>
    {row.note && (
      <span style={{ marginLeft: "auto", fontSize: type.xs, color: palette.muted, whiteSpace: "nowrap" }}>{row.note}</span>
    )}
  </div>
);

const yamlLines: [number, string, string][] = [
  [0, "openapi:", " 3.1.0"],
  [0, "paths:", ""],
  [1, "/api/todos/{id}:", ""],
  [2, "get:", ""],
  [3, "operationId:", " getTodo"],
  [3, "security:", " [{ bearerAuth: [] }]"],
  [3, "responses:", ""],
  [4, '"200":', ""],
  [5, "$ref:", ' "#/components/schemas/Todo"'],
];

export const Files: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const text = typed(CMD, frame, 18, 1.1);
  const typing = text.length < CMD.length;

  return (
    <Shell step="05" label="Generate" title="One command writes the spec, the SDK and the MCP server" duration={duration}>
      <Panel style={{ ...rise(prog(frame, 8, 24), 22) }}>
        <div style={{ height: 84, display: "flex", alignItems: "center", padding: "0 30px", fontFamily: mono, fontSize: type.md }}>
          <span style={{ color: palette.accent, marginRight: 18 }}>$</span>
          <span>{text}</span>
          {typing && <Caret frame={frame} />}
          <span style={{ marginLeft: "auto", fontSize: type.xs, color: palette.muted, opacity: prog(frame, treeAt(10) + 20, 20) }}>
            done, 7 operations
          </span>
        </div>
      </Panel>
      <div style={{ display: "flex", gap: 32, marginTop: 28 }}>
        <Panel style={{ width: 800, padding: "18px 34px", opacity: prog(frame, 64, 16) }}>
          {outputTree.map((row, i) => (
            <div key={i} style={{ opacity: prog(frame, treeAt(i), 14), transform: `translateX(${(1 - prog(frame, treeAt(i), 14)) * -14}px)` }}>
              <TreeLine row={row} />
            </div>
          ))}
        </Panel>
        <Panel title="my-tool/openapi.yaml" style={{ flex: 1, ...rise(prog(frame, treeAt(1) + 8, 22), 20) }}>
          <div style={{ padding: "22px 30px", fontFamily: mono, fontSize: type.sm * 0.92 }}>
            {yamlLines.map(([indent, k, v], i) => (
              <div
                key={i}
                style={{ height: 44, paddingLeft: indent * 26, whiteSpace: "nowrap", opacity: prog(frame, treeAt(1) + 22 + i * 7, 14) }}
              >
                <span style={{ color: k.startsWith("/") ? palette.amber : palette.muted }}>{k}</span>
                <span style={{ color: palette.text }}>{v}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </Shell>
  );
};
