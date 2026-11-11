import type { AuthInfo, AuthScheme, Exchange } from "./types.js";

const KEY_HEADER = /^(?:x-)?(?:api[-_]?key|auth[-_]?token|access[-_]?token)$/i;
const KEY_QUERY = /^(?:api[-_]?key|key|access[-_]?token|token)$/i;

function bearerToken(ex: Exchange): string | undefined {
  return /^Bearer\s+(\S+)/i.exec(ex.requestHeaders["authorization"] ?? "")?.[1];
}

function cookieNames(ex: Exchange): string[] {
  return (ex.requestHeaders["cookie"] ?? "")
    .split(/;\s*/)
    .map((pair) => pair.split("=")[0]!.trim())
    .filter(Boolean);
}

function setCookieNames(ex: Exchange): string[] {
  return ex.setCookies.map((line) => line.split("=")[0]!.trim()).filter(Boolean);
}

/** Dot path of the first string field equal to `needle`, searching depth first. */
export function findValuePath(value: unknown, needle: string, prefix = ""): string | undefined {
  if (typeof value === "string") return value === needle ? prefix || "$" : undefined;
  if (Array.isArray(value)) {
    for (const [i, item] of value.entries()) {
      const hit = findValuePath(item, needle, `${prefix}[${i}]`);
      if (hit) return hit;
    }
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const hit = findValuePath(v, needle, prefix ? `${prefix}.${k}` : k);
      if (hit) return hit;
    }
  }
  return undefined;
}

export function carriesAuth(ex: Exchange, scheme: AuthScheme): boolean {
  switch (scheme.type) {
    case "bearer":
      return bearerToken(ex) !== undefined;
    case "apiKey":
      return scheme.in === "header" ? scheme.name in ex.requestHeaders : scheme.name in ex.query;
    case "cookie":
      return cookieNames(ex).some((n) => scheme.names.includes(n));
    case "none":
      return false;
  }
}

/**
 * Work out how the recorded client authenticated. Works on redacted exchanges: placeholders are
 * stable, so "the value /login returned is the bearer token used afterwards" still holds.
 */
export function detectAuth(exchanges: Exchange[]): AuthInfo {
  if (exchanges.length === 0) return { scheme: { type: "none" }, coverage: 0 };

  const bearer = exchanges.filter((ex) => bearerToken(ex) !== undefined);

  const headerCounts = new Map<string, number>();
  const queryCounts = new Map<string, number>();
  const cookieCounts = new Map<string, number>();
  let withCookie = 0;
  for (const ex of exchanges) {
    for (const name of Object.keys(ex.requestHeaders)) {
      if (KEY_HEADER.test(name)) headerCounts.set(name, (headerCounts.get(name) ?? 0) + 1);
    }
    for (const name of Object.keys(ex.query)) {
      if (KEY_QUERY.test(name)) queryCounts.set(name, (queryCounts.get(name) ?? 0) + 1);
    }
    const names = cookieNames(ex);
    if (names.length) withCookie++;
    for (const name of names) cookieCounts.set(name, (cookieCounts.get(name) ?? 0) + 1);
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
  const keyHeader = top(headerCounts);
  const keyQuery = top(queryCounts);

  // Most-used mechanism wins. On a tie the order below decides: bearer, API key, cookie.
  const candidates: { scheme: AuthScheme; count: number }[] = [
    { scheme: { type: "bearer", header: "authorization" }, count: bearer.length },
    { scheme: { type: "apiKey", in: "header", name: keyHeader?.[0] ?? "" }, count: keyHeader?.[1] ?? 0 },
    { scheme: { type: "apiKey", in: "query", name: keyQuery?.[0] ?? "" }, count: keyQuery?.[1] ?? 0 },
    { scheme: { type: "cookie", names: [] }, count: withCookie },
  ];
  const best = candidates.reduce((a, b) => (b.count > a.count ? b : a));
  if (best.count === 0) return { scheme: { type: "none" }, coverage: 0 };

  const scheme = best.scheme;
  const info: AuthInfo = { scheme, coverage: best.count / exchanges.length };

  if (scheme.type === "bearer") {
    const first = bearer[0]!;
    const token = bearerToken(first)!;
    for (const ex of exchanges) {
      if (ex.index >= first.index) break;
      const field = findValuePath(ex.responseBody, token);
      if (field) {
        info.obtainedFrom = { method: ex.method, path: ex.path, field };
        break;
      }
    }
  } else if (scheme.type === "cookie") {
    // Prefer cookies the server set during the recording; analytics cookies rarely are.
    const issued = new Set(exchanges.flatMap(setCookieNames));
    const sent = [...cookieCounts.keys()];
    const names = sent.filter((n) => issued.has(n));
    scheme.names = (names.length ? names : sent).sort();
    const issuer = exchanges.find((ex) => setCookieNames(ex).some((n) => scheme.names.includes(n)));
    if (issuer) info.obtainedFrom = { method: issuer.method, path: issuer.path };
  }
  return info;
}
