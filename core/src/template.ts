import type { JsonSchema, ParamKind, PathParam } from "./types.js";

/**
 * Path templating: /users/123 -> /users/{id}.
 *
 * Two passes:
 *  1. Shape: a segment that looks like an identifier (integer, UUID, long hex, ULID, date,
 *     opaque token) becomes a parameter on its own evidence.
 *  2. Cardinality: sibling paths that differ in exactly one position, with enough distinct
 *     values that do not look like resource names, collapse into one template ({slug}).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^\d+$/;
const HEX = /^[0-9a-f]{16,}$/i;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const VERSION = /^v\d+(?:\.\d+)*$/i;

export function classifySegment(segment: string): ParamKind | null {
  if (segment === "" || VERSION.test(segment)) return null;
  if (INTEGER.test(segment)) return "integer";
  if (UUID.test(segment)) return "uuid";
  if (DATE.test(segment)) return "date";
  if (HEX.test(segment)) return "hex";
  if (ULID.test(segment) && /\d/.test(segment)) return "ulid";
  if (looksOpaque(segment)) return "token";
  return null;
}

/** Mixed letters and digits with no word structure: "a8Kq02LmZx", "usr_9f2c81d0", "REDACTED_TOKEN_1". */
function looksOpaque(segment: string): boolean {
  if (/^REDACTED_[A-Z]+_\d+$/.test(segment)) return true;
  if (segment.length < 8 || !/^[A-Za-z0-9_~-]+$/.test(segment)) return false;
  const digits = segment.replace(/\D/g, "").length;
  const letters = segment.replace(/[^A-Za-z]/g, "").length;
  if (digits === 0 || letters === 0) return false;
  // Prefixed ids such as usr_9f2c81d0 or inv-00412.
  if (/^[a-z]{2,6}[_-][A-Za-z0-9]*\d[A-Za-z0-9]*$/.test(segment)) return true;
  // Otherwise require a real mix, so "page2", "oauth2" or "top10-list" stay literal.
  return digits >= 3 && digits / segment.length >= 0.25 && !/[-_]/.test(segment) && segment.length >= 10;
}

export function singular(word: string): string {
  if (/ies$/i.test(word) && word.length > 4) return word.slice(0, -3) + "y";
  if (/(?:ss|us|is)$/i.test(word)) return word;
  if (/(?:ch|sh|x|z|s)es$/i.test(word)) return word.slice(0, -2);
  if (/s$/i.test(word) && word.length > 2) return word.slice(0, -1);
  return word;
}

export function camel(words: string): string {
  const parts = words.split(/[^A-Za-z0-9]+/).filter(Boolean);
  return parts
    .map((p, i) => (i === 0 ? p.charAt(0).toLowerCase() + p.slice(1) : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

type Segment = string | { kind: ParamKind };

function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s !== "");
}

function paramSchema(kind: ParamKind): JsonSchema {
  switch (kind) {
    case "integer":
      return { type: "integer" };
    case "uuid":
      return { type: "string", format: "uuid" };
    case "date":
      return { type: "string", format: "date" };
    default:
      return { type: "string" };
  }
}

function render(segments: Segment[]): { template: string; params: PathParam[] } {
  const paramCount = segments.filter((s) => typeof s !== "string").length;
  const used = new Set<string>();
  const params: PathParam[] = [];
  const out = segments.map((seg, i) => {
    if (typeof seg === "string") return seg;
    const suffix = seg.kind === "slug" ? "slug" : seg.kind === "date" ? "date" : "id";
    const prev = segments[i - 1];
    let name = suffix;
    if (paramCount > 1 && typeof prev === "string") {
      name = camel(`${singular(prev)} ${suffix}`) || suffix;
    }
    let unique = name;
    for (let n = 2; used.has(unique); n++) unique = `${name}${n}`;
    used.add(unique);
    params.push({ name: unique, kind: seg.kind, schema: paramSchema(seg.kind) });
    return `{${unique}}`;
  });
  return { template: "/" + out.join("/"), params };
}

/** Shape-only templating of a single path. */
export function templatePath(path: string): { template: string; params: PathParam[] } {
  return render(
    splitPath(path).map((seg) => {
      const kind = classifySegment(safeDecode(seg));
      return kind ? { kind } : seg;
    }),
  );
}

export interface ClusterOptions {
  /** Distinct sibling values needed before a position is treated as a parameter. Default 4. */
  minDistinct?: number;
}

export interface PathCluster {
  template: string;
  params: PathParam[];
  /** Raw paths that fall under this template. */
  paths: string[];
}

/**
 * Templating over a whole set of paths (pass method-specific sets, or all paths at once).
 * Returns a lookup from each raw path to its cluster.
 */
export function clusterPaths(paths: Iterable<string>, options: ClusterOptions = {}): Map<string, PathCluster> {
  const minDistinct = options.minDistinct ?? 4;
  const unique = [...new Set(paths)];
  const shaped = new Map<string, Segment[]>();
  for (const path of unique) {
    shaped.set(
      path,
      splitPath(path).map((seg) => {
        const kind = classifySegment(safeDecode(seg));
        return kind ? { kind } : seg;
      }),
    );
  }

  // Cardinality pass. Group paths that are identical except at one literal position.
  for (let changed = true; changed; ) {
    changed = false;
    const groups = new Map<string, { position: number; members: string[] }>();
    for (const [path, segs] of shaped) {
      segs.forEach((seg, position) => {
        if (typeof seg !== "string" || position === 0) return;
        const key =
          position + "|" + segs.map((s, i) => (i === position ? "*" : typeof s === "string" ? s : `{${s.kind}}`)).join("/");
        const group = groups.get(key) ?? { position, members: [] };
        group.members.push(path);
        groups.set(key, group);
      });
    }
    for (const { position, members } of groups.values()) {
      const values = new Set(members.map((p) => shaped.get(p)![position] as string));
      if (values.size < minDistinct) continue;
      // Resource names are plain lowercase words (users, settings, login). Slugs and handles
      // usually carry digits, separators or capitals. Only collapse when most values do.
      const sluggy = [...values].filter((v) => !/^[a-z]+$/.test(v)).length;
      if (sluggy / values.size < 0.8) continue;
      for (const path of members) shaped.get(path)![position] = { kind: "slug" };
      changed = true;
    }
  }

  const clusters = new Map<string, PathCluster>();
  const lookup = new Map<string, PathCluster>();
  for (const [path, segs] of shaped) {
    const { template, params } = render(segs);
    let cluster = clusters.get(template);
    if (!cluster) {
      cluster = { template, params, paths: [] };
      clusters.set(template, cluster);
    }
    cluster.paths.push(path);
    lookup.set(path, cluster);
  }
  return lookup;
}

/** Values a raw path supplies for a template's parameters, in order. */
export function extractParams(template: string, path: string): Record<string, string> {
  const t = splitPath(template);
  const p = splitPath(path);
  const out: Record<string, string> = {};
  t.forEach((seg, i) => {
    const m = /^\{(.+)\}$/.exec(seg);
    if (m && p[i] !== undefined) out[m[1]!] = safeDecode(p[i]!);
  });
  return out;
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
