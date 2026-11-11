import type { Exchange, Har, HarEntry, HarNameValue } from "./types.js";

const STATIC_EXT = /\.(?:js|mjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|eot|mp4|webm|mp3|wasm|html?)$/i;
const API_RESOURCE_TYPES = new Set(["xhr", "fetch"]);

export function parseHar(input: string | unknown): Har {
  let data: unknown = input;
  if (typeof input === "string") {
    try {
      data = JSON.parse(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input);
    } catch (err) {
      throw new Error(`Not a HAR file: invalid JSON (${(err as Error).message})`);
    }
  }
  const log = (data as { log?: { entries?: unknown } } | null)?.log;
  if (!log || !Array.isArray(log.entries)) {
    throw new Error("Not a HAR file: expected an object with log.entries[]");
  }
  for (const [i, entry] of (log.entries as HarEntry[]).entries()) {
    if (!entry?.request?.url || !entry.request.method || !entry.response) {
      throw new Error(`Not a HAR file: entry ${i} has no request/response`);
    }
  }
  return data as Har;
}

export function isJsonType(mime: string | undefined): boolean {
  return !!mime && /(?:^|[/+])json\b/i.test(mime.split(";")[0]!.trim());
}

function headerMap(headers: HarNameValue[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers ?? []) {
    const name = h.name.toLowerCase();
    if (name.startsWith(":")) continue; // HTTP/2 pseudo headers
    out[name] = name in out ? `${out[name]}, ${h.value}` : h.value;
  }
  return out;
}

function tryJson(text: string | undefined): unknown {
  if (text === undefined || text === "") return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function decodeBody(content: { text?: string; encoding?: string } | undefined): string | undefined {
  if (!content?.text) return undefined;
  if (content.encoding === "base64") return Buffer.from(content.text, "base64").toString("utf8");
  return content.text;
}

function looksLikeApiCall(entry: HarEntry, url: URL): boolean {
  const method = entry.request.method.toUpperCase();
  if (method === "OPTIONS" || method === "HEAD") return false;
  if (!/^https?:$/.test(url.protocol)) return false;
  const resMime = entry.response.content?.mimeType;
  const reqMime = entry.request.postData?.mimeType;
  if (isJsonType(resMime) || isJsonType(reqMime)) return true;
  if (STATIC_EXT.test(url.pathname)) return false;
  if (entry._resourceType && API_RESOURCE_TYPES.has(entry._resourceType)) return true;
  // Mutations with an empty or non-JSON reply (204 on DELETE, for instance) still count.
  return method !== "GET" && !/^(?:text\/html|image\/|font\/|text\/css)/i.test(resMime ?? "");
}

/** Turn HAR entries into normalised API exchanges, dropping pages, assets and preflights. */
export function toExchanges(har: Har): Exchange[] {
  const rows: Omit<Exchange, "index">[] = [];
  for (const [position, entry] of har.log.entries.entries()) {
    let url: URL;
    try {
      url = new URL(entry.request.url);
    } catch {
      continue;
    }
    if (!looksLikeApiCall(entry, url)) continue;

    const requestHeaders = headerMap(entry.request.headers);
    const responseHeaders = headerMap(entry.response.headers);
    const requestContentType = entry.request.postData?.mimeType ?? requestHeaders["content-type"];
    const responseContentType = entry.response.content?.mimeType ?? responseHeaders["content-type"];
    const started = Date.parse(entry.startedDateTime ?? "");

    rows.push({
      startedAt: Number.isNaN(started) ? position : started,
      method: entry.request.method.toUpperCase(),
      origin: url.origin,
      path: url.pathname === "" ? "/" : url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      requestHeaders,
      requestContentType,
      requestBody: isJsonType(requestContentType) ? tryJson(entry.request.postData?.text) : undefined,
      status: entry.response.status,
      responseHeaders,
      setCookies: (entry.response.headers ?? [])
        .filter((h) => h.name.toLowerCase() === "set-cookie")
        .flatMap((h) => h.value.split(/\n/)),
      responseContentType,
      responseBody: isJsonType(responseContentType) ? tryJson(decodeBody(entry.response.content)) : undefined,
    });
  }
  // Stable sort: HAR exporters usually write in start order, but not always.
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => a.row.startedAt - b.row.startedAt || a.i - b.i)
    .map(({ row }, index) => ({ ...row, index }));
}
