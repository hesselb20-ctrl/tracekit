import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.js";
import { Redactor, redactHar, redactText } from "../src/redact.js";
import type { Har, HarEntry } from "../src/types.js";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLXNpZ25hdHVyZQ";
const SESSION = "s%3Aq9Zk2nV7xw1LrT5b.8dJf0aP3";
const EMAIL = "ada.lovelace@acme-corp.io";
const PASSWORD = "correct horse battery staple";
const API_KEY = "sk_live_51Hx9aBcDeFgHiJkLmNoP";

function entry(partial: {
  method?: string;
  url: string;
  reqHeaders?: Record<string, string>;
  reqBody?: unknown;
  status?: number;
  resHeaders?: Record<string, string>;
  resBody?: unknown;
  at: number;
}): HarEntry {
  const pairs = (h: Record<string, string> = {}) => Object.entries(h).map(([name, value]) => ({ name, value }));
  return {
    startedDateTime: new Date(Date.UTC(2026, 10, 11, 9, 0, partial.at)).toISOString(),
    request: {
      method: partial.method ?? "GET",
      url: partial.url,
      headers: pairs(partial.reqHeaders),
      ...(partial.reqBody !== undefined
        ? { postData: { mimeType: "application/json", text: JSON.stringify(partial.reqBody) } }
        : {}),
    },
    response: {
      status: partial.status ?? 200,
      headers: pairs(partial.resHeaders),
      content: {
        mimeType: "application/json",
        text: partial.resBody === undefined ? "" : JSON.stringify(partial.resBody),
      },
    },
  };
}

function sampleHar(): Har {
  return {
    log: {
      version: "1.2",
      entries: [
        entry({
          at: 0,
          method: "POST",
          url: "https://app.example.test/api/login",
          reqBody: { email: EMAIL, password: PASSWORD },
          resHeaders: { "Set-Cookie": `sid=${SESSION}; Path=/; HttpOnly` },
          resBody: { token: TOKEN, user: { id: 7, email: EMAIL, name: "Ada" } },
        }),
        entry({
          at: 1,
          url: `https://app.example.test/api/todos?limit=10&api_key=${API_KEY}`,
          reqHeaders: { Authorization: `Bearer ${TOKEN}`, Cookie: `sid=${SESSION}; theme=dark`, "X-Api-Key": API_KEY },
          resBody: [{ id: 1, title: `Mail ${EMAIL}`, done: false }],
        }),
        entry({
          at: 2,
          url: `https://app.example.test/api/export/${TOKEN}`,
          reqHeaders: { Authorization: `Bearer ${TOKEN}` },
          resBody: { ok: true },
        }),
      ],
    },
  };
}

