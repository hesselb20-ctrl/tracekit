import { carriesAuth } from "./auth.js";
import { inferSchema, inferStringEncoded } from "./schema.js";
import { camel, clusterPaths, extractParams, singular, type ClusterOptions } from "./template.js";
import type { AuthScheme, Exchange, Operation } from "./types.js";

const PREFIX_SEGMENT = /^(?:api|rest|v\d+(?:\.\d+)*)$/i;

export interface Assignment {
  operationId: string;
  pathParams: Record<string, string>;
}

function literals(template: string): string[] {
  const segs = template.split("/").filter((s) => s && !/^\{.+\}$/.test(s));
  while (segs.length > 1 && PREFIX_SEGMENT.test(segs[0]!)) segs.shift();
  return segs;
}

const ITEM_VERBS: Record<string, string> = {
  GET: "get",
  PUT: "replace",
  PATCH: "update",
  DELETE: "delete",
  POST: "post",
};

/** Deterministic operation name, used as-is with --no-ai and as the fallback otherwise. */
export function defaultOperationName(method: string, template: string, returnsArray = false): string {
  const lits = literals(template);
  const m = method.toUpperCase();
  if (lits.length === 0) return camel(`${m.toLowerCase()} root`);
  const leaf = lits.at(-1)!;
  const parents = lits.slice(0, -1).map(singular);
  const endsWithParam = /\}\/?$/.test(template);
  const plural = singular(leaf) !== leaf;

  if (endsWithParam) {
    return camel([ITEM_VERBS[m] ?? m.toLowerCase(), ...parents, singular(leaf)].join(" "));
  }
  switch (m) {
    case "GET":
      return camel([returnsArray || plural ? "list" : "get", ...parents, leaf].join(" "));
    case "POST":
      // POST /todos creates a todo; POST /login or /todos/{id}/complete is an action.
      return plural ? camel(["create", ...parents, singular(leaf)].join(" ")) : camel([leaf, ...parents].join(" "));
    case "PUT":
      return camel(["replace", ...parents, leaf].join(" "));
    case "PATCH":
      return camel(["update", ...parents, leaf].join(" "));
    case "DELETE":
      return camel(["delete", ...parents, leaf].join(" "));
    default:
      return camel([m.toLowerCase(), ...parents, leaf].join(" "));
  }
}

export function humanize(operationId: string): string {
  const words = operationId.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function buildOperations(
  exchanges: Exchange[],
  scheme: AuthScheme,
  options: ClusterOptions = {},
): { operations: Operation[]; assignments: Map<number, Assignment> } {
  const lookup = clusterPaths(
    exchanges.map((ex) => ex.path),
    options,
  );
  const groups = new Map<string, Exchange[]>();
  for (const ex of exchanges) {
    const key = `${ex.method} ${lookup.get(ex.path)!.template}`;
    const group = groups.get(key) ?? [];
    group.push(ex);
    groups.set(key, group);
  }

  const usedIds = new Set<string>();
  const operations: Operation[] = [];
  const assignments = new Map<number, Assignment>();

  for (const calls of groups.values()) {
    const first = calls[0]!;
    const cluster = lookup.get(first.path)!;
    const okBodies = calls.filter((c) => c.status >= 200 && c.status < 300).map((c) => c.responseBody);
    const returnsArray = okBodies.some(Array.isArray);

    const base = defaultOperationName(first.method, cluster.template, returnsArray);
    let id = base;
    for (let n = 2; usedIds.has(id); n++) id = `${base}${n}`;
    usedIds.add(id);

    const queryNames = new Set(calls.flatMap((c) => Object.keys(c.query)));
    if (scheme.type === "apiKey" && scheme.in === "query") queryNames.delete(scheme.name);
    const queryParams = [...queryNames].sort().map((name) => {
      const values = calls.filter((c) => name in c.query).map((c) => c.query[name]!);
      return { name, required: values.length === calls.length, schema: inferStringEncoded(values) };
    });

    const requestSchema = inferSchema(calls.map((c) => c.requestBody));
    // PATCH is a partial update: a field being present in every sample does not make it required.
    if (requestSchema && first.method === "PATCH") delete requestSchema.required;

    const responses: Operation["responses"] = {};
    for (const status of [...new Set(calls.map((c) => c.status))].sort()) {
      const schema = inferSchema(calls.filter((c) => c.status === status).map((c) => c.responseBody));
      responses[String(status)] = schema ? { contentType: "application/json", schema } : {};
    }

    const plural = calls.length === 1 ? "" : "s";
    operations.push({
      id,
      method: first.method,
      path: cluster.template,
      tag: literals(cluster.template)[0] ?? "default",
      summary: humanize(id),
      description: `${first.method} ${cluster.template}. Inferred from ${calls.length} recorded call${plural}.`,
      pathParams: cluster.params,
      queryParams,
      ...(requestSchema ? { requestBody: { contentType: "application/json", schema: requestSchema } } : {}),
      responses,
      calls: calls.length,
      authenticated: scheme.type !== "none" && calls.some((c) => carriesAuth(c, scheme)),
    });
    for (const c of calls) {
      assignments.set(c.index, { operationId: id, pathParams: extractParams(cluster.template, c.path) });
    }
  }
  return { operations, assignments };
}
