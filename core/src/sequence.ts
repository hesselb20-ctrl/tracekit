import type { Assignment } from "./endpoints.js";
import type { AuthInfo, CallGraph, Exchange, GraphEdge, Operation } from "./types.js";

const ID_KEY = /^(?:id|uuid|slug|key|handle)$|(?:Id|_id|Uuid|_uuid|Key|_key)$/;

type Found = [path: string, value: string];

/** Every string/number leaf of a JSON value, with its field path. */
function scalars(value: unknown, path = "", out: Found[] = []): Found[] {
  if (Array.isArray(value)) {
    for (const item of value) scalars(item, `${path}[]`, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) scalars(v, path ? `${path}.${k}` : k, out);
  } else if ((typeof value === "string" || typeof value === "number") && String(value) !== "") {
    out.push([path, String(value)]);
  }
  return out;
}

/** Leaves whose field name looks like an identifier (id, userId, order_id, slug, ...). */
function ids(value: unknown): Found[] {
  return scalars(value).filter(([path]) => ID_KEY.test(path.replace(/\[\]$/, "").split(".").at(-1) ?? ""));
}

/**
 * The order calls happen in, as a graph over operations.
 *  - order edges: B directly followed A in the recording.
 *  - data edges:  B was called with an identifier that A returned earlier.
 *  - auth edges:  B carried credentials that A issued.
 */
export function buildCallGraph(
  exchanges: Exchange[],
  operations: Operation[],
  assignments: Map<number, Assignment>,
  auth: AuthInfo,
): CallGraph {
  const byId = new Map(operations.map((op) => [op.id, op]));
  const edges = new Map<string, GraphEdge>();
  const bump = (from: string, to: string, kind: GraphEdge["kind"], via?: string) => {
    const key = `${kind}|${from}|${to}|${via ?? ""}`;
    const edge = edges.get(key) ?? { from, to, kind, count: 0, ...(via ? { via } : {}) };
    edge.count++;
    edges.set(key, edge);
  };

  const nodes: string[] = [];
  /** value -> every operation that returned it, with the field it came from. */
  const producers = new Map<string, { op: string; field: string }[]>();
  let previous: string | undefined;
  let issuer: string | undefined;

  for (const ex of exchanges) {
    const assigned = assignments.get(ex.index);
    if (!assigned) continue;
    const opId = assigned.operationId;
    const op = byId.get(opId)!;
    if (!nodes.includes(opId)) nodes.push(opId);

    if (previous && previous !== opId) bump(previous, opId, "order");
    previous = opId;

    const inputs: Found[] = [
      ...Object.entries(assigned.pathParams).map(([k, v]): Found => [`path.${k}`, v]),
      ...ids(ex.requestBody).map(([p, v]): Found => [`body.${p}`, v]),
      ...Object.entries(ex.query)
        .filter(([k]) => ID_KEY.test(k))
        .map(([k, v]): Found => [`query.${k}`, v]),
    ];
    for (const [where, value] of inputs) {
      const candidates = (producers.get(value) ?? []).filter((p) => p.op !== opId);
      if (candidates.length === 0) continue;
      // Small integer ids collide across resources; prefer a producer on the same resource.
      const source = candidates.find((p) => byId.get(p.op)?.tag === op.tag) ?? candidates[0]!;
      bump(source.op, opId, "data", `${source.field} -> ${where}`);
    }

    if (auth.obtainedFrom && ex.method === auth.obtainedFrom.method && ex.path === auth.obtainedFrom.path) {
      issuer = opId;
    } else if (issuer && op.authenticated && issuer !== opId) {
      bump(issuer, opId, "auth");
    }

    if (ex.status >= 200 && ex.status < 300) {
      for (const [field, value] of ids(ex.responseBody)) {
        const list = producers.get(value) ?? [];
        if (!list.some((p) => p.op === opId)) list.push({ op: opId, field });
        producers.set(value, list);
      }
    }
  }

  const rank = { auth: 0, data: 1, order: 2 } as const;
  return {
    nodes,
    edges: [...edges.values()].sort(
      (a, b) =>
        rank[a.kind] - rank[b.kind] ||
        nodes.indexOf(a.from) - nodes.indexOf(b.from) ||
        nodes.indexOf(a.to) - nodes.indexOf(b.to),
    ),
  };
}
