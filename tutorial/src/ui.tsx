import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { palette, type } from "./theme";
import { mono, sans } from "./fonts";
import type { Method } from "./data";

export const ease = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 to 1 progress starting at `start`, lasting `dur` frames. */
export const prog = (frame: number, start: number, dur = 20, easing = ease) =>
  interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

export const rise = (p: number, dist = 28): React.CSSProperties => ({
  opacity: p,
  transform: `translateY(${(1 - p) * dist}px)`,
});

export const methodColor: Record<Method, string> = {
  GET: palette.blue,
  POST: palette.accent,
  PATCH: palette.amber,
  DELETE: palette.red,
};

export const Background: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: palette.bg, fontFamily: sans, color: palette.text }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(900px 520px at 50% 46%, ${palette.panelHi}66 0%, ${palette.bg}00 70%)`,
      }}
    />
    {children}
  </AbsoluteFill>
);

/** Scene wrapper: fades in and out, draws the step label and headline. */
export const Shell: React.FC<{
  step: string;
  label: string;
  title: string;
  duration: number;
  children: React.ReactNode;
}> = ({ step, label, title, duration, children }) => {
  const frame = useCurrentFrame();
  const fade = Math.min(prog(frame, 0, 14), 1 - prog(frame, duration - 14, 14, easeInOut));
  return (
    <AbsoluteFill style={{ opacity: fade, padding: "72px 96px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, ...rise(prog(frame, 2, 22), 16) }}>
        <span style={{ fontFamily: mono, fontSize: type.xs, color: palette.accent, letterSpacing: 2 }}>{step}</span>
        <span style={{ width: 36, height: 2, background: palette.line }} />
        <span style={{ fontFamily: mono, fontSize: type.xs, color: palette.muted, letterSpacing: 2 }}>
          {label.toUpperCase()}
        </span>
      </div>
      <div
        style={{
          fontSize: type.lg,
          fontWeight: 600,
          letterSpacing: -0.8,
          marginTop: 14,
          ...rise(prog(frame, 6, 24), 18),
        }}
      >
        {title}
      </div>
      <div style={{ position: "relative", flex: 1, marginTop: 40 }}>{children}</div>
    </AbsoluteFill>
  );
};

export const Panel: React.FC<{
  style?: React.CSSProperties;
  children?: React.ReactNode;
  title?: string;
  right?: React.ReactNode;
}> = ({ style, children, title, right }) => (
  <div
    style={{
      background: palette.panel,
      border: `1.5px solid ${palette.line}`,
      borderRadius: 18,
      overflow: "hidden",
      boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
      ...style,
    }}
  >
    {title !== undefined && (
      <div
        style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          borderBottom: `1.5px solid ${palette.line}`,
          background: palette.panelHi,
          fontFamily: mono,
          fontSize: type.xs,
          color: palette.muted,
        }}
      >
        <span>{title}</span>
        {right}
      </div>
    )}
    {children}
  </div>
);

export const MethodTag: React.FC<{ method: Method; size?: number; width?: number }> = ({
  method,
  size = type.sm,
  width = 104,
}) => (
  <span
    style={{
      fontFamily: mono,
      fontWeight: 700,
      fontSize: size * 0.8,
      color: methodColor[method],
      width,
      display: "inline-block",
      letterSpacing: 0.5,
      flexShrink: 0,
    }}
  >
    {method}
  </span>
);

/** Path with the id-like segment (number or {param}) picked out in amber. */
export const Path: React.FC<{ path: string; size?: number }> = ({ path, size = type.sm }) => {
  const parts = path.split("/").filter(Boolean);
  return (
    <span style={{ fontFamily: mono, fontSize: size, color: palette.text, whiteSpace: "nowrap" }}>
      {parts.map((p, i) => {
        const isParam = /^\d+$/.test(p) || p.startsWith("{");
        return (
          <span key={i}>
            <span style={{ color: palette.muted }}>/</span>
            <span
              style={
                isParam
                  ? {
                      color: palette.amber,
                      background: "rgba(245,185,74,0.14)",
                      borderRadius: 6,
                      padding: "1px 5px",
                    }
                  : undefined
              }
            >
              {p}
            </span>
          </span>
        );
      })}
    </span>
  );
};

export const Arrow: React.FC<{ width?: number; color?: string; progress?: number }> = ({
  width = 80,
  color = palette.muted,
  progress = 1,
}) => (
  <svg width={width} height={24} viewBox={`0 0 ${width} 24`} style={{ opacity: progress, flexShrink: 0 }}>
    <line x1={2} y1={12} x2={width - 5} y2={12} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
    <path
      d={`M ${width - 14} 4 L ${width - 4} 12 L ${width - 14} 20`}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The tracekit mark: request dots traced into one line that ends in a tool node. */
export const Mark: React.FC<{ size?: number }> = ({ size = 96 }) => (
  <svg width={size} height={size} viewBox="0 0 96 96" style={{ flexShrink: 0 }}>
    <rect x={3} y={3} width={90} height={90} rx={22} fill={palette.panel} stroke={palette.line} strokeWidth={3} />
    <path
      d="M24 66 L40 40 L56 54 L72 30"
      fill="none"
      stroke={palette.accent}
      strokeWidth={5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx={24} cy={66} r={6} fill={palette.blue} />
    <circle cx={40} cy={40} r={6} fill={palette.blue} />
    <circle cx={56} cy={54} r={6} fill={palette.blue} />
    <circle cx={72} cy={30} r={8} fill={palette.accent} />
  </svg>
);

export const Dot: React.FC<{ color: string; size?: number; style?: React.CSSProperties }> = ({
  color,
  size = 12,
  style,
}) => (
  <span
    style={{
      width: size,
      height: size,
      borderRadius: size,
      background: color,
      display: "inline-block",
      flexShrink: 0,
      ...style,
    }}
  />
);

export const typed = (text: string, frame: number, start: number, cps = 1.4) =>
  text.slice(0, Math.max(0, Math.floor((frame - start) * cps)));

export const Caret: React.FC<{ frame: number; color?: string }> = ({ frame, color = palette.accent }) => (
  <span
    style={{
      display: "inline-block",
      width: 12,
      height: "1.05em",
      marginLeft: 3,
      verticalAlign: "text-bottom",
      background: color,
      opacity: Math.floor(frame / 15) % 2 === 0 ? 1 : 0.15,
    }}
  />
);
