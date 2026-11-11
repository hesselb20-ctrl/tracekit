import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { clusterCounts, clusters, rawCalls } from "../data";
import { MethodTag, Path, Shell, easeInOut, methodColor, prog, rise } from "../ui";

const ROW_H = 50;
const ROW_GAP = 12;
const ROW_W = 600;
const CARD_X = 880;
const CARD_W = 848;
const CARD_H = 88;
const CARD_GAP = 18;

const departAt = (i: number) => 46 + i * 13;
const FLIGHT = 28;
const namesAt = departAt(rawCalls.length - 1) + FLIGHT + 22;

const rowY = (i: number) => i * (ROW_H + ROW_GAP);
const cardY = (j: number) => j * (CARD_H + CARD_GAP);

export const Cluster: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  return (
    <Shell step="03" label="Cluster" title="Raw requests collapse into templated endpoints" duration={duration}>
      <div style={{ position: "relative", width: 1728, height: 760 }}>
        {/* Cluster cards */}
        {clusters.map((c, j) => {
          const members = rawCalls.map((r, i) => ({ r, i })).filter((m) => m.r.cluster === j);
          const arrived = members.filter((m) => frame >= departAt(m.i) + FLIGHT - 6).length;
          const first = departAt(members[0]!.i) + FLIGHT - 12;
          const show = prog(frame, first, 16);
          const lastArrival = Math.max(...members.map((m) => departAt(m.i) + FLIGHT - 6));
          const pulse = 1 - prog(frame, lastArrival, 18);
          const pulsing = frame >= first ? Math.max(0, pulse) : 0;
          const named = prog(frame, namesAt + j * 6, 18);
          return (
            <div
              key={j}
              style={{
                position: "absolute",
                left: CARD_X,
                top: cardY(j),
                width: CARD_W,
                height: CARD_H,
                borderRadius: 16,
                background: palette.panel,
                border: `1.5px solid ${palette.line}`,
                boxShadow: `0 0 0 ${3 * pulsing}px ${methodColor[c.method]}55`,
                display: "flex",
                alignItems: "center",
                padding: "0 26px",
                ...rise(show, 14),
              }}
            >
              <MethodTag method={c.method} width={112} />
              <div style={{ flex: 1 }}>
                <Path path={c.path} />
              </div>
              <span
                style={{
                  fontFamily: mono,
                  fontSize: type.sm,
                  color: palette.accent,
                  marginRight: 22,
                  opacity: named,
                  transform: `translateX(${(1 - named) * 12}px)`,
                }}
              >
                {c.operationId}
              </span>
              <span
                style={{
                  fontFamily: mono,
                  fontSize: type.xs,
                  color: palette.text,
                  background: palette.panelHi,
                  border: `1.5px solid ${palette.line}`,
                  borderRadius: 10,
                  padding: "6px 12px",
                  minWidth: 34,
                  textAlign: "center",
                }}
              >
                {"×"}
                {Math.max(arrived, 1) > clusterCounts[j]! ? clusterCounts[j] : Math.max(arrived, 1)}
              </span>
            </div>
          );
        })}

        {/* Raw rows: a ghost stays behind, the live row flies into its cluster */}
        {rawCalls.map((r, i) => {
          const enter = prog(frame, 14 + i * 2, 18);
          const fly = prog(frame, departAt(i), FLIGHT, easeInOut);
          const x = interpolate(fly, [0, 1], [0, CARD_X + 14]);
          const y = interpolate(fly, [0, 1], [rowY(i), cardY(r.cluster) + (CARD_H - ROW_H) / 2]);
          const rowStyle: React.CSSProperties = {
            position: "absolute",
            width: ROW_W,
            height: ROW_H,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            padding: "0 20px",
            border: `1.5px solid ${palette.line}`,
          };
          return (
            <React.Fragment key={i}>
              <div style={{ ...rowStyle, left: 0, top: rowY(i), opacity: 0.28 * enter, background: "transparent" }}>
                <MethodTag method={r.method} width={112} />
                <Path path={r.path} />
              </div>
              <div
                style={{
                  ...rowStyle,
                  left: x,
                  top: y,
                  background: palette.panelHi,
                  opacity: enter * (1 - prog(frame, departAt(i) + FLIGHT - 10, 10)),
                  borderColor: fly > 0 && fly < 1 ? methodColor[r.method] : palette.line,
                }}
              >
                <MethodTag method={r.method} width={112} />
                <Path path={r.path} />
              </div>
            </React.Fragment>
          );
        })}

        {/* Footer note */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: rowY(rawCalls.length) + 6,
            width: ROW_W,
            fontSize: type.xs,
            color: palette.muted,
            opacity: prog(frame, 30, 20),
          }}
        >
          {rawCalls.length} recorded requests
        </div>
        <div
          style={{
            position: "absolute",
            left: CARD_X,
            top: cardY(clusters.length) + 2,
            width: CARD_W,
            display: "flex",
            justifyContent: "space-between",
            fontSize: type.xs,
            color: palette.muted,
            opacity: prog(frame, namesAt + 30, 20),
          }}
        >
          <span>{clusters.length} endpoints, ids templated as {"{id}"}</span>
          <span>
            names by <span style={{ fontFamily: mono, color: palette.accent }}>claude-fable-5-2</span>
          </span>
        </div>
      </div>
    </Shell>
  );
};
