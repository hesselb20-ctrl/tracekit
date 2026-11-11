import React from "react";
import { useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { rawCalls } from "../data";
import { Dot, MethodTag, Panel, Path, Shell, prog, rise } from "../ui";

const calls = rawCalls.slice(0, 9);
const rowAt = (i: number) => 34 + i * 27;

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: type.xs, color: palette.muted, marginBottom: 8 }}>{label}</div>
    <div
      style={{
        height: 60,
        borderRadius: 12,
        border: `1.5px solid ${palette.line}`,
        background: palette.bg,
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        fontSize: type.sm,
      }}
    >
      {value}
    </div>
  </div>
);

const Todo: React.FC<{ title: string; done: number; show: number }> = ({ title, done, show }) => (
  <div
    style={{
      height: 68 * show,
      opacity: show,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        height: 58,
        borderRadius: 12,
        border: `1.5px solid ${palette.line}`,
        background: palette.bg,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 20px",
        fontSize: type.sm,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          border: `2px solid ${done > 0.5 ? palette.accent : palette.muted}`,
          background: done > 0.5 ? palette.accent : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={16} height={16} viewBox="0 0 16 16" style={{ opacity: done }}>
          <path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke={palette.bg} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span style={{ color: done > 0.5 ? palette.muted : palette.text }}>{title}</span>
    </div>
  </div>
);

export const Record: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const loggedIn = prog(frame, rowAt(1) + 6, 18);
  const added = prog(frame, rowAt(3), 18);
  const checked = prog(frame, rowAt(5), 12);
  const removed = prog(frame, rowAt(7), 18);
  const saved = prog(frame, rowAt(8) + 34, 22);
  const blink = 0.45 + 0.55 * Math.abs(Math.sin(frame / 9));

  return (
    <Shell step="01" label="Record" title="Use your app while the browser records the session" duration={duration}>
      <div style={{ display: "flex", gap: 40, height: 760, ...rise(prog(frame, 10, 26), 30) }}>
        {/* Browser window */}
        <Panel style={{ width: 1010, display: "flex", flexDirection: "column" }}>
          <div
            style={{
              height: 64,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0 22px",
              background: palette.panelHi,
              borderBottom: `1.5px solid ${palette.line}`,
            }}
          >
            <Dot color={palette.line} size={14} />
            <Dot color={palette.line} size={14} />
            <Dot color={palette.line} size={14} />
            <div
              style={{
                marginLeft: 18,
                flex: 1,
                height: 38,
                borderRadius: 19,
                background: palette.bg,
                border: `1.5px solid ${palette.line}`,
                display: "flex",
                alignItems: "center",
                padding: "0 20px",
                fontFamily: mono,
                fontSize: type.xs,
                color: palette.muted,
              }}
            >
              localhost:4010
            </div>
          </div>
          <div style={{ position: "relative", flex: 1 }}>
            {/* Sign in */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                opacity: 1 - loggedIn,
              }}
            >
              <div style={{ width: 480 }}>
                <div style={{ fontSize: type.md, fontWeight: 600, marginBottom: 28 }}>Sign in</div>
                <Field label="Email" value="dana@acme.dev" />
                <Field label="Password" value="••••••••••" />
                <div
                  style={{
                    height: 60,
                    borderRadius: 12,
                    background: palette.accent,
                    color: palette.bg,
                    fontWeight: 600,
                    fontSize: type.sm,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: 8,
                    transform: `scale(${1 - 0.04 * prog(frame, rowAt(0) - 6, 6) * (1 - prog(frame, rowAt(0), 8))})`,
                  }}
                >
                  Sign in
                </div>
              </div>
            </div>
            {/* Todos */}
            <div style={{ position: "absolute", inset: 0, padding: "44px 64px", opacity: loggedIn }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: type.md, fontWeight: 600 }}>Todos</div>
                <div style={{ fontSize: type.xs, color: palette.muted }}>dana@acme.dev</div>
              </div>
              <div
                style={{
                  height: 58,
                  borderRadius: 12,
                  border: `1.5px dashed ${palette.line}`,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 20px",
                  fontSize: type.sm,
                  color: palette.muted,
                  margin: "26px 0 20px",
                }}
              >
                Add a todo
              </div>
              <Todo title="Record a HAR of the session" done={checked} show={1} />
              <Todo title="Check the redaction report" done={0} show={1 - removed} />
              <Todo title="Point Claude at the MCP server" done={0} show={1} />
              <Todo title="Write release notes" done={0} show={added} />
            </div>
          </div>
        </Panel>

        {/* Network panel */}
        <Panel
          style={{ flex: 1 }}
          title="Network"
          right={
            <span style={{ display: "flex", alignItems: "center", gap: 10, color: palette.red }}>
              <Dot color={palette.red} size={12} style={{ opacity: saved > 0.5 ? 0.3 : blink }} />
              {saved > 0.5 ? "Stopped" : "Recording"}
            </span>
          }
        >
          <div style={{ padding: "10px 0" }}>
            {calls.map((c, i) => {
              const p = prog(frame, rowAt(i), 16);
              return (
                <div
                  key={i}
                  style={{
                    height: 58,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 24px",
                    borderBottom: `1px solid ${palette.line}55`,
                    ...rise(p, 14),
                  }}
                >
                  <MethodTag method={c.method} />
                  <div style={{ flex: 1 }}>
                    <Path path={c.path} />
                  </div>
                  <span style={{ fontFamily: mono, fontSize: type.xs, color: palette.muted }}>{c.status}</span>
                </div>
              );
            })}
          </div>
          <div
            style={{
              margin: "22px 24px 0",
              height: 72,
              borderRadius: 14,
              border: `1.5px solid ${palette.blue}`,
              background: `${palette.blue}14`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 22px",
              ...rise(saved, 18),
            }}
          >
            <span style={{ fontFamily: mono, fontSize: type.sm, color: palette.blue, fontWeight: 500 }}>session.har</span>
            <span style={{ fontSize: type.xs, color: palette.muted }}>Saved, {calls.length} requests</span>
          </div>
        </Panel>
      </div>
    </Shell>
  );
};
