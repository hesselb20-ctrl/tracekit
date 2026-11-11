import type { Har, HarNameValue, RedactionReport } from "./types.js";

/**
 * Redaction runs before anything is analysed, written or sent to a model.
 *
 * Every secret is swapped for a stable placeholder (REDACTED_TOKEN_1, user1@example.com, ...).
 * The same secret always maps to the same placeholder, so tracekit can still see that the
 * token returned by /login is the one sent as a bearer header later, without keeping the token.
 */

export type SecretKind = "token" | "cookie" | "key" | "password" | "credential" | "email";

const SENSITIVE_HEADER =
  /^(?:authorization|proxy-authorization|cookie|set-cookie)$|(?:^|[-_])(?:auth|token|secret|session|csrf|xsrf|signature|api[-_]?key|apikey|key)(?:[-_]|$)/i;

const SENSITIVE_FIELD =
  /^(?:pass(?:word|wd|phrase)?|pwd|secret|token|jwt|otp|pin|ssn|cvv|cvc|signature|sig|auth|authorization|session|sessionid|sid|cookie|credentials?|apikey|key)$|(?:^|[-_.])(?:access|refresh|id|auth|bearer|session|csrf|xsrf|api)[-_.]?(?:token|key|secret)$|(?:token|secret|password|apikey|api[-_]key|privatekey|private[-_]key|cardnumber|card[-_]number)$/i;

const PASSWORD_FIELD = /pass(?:word|wd|phrase)?|pwd|pin|otp|cvv|cvc/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g;
const BEARER = /\b(Bearer|Token)\s+([A-Za-z0-9._~+/=-]{8,})/g;
const KNOWN_KEY_PREFIX = /\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abpsr]|AKIA|AIza)[-_]?[A-Za-z0-9_-]{12,}\b/g;
const PLACEHOLDER = /^(?:REDACTED_[A-Z]+_\d+|user\d+@example\.com)$/;

export class Redactor {
  private readonly bySecret = new Map<string, string>();
  private readonly counters = new Map<SecretKind, number>();
  /** Number of replacements made, per kind. */
  readonly hits: Record<string, number> = {};

  placeholder(secret: string, kind: SecretKind): string {
    if (secret === "" || PLACEHOLDER.test(secret)) return secret;
    this.hits[kind] = (this.hits[kind] ?? 0) + 1;
    const known = this.bySecret.get(secret);
    if (known) return known;
    const n = (this.counters.get(kind) ?? 0) + 1;
    this.counters.set(kind, n);
    const value = kind === "email" ? `user${n}@example.com` : `REDACTED_${kind.toUpperCase()}_${n}`;
    this.bySecret.set(secret, value);
    return value;
  }

  /** Secrets seen so far, longest first, for the final sweep. */
  secrets(): [secret: string, placeholder: string][] {
    return [...this.bySecret.entries()].sort((a, b) => b[0].length - a[0].length);
  }

  report(enabled = true): RedactionReport {
    const total = Object.values(this.hits).reduce((a, b) => a + b, 0);
    return { enabled, total, byKind: { ...this.hits } };
  }

  /** Pattern-based redaction for free text: emails, JWTs, bearer strings, well-known key prefixes. */
  text(input: string): string {
    return input
      .replace(BEARER, (_m, scheme: string, tok: string) => `${scheme} ${this.placeholder(tok, "token")}`)
      .replace(JWT, (m) => this.placeholder(m, "token"))
      .replace(KNOWN_KEY_PREFIX, (m) => this.placeholder(m, "key"))
      .replace(EMAIL, (m) => this.placeholder(m, "email"));
  }

  field(name: string, value: string): string {
    if (!SENSITIVE_FIELD.test(name)) return this.text(value);
    return this.placeholder(value, PASSWORD_FIELD.test(name) ? "password" : "token");
  }

