import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { Arrow, Mark, easeInOut, prog, rise } from "../ui";

export const Title: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const fade = Math.min(prog(frame, 0, 14), 1 - prog(frame, duration - 14, 14, easeInOut));
  const outputs = ["OpenAPI 3.1", "TypeScript SDK", "MCP server"];
  return (
    <AbsoluteFill style={{ opacity: fade, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 32, ...rise(prog(frame, 6, 28), 30) }}>
        <Mark size={120} />
        <div style={{ fontSize: type.display, fontWeight: 700, letterSpacing: -4 }}>tracekit</div>
      </div>
      <div
        style={{
          fontSize: type.xl,
          fontWeight: 600,
          letterSpacing: -1.5,
          marginTop: 44,
          ...rise(prog(frame, 22, 28), 24),
        }}
      >
        Record a session. <span style={{ color: palette.accent }}>Ship an agent tool.</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 64 }}>
        <div
          style={{
            fontFamily: mono,
            fontSize: type.sm,
            color: palette.blue,
            border: `1.5px solid ${palette.line}`,
            background: palette.panel,
            borderRadius: 12,
            padding: "12px 22px",
            ...rise(prog(frame, 44, 22), 16),
          }}
        >
          session.har
        </div>
        <Arrow width={72} progress={prog(frame, 54, 18)} />
        {outputs.map((o, i) => (
          <div
            key={o}
            style={{
              fontFamily: mono,
              fontSize: type.sm,
              color: palette.text,
              border: `1.5px solid ${palette.line}`,
              background: palette.panel,
              borderRadius: 12,
              padding: "12px 22px",
              ...rise(prog(frame, 62 + i * 9, 22), 16),
            }}
          >
            {o}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
