import React from "react";
import { useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { Arrow, Panel, Shell, prog, rise } from "../ui";

const samples = [
  { from: "GET /api/todos/17", values: ["17", '"Record a HAR of the session"', "true", '"2026-11-02T09:14:08Z"'] },
  { from: "GET /api/todos/42", values: ["42", '"Check the redaction report"', "false", '"2026-11-03T16:40:51Z"'] },
  { from: "GET /api/todos/108", values: ["108", '"Write release notes"', "false", '"2026-11-09T11:02:37Z"'] },
];
const keys = ["id", "title", "done", "createdAt"];
const inferred = ["{ type: integer }", "{ type: string }", "{ type: boolean }", "{ type: string, format: date-time }"];

const fieldAt = (k: number) => 56 + k * 46;
const requiredAt = fieldAt(keys.length) + 10;

const valueColor = (v: string) => (v.startsWith('"') ? palette.text : v === "true" || v === "false" ? palette.amber : palette.blue);

export const Schema: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const active = keys.findIndex((_, k) => frame >= fieldAt(k) && frame < fieldAt(k) + 46);
  const line = (indent: number, children: React.ReactNode, p: number, key: string) => (
    <div key={key} style={{ paddingLeft: indent * 30, height: 46, display: "flex", alignItems: "center", ...rise(p, 12) }}>
      {children}
    </div>
  );

  return (
    <Shell step="04" label="Infer" title="Response samples merge into one JSON Schema" duration={duration}>
      <div style={{ display: "flex", alignItems: "center", gap: 28, height: 760 }}>
        <div style={{ width: 780, display: "flex", flexDirection: "column", gap: 18 }}>
          {samples.map((s, i) => (
            <Panel key={s.from} title={`sample ${i + 1}  ${s.from}`} style={{ ...rise(prog(frame, 12 + i * 8, 24), 22) }}>
              <div style={{ padding: "12px 0" }}>
                {keys.map((k, j) => (
                  <div
                    key={k}
                    style={{
                      height: 38,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 24px",
                      fontFamily: mono,
                      fontSize: type.sm * 0.92,
                      background: active === j ? `${palette.accent}1c` : "transparent",
                      borderLeft: `4px solid ${active === j ? palette.accent : "transparent"}`,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: palette.muted, width: 170 }}>{k}:</span>
                    <span style={{ color: valueColor(s.values[j]!) }}>{s.values[j]}</span>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>

        <Arrow width={64} progress={prog(frame, 40, 20)} />

        <Panel title="components.schemas.Todo" style={{ flex: 1, ...rise(prog(frame, 30, 24), 22) }}>
          <div style={{ padding: "26px 32px", fontFamily: mono, fontSize: type.sm, minHeight: 420 }}>
            {line(0, <><span style={{ color: palette.muted }}>type:</span>&nbsp;object</>, prog(frame, 44, 16), "t")}
            {line(0, <span style={{ color: palette.muted }}>properties:</span>, prog(frame, 48, 16), "p")}
            {keys.map((k, j) =>
              line(
                1,
                <>
                  <span style={{ color: palette.text, width: 160, display: "inline-block" }}>{k}:</span>
                  <span style={{ color: palette.accent, whiteSpace: "nowrap" }}>{inferred[j]}</span>
                </>,
                prog(frame, fieldAt(j) + 8, 18),
                k,
              ),
            )}
            {line(
              0,
              <>
                <span style={{ color: palette.muted }}>required:</span>&nbsp;
                <span style={{ color: palette.amber }}>[id, title, done, createdAt]</span>
              </>,
              prog(frame, requiredAt, 18),
              "r",
            )}
          </div>
          <div
            style={{
              borderTop: `1.5px solid ${palette.line}`,
              padding: "20px 32px",
              fontSize: type.xs,
              color: palette.muted,
              lineHeight: 1.45,
              opacity: prog(frame, requiredAt + 22, 22),
            }}
          >
            A field is required when every sample has it. Types widen when samples disagree, and formats such as
            date-time, email and uuid are detected from the values.
          </div>
        </Panel>
      </div>
    </Shell>
  );
};
