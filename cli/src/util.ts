import type { Analysis, Operation } from "@tracekit/core";

export function pascal(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

export function snake(text: string): string {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function kebab(text: string): string {
  return snake(text).replace(/_/g, "-");
}

/** Does a raw path such as /api/todos/17 fall under a template such as /api/todos/{id}? */
export function matchesTemplate(template: string, path: string): boolean {
  const pattern = template
    .split("/")
    .map((seg) => (/^\{.+\}$/.test(seg) ? "[^/]+" : seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${pattern}/?$`).test(path);
}

/** The operation that hands out credentials (login), when the recording contains it. */
export function credentialIssuer(analysis: Analysis): { op: Operation; field?: string } | undefined {
  const from = analysis.auth.obtainedFrom;
  if (!from) return undefined;
  const op = analysis.operations.find((o) => o.method === from.method && matchesTemplate(o.path, from.path));
  if (!op) return undefined;
  // Only plain dot paths (token, data.accessToken) can be captured automatically.
  const field = from.field && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(from.field) ? from.field : undefined;
  return { op, field };
}

/** The 2xx response a caller should expect, preferring one with a body. */
export function successResponse(op: Operation): { status: string; hasBody: boolean } | undefined {
  const ok = Object.entries(op.responses).filter(([s]) => s.startsWith("2"));
  const chosen = ok.find(([, r]) => r.schema) ?? ok[0];
  return chosen ? { status: chosen[0], hasBody: !!chosen[1].schema } : undefined;
}
