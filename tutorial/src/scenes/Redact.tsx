import React from "react";
import { useCurrentFrame } from "remotion";
import { palette, type } from "../theme";
import { mono } from "../fonts";
import { Panel, Shell, prog, rise } from "../ui";

const rows = [
  { where: "request header", key: "Authorization", before: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.k3JxQ", after: "Bearer REDACTED_TOKEN_1", kind: "token" },
  { where: "request header", key: "Cookie", before: "sid=8f2c1e7ab94d03c6", after: "sid=REDACTED_COOKIE_1", kind: "cookie" },
  { where: "response body", key: "email", before: "dana@acme.dev", after: "user1@example.com", kind: "email" },
];

const swapAt = (i: number) => 70 + i * 52;

export const Redact: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();
  const done = rows.filter((_, i) => frame > swapAt(i) + 14).length;

  return (
    <Shell step="02" label="Redact" title="Secrets are stripped before anything is written or sent to a model" duration={duration}>
      <Panel
        title="session.har"
        right={
          <span style={{ color: done === rows.length ? palette.accent : palette.muted }}>
            {done} of {rows.length} secrets redacted
          </span>
        }
        style={{ ...rise(prog(frame, 10, 26), 30) }}
      >
        <div style={{ padding: "26px 0" }}>
          {rows.map((r, i) => {
            const enter = prog(frame, 22 + i * 10, 20);
            const scan = prog(frame, swapAt(i), 26);
            const swapped = prog(frame, swapAt(i) + 10, 12);
            return (
              <div
                key={r.key}
                style={{
                  position: "relative",
                  height: 132,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 40px",
                  borderBottom: i < rows.length - 1 ? `1px solid ${palette.line}66` : undefined,
                  ...rise(enter, 16),
                }}
              >
                <div style={{ width: 400 }}>
                  <div style={{ fontFamily: mono, fontSize: type.md, color: palette.text }}>{r.key}</div>
                  <div style={{ fontSize: type.xs, color: palette.muted, marginTop: 6 }}>{r.where}</div>
                </div>
                <div style={{ position: "relative", flex: 1, height: 72 }}>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 24px",
                      borderRadius: 12,
                      background: `${palette.red}${swapped > 0.5 ? "00" : "14"}`,
                      border: `1.5px solid ${palette.red}55`,
                      fontFamily: mono,
                      fontSize: type.md,
                      color: palette.red,
                      opacity: 1 - swapped,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.before}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 24px",
                      borderRadius: 12,
                      background: `${palette.accent}12`,
                      border: `1.5px solid ${palette.accent}55`,
                      fontFamily: mono,
                      fontSize: type.md,
                      color: palette.accent,
                      opacity: swapped,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.after}
                  </div>
                  {/* scan bar */}
                  <div
                    style={{
                      position: "absolute",
                      top: -6,
                      bottom: -6,
                      width: 5,
                      borderRadius: 3,
                      left: `${scan * 100}%`,
                      background: palette.text,
                      boxShadow: `0 0 24px 6px ${palette.accent}88`,
                      opacity: scan > 0 && scan < 1 ? 1 : 0,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <div style={{ display: "flex", gap: 28, marginTop: 36 }}>
        {[
          ["On by default", "tokens, cookies, API keys, passwords, emails"],
          ["Stable placeholders", "the same secret always maps to the same name, so the auth flow can still be traced"],
        ].map(([head, body], i) => (
          <div
            key={head}
            style={{
              flex: 1,
              padding: "24px 28px",
              borderRadius: 16,
              border: `1.5px solid ${palette.line}`,
              background: palette.panel,
              ...rise(prog(frame, swapAt(2) + 36 + i * 10, 24), 18),
            }}
          >
            <div style={{ fontSize: type.sm, fontWeight: 600 }}>{head}</div>
            <div style={{ fontSize: type.sm, color: palette.muted, marginTop: 8, lineHeight: 1.35 }}>{body}</div>
          </div>
        ))}
      </div>
    </Shell>
  );
};