  json(value: unknown, key?: string): unknown {
    if (typeof value === "string") return key === undefined ? this.text(value) : this.field(key, value);
    if (Array.isArray(value)) return value.map((v) => this.json(v, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.json(v, k)]));
    }
    if (typeof value === "number" && key !== undefined && SENSITIVE_FIELD.test(key)) {
      return this.placeholder(String(value), PASSWORD_FIELD.test(key) ? "password" : "token");
    }
    return value;
  }

  header(name: string, value: string): string {
    const lower = name.toLowerCase();
    if (lower === "authorization" || lower === "proxy-authorization") {
      const m = /^(\S+)\s+(.+)$/.exec(value.trim());
      if (!m) return this.placeholder(value, "token");
      const kind: SecretKind = /^basic$/i.test(m[1]!) ? "credential" : "token";
      return `${m[1]} ${this.placeholder(m[2]!, kind)}`;
    }
    if (lower === "cookie") {
      return value
        .split(/;\s*/)
        .filter(Boolean)
        .map((pair) => {
          const eq = pair.indexOf("=");
          return eq < 0 ? pair : `${pair.slice(0, eq)}=${this.placeholder(pair.slice(eq + 1), "cookie")}`;
        })
        .join("; ");
    }
    if (lower === "set-cookie") {
      return value
        .split(/\n/)
        .map((line) => {
          const [pair = "", ...attrs] = line.split(/;\s*/);
          const eq = pair.indexOf("=");
          const safe = eq < 0 ? pair : `${pair.slice(0, eq)}=${this.placeholder(pair.slice(eq + 1), "cookie")}`;
          return [safe, ...attrs].join("; ");
        })
        .join("\n");
    }
    if (SENSITIVE_HEADER.test(lower)) return this.placeholder(value, "key");
    return this.text(value);
  }

  query(name: string, value: string): string {
    if (!SENSITIVE_FIELD.test(name)) return this.text(value);
    return this.placeholder(value, /key/i.test(name) ? "key" : PASSWORD_FIELD.test(name) ? "password" : "token");
  }

  url(raw: string): string {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return this.text(raw);
    }
    if (url.username || url.password) {
      url.username = url.username && this.placeholder(decodeURIComponent(url.username), "credential");
      url.password = url.password && this.placeholder(decodeURIComponent(url.password), "password");
    }
    const params = [...url.searchParams.entries()];
    if (params.length > 0) {
      url.search = "";
      for (const [k, v] of params) url.searchParams.append(k, this.query(k, v));
    }
    url.pathname = url.pathname
      .split("/")
      .map((seg) => {
        const decoded = safeDecode(seg);
        const cleaned = this.text(decoded);
        return cleaned === decoded ? seg : encodeURIComponent(cleaned);
      })
      .join("/");
    return url.toString();
  }

  /** A request or response body, given its mime type. */
  body(text: string, mime: string | undefined): string {
    const kind = (mime ?? "").split(";")[0]!.trim().toLowerCase();
    if (kind === "application/x-www-form-urlencoded") {
      const params = new URLSearchParams(text);
      const out = new URLSearchParams();
      for (const [k, v] of params) out.append(k, this.query(k, v));
      return out.toString();
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === "object") return JSON.stringify(this.json(parsed));
    } catch {
      // not JSON: fall through to pattern-based redaction
    }
    return this.text(text);
  }
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function pairs(list: HarNameValue[] | undefined, fn: (name: string, value: string) => string): void {
  for (const item of list ?? []) {
    if (typeof item.value === "string") item.value = fn(item.name, item.value);
  }
}

/** Returns a redacted deep copy of the HAR plus a count of what was replaced. */
export function redactHar(input: Har): { har: Har; report: RedactionReport } {
  const r = new Redactor();
  const har = structuredClone(input);

  for (const entry of har.log.entries) {
    const { request, response } = entry;
    request.url = r.url(request.url);
    pairs(request.headers, (n, v) => r.header(n, v));
    pairs(request.queryString, (n, v) => r.query(n, v));
    pairs(request.cookies, (_n, v) => r.placeholder(v, "cookie"));
    if (request.postData) {
      pairs(request.postData.params, (n, v) => r.query(n, v));
      if (typeof request.postData.text === "string") {
        request.postData.text = r.body(request.postData.text, request.postData.mimeType);
      }
    }

    pairs(response.headers, (n, v) => r.header(n, v));
    pairs(response.cookies, (_n, v) => r.placeholder(v, "cookie"));
    const content = response.content;
    if (content && typeof content.text === "string") {
      const isBase64 = content.encoding === "base64";
      const textual = /json|text|xml|javascript|urlencoded/i.test(content.mimeType ?? "");
      if (!isBase64) {
        content.text = r.body(content.text, content.mimeType);
      } else if (textual) {
        const cleaned = r.body(Buffer.from(content.text, "base64").toString("utf8"), content.mimeType);
        content.text = Buffer.from(cleaned, "utf8").toString("base64");
      }
    }
  }

  // Final sweep: a secret found in one place (say, a login response) is removed everywhere
  // else it shows up verbatim, including places no rule looks at (paths, redirect URLs, ...).
  let serialized = JSON.stringify(har);
  for (const [secret, placeholder] of r.secrets()) {
    if (secret.length < 8) continue;
    const escaped = JSON.stringify(secret).slice(1, -1);
    if (serialized.includes(escaped)) serialized = serialized.split(escaped).join(placeholder);
  }
  return { har: JSON.parse(serialized) as Har, report: r.report() };
}

/** Convenience for free text that is not part of a HAR (logs, pasted snippets). */
export function redactText(text: string): string {
  return new Redactor().text(text);
}
