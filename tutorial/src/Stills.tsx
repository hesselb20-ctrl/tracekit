import React from "react";
import { AbsoluteFill } from "remotion";
import { palette, type } from "./theme";
import { mono, sans } from "./fonts";
import { clusterCounts, clusters, rawCalls } from "./data";
import { Arrow, Mark, MethodTag, Path, methodColor } from "./ui";

const StillBg: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ backgroundColor: palette.bg, fontFamily: sans, color: palette.text, ...style }}>
    <AbsoluteFill
      style={{ background: `radial-gradient(1000px 520px at 72% 50%, ${palette.panelHi}88 0%, ${palette.bg}00 70%)` }}
    />
    {children}
  </AbsoluteFill>
);

const OutCard: React.FC<{ name: string; note: string }> = ({ name, note }) => (
  <div
    style={{
      width: 330,
      borderRadius: 16,
      border: `1.5px solid ${palette.line}`,
      background: palette.panel,
      padding: "18px 24px",
    }}
  >
    <div style={{ fontFamily: mono, fontSize: type.sm, color: palette.accent, fontWeight: 500 }}>{name}</div>
    <div style={{ fontSize: type.xs, color: palette.muted, marginTop: 6 }}>{note}</div>
  </div>
);

/** README hero, 1600x800. */
export const Hero: React.FC = () => (
  <StillBg>
    <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", padding: "0 90px", gap: 56 }}>
      <div style={{ width: 700, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <Mark size={104} />
          <div style={{ fontSize: type.display, fontWeight: 700, letterSpacing: -4 }}>tracekit</div>
        </div>
        <div style={{ fontSize: type.lg, fontWeight: 600, letterSpacing: -1, marginTop: 40, lineHeight: 1.2 }}>
          Record a session.
          <br />
          <span style={{ color: palette.accent }}>Ship an agent tool.</span>
        </div>
        <div style={{ fontSize: type.sm, color: palette.muted, marginTop: 28, lineHeight: 1.45 }}>
          A HAR file in. An OpenAPI 3.1 spec, a typed TypeScript SDK and a ready-to-run MCP server out.
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 250,
            borderRadius: 16,
            border: `1.5px solid ${palette.line}`,
            background: palette.panel,
            padding: "20px 22px",
          }}
        >
          <div style={{ fontFamily: mono, fontSize: type.sm, color: palette.blue, fontWeight: 500 }}>session.har</div>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
            {rawCalls.slice(2, 7).map((c, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: methodColor[c.method] }} />
                <span style={{ fontFamily: mono, fontSize: type.xs * 0.9, color: palette.muted, whiteSpace: "nowrap" }}>
                  {c.path}
                </span>
              </div>
            ))}
          </div>
        </div>
        <Arrow width={56} />
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <OutCard name="openapi.yaml" note="OpenAPI 3.1 spec" />
          <OutCard name="sdk/" note="typed TypeScript SDK" />
          <OutCard name="mcp-server/" note="tools for Claude and other agents" />
        </div>
      </div>
    </AbsoluteFill>
  </StillBg>
);

const L = { x: 90, w: 520, rowH: 42, gap: 9, top: 234 };
const R = { x: 900, w: 610, cardH: 68, gap: 21, top: 234 };
const rowMid = (i: number) => L.top + i * (L.rowH + L.gap) + L.rowH / 2;
const cardMid = (j: number) => R.top + j * (R.cardH + R.gap) + R.cardH / 2;

/** README clustering figure, 1600x900. */
export const Clustering: React.FC = () => (
  <StillBg>
    <div style={{ position: "absolute", left: 90, top: 64 }}>
      <div style={{ fontSize: type.lg, fontWeight: 600, letterSpacing: -0.8 }}>Endpoint clustering</div>
      <div style={{ fontSize: type.sm, color: palette.muted, marginTop: 10 }}>
        Raw URLs from the recording collapse into templated endpoints.
      </div>
    </div>
    <div style={{ position: "absolute", left: L.x, top: 190, fontFamily: mono, fontSize: type.xs, color: palette.muted, letterSpacing: 2 }}>
      {rawCalls.length} RECORDED REQUESTS
    </div>
    <div style={{ position: "absolute", left: R.x, top: 190, fontFamily: mono, fontSize: type.xs, color: palette.muted, letterSpacing: 2 }}>
      {clusters.length} ENDPOINTS
    </div>

    <svg width={1600} height={900} style={{ position: "absolute", inset: 0 }}>
      {rawCalls.map((r, i) => {
        const x1 = L.x + L.w + 6;
        const x2 = R.x - 6;
        const y1 = rowMid(i);
        const y2 = cardMid(r.cluster);
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={i}
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke={methodColor[r.method]}
            strokeOpacity={0.55}
            strokeWidth={2.5}
          />
        );
      })}
    </svg>

    {rawCalls.map((r, i) => (
      <div
        key={i}
        style={{
          position: "absolute",
          left: L.x,
          top: L.top + i * (L.rowH + L.gap),
          width: L.w,
          height: L.rowH,
          borderRadius: 10,
          border: `1.5px solid ${palette.line}`,
          background: palette.panel,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          boxSizing: "border-box",
        }}
      >
        <MethodTag method={r.method} width={104} />
        <Path path={r.path} />
      </div>
    ))}

    {clusters.map((c, j) => (
      <div
        key={j}
        style={{
          position: "absolute",
          left: R.x,
          top: R.top + j * (R.cardH + R.gap),
          width: R.w,
          height: R.cardH,
          borderRadius: 14,
          border: `1.5px solid ${palette.line}`,
          background: palette.panelHi,
          display: "flex",
          alignItems: "center",
          padding: "0 22px",
          boxSizing: "border-box",
        }}
      >
        <MethodTag method={c.method} width={104} />
        <div style={{ flex: 1 }}>
          <Path path={c.path} />
        </div>
        <span style={{ fontFamily: mono, fontSize: type.xs, color: palette.accent, marginRight: 16 }}>{c.operationId}</span>
        <span
          style={{
            fontFamily: mono,
            fontSize: type.xs,
            color: palette.text,
            border: `1.5px solid ${palette.line}`,
            background: palette.bg,
            borderRadius: 9,
            padding: "4px 10px",
          }}
        >
          {"×"}
          {clusterCounts[j]}
        </span>
      </div>
    ))}
  </StillBg>
);