describe("redactHar", () => {
  const { har, report } = redactHar(sampleHar());
  const text = JSON.stringify(har);

  it("removes every secret from the output", () => {
    for (const secret of [TOKEN, SESSION, EMAIL, PASSWORD, API_KEY]) {
      expect(text).not.toContain(secret);
    }
  });

  it("keeps the auth scheme and cookie names readable", () => {
    const headers = har.log.entries[1]!.request.headers!;
    expect(headers.find((h) => h.name === "Authorization")!.value).toBe("Bearer REDACTED_TOKEN_1");
    expect(headers.find((h) => h.name === "Cookie")!.value).toMatch(/^sid=REDACTED_COOKIE_\d+; theme=REDACTED_COOKIE_\d+$/);
    expect(har.log.entries[0]!.response.headers![0]!.value).toMatch(/^sid=REDACTED_COOKIE_\d+; Path=\/; HttpOnly$/);
  });

  it("maps the same secret to the same placeholder everywhere", () => {
    const login = JSON.parse(har.log.entries[0]!.response.content!.text!);
    expect(login.token).toBe("REDACTED_TOKEN_1");
    expect(login.user.email).toBe("user1@example.com");
    const requestBody = JSON.parse(har.log.entries[0]!.request.postData!.text!);
    expect(requestBody).toEqual({ email: "user1@example.com", password: "REDACTED_PASSWORD_1" });
  });

  it("redacts sensitive query parameters but keeps ordinary ones", () => {
    const url = new URL(har.log.entries[1]!.request.url);
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("api_key")).toMatch(/^REDACTED_KEY_\d+$/);
  });

  it("sweeps secrets out of places no rule targets, such as the path", () => {
    expect(har.log.entries[2]!.request.url).toBe("https://app.example.test/api/export/REDACTED_TOKEN_1");
  });

  it("redacts emails embedded in ordinary strings", () => {
    const todos = JSON.parse(har.log.entries[1]!.response.content!.text!);
    expect(todos[0].title).toBe("Mail user1@example.com");
  });

  it("leaves non-secret data untouched", () => {
    const login = JSON.parse(har.log.entries[0]!.response.content!.text!);
    expect(login.user).toMatchObject({ id: 7, name: "Ada" });
  });

  it("does not modify its input", () => {
    const original = sampleHar();
    const before = JSON.stringify(original);
    redactHar(original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("reports what it replaced", () => {
    expect(report.enabled).toBe(true);
    expect(report.total).toBeGreaterThan(0);
    expect(Object.keys(report.byKind).sort()).toEqual(["cookie", "email", "key", "password", "token"]);
  });

  it("is idempotent", () => {
    expect(JSON.stringify(redactHar(har).har)).toBe(text);
  });
});

describe("Redactor", () => {
  it("handles Basic credentials and form bodies", () => {
    const r = new Redactor();
    expect(r.header("Authorization", "Basic YWRhOnNlY3JldA==")).toBe("Basic REDACTED_CREDENTIAL_1");
    expect(r.body("user=ada&password=hunter2&remember=1", "application/x-www-form-urlencoded")).toBe(
      "user=ada&password=REDACTED_PASSWORD_1&remember=1",
    );
  });

  it("redacts nested and array values under sensitive keys", () => {
    const r = new Redactor();
    expect(r.json({ auth: { access_token: "abc123456", refreshToken: "def987654" }, apiKeys: ["k1", "k2"] })).toEqual({
      auth: { access_token: "REDACTED_TOKEN_1", refreshToken: "REDACTED_TOKEN_2" },
      apiKeys: ["k1", "k2"],
    });
  });

  it("does not treat lookalike field names as secrets", () => {
    const r = new Redactor();
    const value = { keyboard: "qwerty", tokenCount: 12, author: "Ada", monkey: "see" };
    expect(r.json(value)).toEqual(value);
  });
});

describe("redactText", () => {
  it("catches bearer strings, JWTs, key prefixes and emails in free text", () => {
    const out = redactText(`curl -H "Authorization: Bearer ${TOKEN}" -d key=${API_KEY} # ask ${EMAIL}`);
    expect(out).not.toContain(TOKEN);
    expect(out).not.toContain(API_KEY);
    expect(out).not.toContain(EMAIL);
    expect(out).toContain("Bearer REDACTED_TOKEN_1");
  });
});

describe("analyze", () => {
  it("redacts by default and still links login to the bearer token", () => {
    const { analysis, har } = analyze(sampleHar());
    expect(JSON.stringify(har)).not.toContain(TOKEN);
    expect(JSON.stringify(analysis)).not.toContain(EMAIL);
    expect(analysis.auth.scheme).toEqual({ type: "bearer", header: "authorization" });
    expect(analysis.auth.obtainedFrom).toEqual({ method: "POST", path: "/api/login", field: "token" });
    expect(analysis.redaction.enabled).toBe(true);
  });

  it("can be told not to redact", () => {
    const { analysis, har } = analyze(sampleHar(), { redact: false });
    expect(JSON.stringify(har)).toContain(TOKEN);
    expect(analysis.redaction).toEqual({ enabled: false, total: 0, byKind: {} });
  });
});
