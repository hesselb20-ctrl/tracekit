import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { repoUrl } from "../data";
import { Mark, Panel, prog, rise } from "../ui";

const commands = [
  `git clone https://${repoUrl}`,
  "cd tracekit && npm install && npm run build",
  "npx tracekit build session.har --out ./my-tool",
];

export const Install: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const fade = prog(frame, 0, 14);
  return (
    <AbsoluteFill style={{ opacity: fade, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, ...rise(prog(frame, 6, 24), 20) }}>
        <Mark size={72} />
        <div style={{ fontSize: type.xl, fontWeight: 700, letterSpacing: -2 }}>tracekit</div>
      </div>
      <div style={{ fontSize: type.md, color: palette.muted, marginTop: 20, ...rise(prog(frame, 14, 24), 16) }}>
        Record a session. Ship an agent tool.
      </div>
      <Panel style={{ width: 1240, marginTop: 52, ...rise(prog(frame, 24, 26), 22) }}>
        <div style={{ padding: "22px 36px" }}>
          {commands.map((c, i) => (
            <div
              key={c}
              style={{
                height: 64,
                display: "flex",
                alignItems: "center",
                fontFamily: mono,
                fontSize: type.sm * 1.1,
                whiteSpace: "nowrap",
                ...rise(prog(frame, 40 + i * 14, 20), 10),
              }}
            >
              <span style={{ color: palette.accent, marginRight: 18 }}>$</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      </Panel>
      <div style={{ fontFamily: mono, fontSize: type.md, color: palette.blue, marginTop: 48, ...rise(prog(frame, 92, 24), 14) }}>
        {repoUrl}
      </div>
      <div style={{ fontSize: type.xs, color: palette.muted, marginTop: 18, opacity: prog(frame, 108, 24) }}>
        MIT licensed. For your own apps, or apps whose terms allow automation.
      </div>
    </AbsoluteFill>
  );
};
