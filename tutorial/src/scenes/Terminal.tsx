import React from "react";
import { useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { Caret, Dot, Panel, Shell, prog, rise, typed } from "../ui";

const PROMPT = 'What is still open on my todo list? Add "Ship the tracekit demo".';
const T = { type: 24, call1: 108, res1: 134, call2: 176, res2: 202, answer: 244 };

const ToolCall: React.FC<{ p: number; tool: string; args?: string }> = ({ p, tool, args }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 30, ...rise(p, 12) }}>
    <Dot color={palette.accent} size={14} />
    <span>
      <span style={{ fontWeight: 700 }}>todo</span>
      <span style={{ color: palette.muted }}> - </span>
      <span style={{ fontWeight: 700 }}>{tool}</span>
      <span style={{ color: palette.muted }}> (MCP)</span>
      {args && <span style={{ color: palette.muted }}> {args}</span>}
    </span>
  </div>
);

const Result: React.FC<{ p: number; lines: React.ReactNode[] }> = ({ p, lines }) => (
  <div style={{ display: "flex", gap: 16, marginTop: 8, marginLeft: 6, ...rise(p, 10) }}>
    <svg width={24} height={32} viewBox="0 0 24 32" style={{ flexShrink: 0 }}>
      <path d="M4 2 V18 H20" fill="none" stroke={palette.muted} strokeWidth={2} />
    </svg>
    <div style={{ color: palette.muted }}>
      {lines.map((l, i) => (
        <div key={i} style={{ height: 38, whiteSpace: "nowrap" }}>
          {l}
        </div>
      ))}
    </div>
  </div>
);

export const Terminal: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const text = typed(PROMPT, frame, T.type, 1.05);
  const typing = text.length < PROMPT.length;
  const k = (s: string) => <span style={{ color: palette.blue }}>{s}</span>;
  const v = (s: string) => <span style={{ color: palette.text }}>{s}</span>;

  return (
    <Shell step="06" label="Use" title="Claude Code calls your app through the new MCP server" duration={duration}>
      <Panel
        title="Claude Code"
        right={<span>mcp: todo (7 tools)</span>}
        style={{ height: 760, ...rise(prog(frame, 8, 24), 24) }}
      >
        <div style={{ padding: "30px 40px", fontFamily: mono, fontSize: type.sm, lineHeight: 1.3 }}>
          <div
            style={{
              border: `1.5px solid ${palette.line}`,
              borderRadius: 12,
              padding: "16px 22px",
              display: "flex",
              alignItems: "center",
              background: palette.bg,
            }}
          >
            <span style={{ color: palette.muted, marginRight: 16 }}>&gt;</span>
            <span>{text}</span>
            {typing && <Caret frame={frame} />}
          </div>

          <ToolCall p={prog(frame, T.call1, 14)} tool="list_todos" />
          <Result
            p={prog(frame, T.res1, 16)}
            lines={[
              <>[{"{ "}{k("id")}: {v("17")}, {k("title")}: {v('"Record a HAR of the session"')}, {k("done")}: {v("true")}{" }"},</>,
              <>&nbsp;{"{ "}{k("id")}: {v("108")}, {k("title")}: {v('"Write release notes"')}, {k("done")}: {v("false")}{" }"}, ... 1 more]</>,
            ]}
          />

          <ToolCall p={prog(frame, T.call2, 14)} tool="create_todo" args='(title: "Ship the tracekit demo")' />
          <Result
            p={prog(frame, T.res2, 16)}
            lines={[
              <>{"{ "}{k("id")}: {v("109")}, {k("title")}: {v('"Ship the tracekit demo"')}, {k("done")}: {v("false")}{" }"}</>,
            ]}
          />

          <div style={{ display: "flex", gap: 16, marginTop: 34, ...rise(prog(frame, T.answer, 18), 12) }}>
            <Dot color={palette.text} size={14} style={{ marginTop: 9 }} />
            <div style={{ lineHeight: 1.5 }}>
              Two todos are still open: "Write release notes" and "Point Claude at the MCP
              <br />
              server". I added "Ship the tracekit demo" as todo 109.
            </div>
          </div>
        </div>
      </Panel>
    </Shell>
  );
};
