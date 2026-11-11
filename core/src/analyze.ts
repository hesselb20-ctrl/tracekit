import { detectAuth } from "./auth.js";
import { buildOperations } from "./endpoints.js";
import { parseHar, toExchanges } from "./har.js";
import { redactHar } from "./redact.js";
import { buildCallGraph } from "./sequence.js";
import type { ClusterOptions } from "./template.js";
import type { Analysis, AuthInfo, CallGraph, Har, Operation } from "./types.js";

export interface AnalyzeOptions extends ClusterOptions {
  /** Redact secrets before analysis. On by default; turn off only for traffic you fully own. */
  redact?: boolean;
  /** Analyse this origin instead of the one with the most API calls. */
  origin?: string;
  title?: string;
}

export interface AnalyzeResult {
  analysis: Analysis;
  /** The HAR the analysis was computed from: redacted unless redact was turned off. */
  har: Har;
}

const list = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;

/**
 * Deterministic descriptions built from what the recording shows: inputs, where identifiers
 * come from, and whether credentials are needed. Claude replaces these when it is available.
 */
export function describeOperations(operations: Operation[], graph: CallGraph, auth: AuthInfo): void {
  const issuer = graph.edges.find((e) => e.kind === "auth")?.from;
  for (const op of operations) {
    const parts = [`${op.summary} (${op.method} ${op.path}).`];

    for (const param of op.pathParams) {
      const sources = graph.edges
        .filter((e) => e.kind === "data" && e.to === op.id && e.via?.endsWith(`path.${param.name}`))
        .map((e) => e.from);
      if (sources.length) parts.push(`Use the ${param.name} returned by ${list([...new Set(sources)])}.`);
    }
    if (op.queryParams.length) {
      parts.push(`Query parameters: ${op.queryParams.map((p) => `${p.name}${p.required ? "" : " (optional)"}`).join(", ")}.`);
    }
    const bodyFields = Object.keys(op.requestBody?.schema.properties ?? {});
    if (bodyFields.length) {
      const required = new Set(op.requestBody!.schema.required ?? []);
      parts.push(`Body fields: ${bodyFields.map((f) => `${f}${required.has(f) ? "" : " (optional)"}`).join(", ")}.`);
    }
    if (op.id === issuer) {
      parts.push("Returns the credential that the other operations need, so call it first.");
    } else if (op.authenticated) {
      const how = auth.scheme.type === "bearer" ? "a bearer token" : auth.scheme.type === "cookie" ? "a session cookie" : "an API key";
      parts.push(issuer ? `Requires ${how} from ${issuer}.` : `Requires ${how}.`);
    }
    op.description = parts.join(" ");
  }
}

export function analyze(input: string | Har, options: AnalyzeOptions = {}): AnalyzeResult {
  const raw = parseHar(input);
  const redact = options.redact ?? true;
  const { har, report } = redact ? redactHar(raw) : { har: raw, report: { enabled: false, total: 0, byKind: {} } };

  const all = toExchanges(har);
  const perOrigin = new Map<string, number>();
  for (const ex of all) perOrigin.set(ex.origin, (perOrigin.get(ex.origin) ?? 0) + 1);
  const origin = options.origin ?? [...perOrigin.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!origin) {
    throw new Error("No API calls found in this HAR. Record with the Network panel open and export with content.");
  }
  const exchanges = all.filter((ex) => ex.origin === origin);
  if (exchanges.length === 0) throw new Error(`No API calls to ${origin} in this HAR.`);

  const auth = detectAuth(exchanges);
  const { operations, assignments } = buildOperations(exchanges, auth.scheme, options);
  const graph = buildCallGraph(exchanges, operations, assignments, auth);
  describeOperations(operations, graph, auth);

  return {
    har,
    analysis: {
      title: options.title ?? new URL(origin).hostname,
      baseUrl: origin,
      operations,
      auth,
      graph,
      redaction: report,
      stats: {
        entries: har.log.entries.length,
        apiCalls: exchanges.length,
        skippedOrigins: [...perOrigin.keys()].filter((o) => o !== origin).sort(),
      },
    },
  };
}
