import type { JsonSchema } from "./types.js";

/**
 * JSON Schema inference from samples (draft 2020-12, which is what OpenAPI 3.1 uses).
 *
 * - A property is `required` only when every sampled object had it.
 * - null widens the type (["string", "null"]) instead of being dropped.
 * - integer + number merge to number.
 * - String formats (date-time, date, email, uuid, uri) survive only if every sample matches.
 */

const FORMATS: [format: string, test: RegExp][] = [
  ["date-time", /^\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:?\d{2})$/],
  ["date", /^\d{4}-\d{2}-\d{2}$/],
  ["uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
  ["email", /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/],
  ["uri", /^https?:\/\/[^\s]+$/i],
];

const TYPE_ORDER = ["object", "array", "string", "number", "integer", "boolean", "null"];

export function stringFormat(value: string): string | undefined {
  return FORMATS.find(([, re]) => re.test(value))?.[0];
}

/** Schema of a single value. */
export function schemaOf(value: unknown): JsonSchema {
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) {
    const items = value.length ? value.map(schemaOf).reduce(mergeSchemas) : undefined;
    return items ? { type: "array", items } : { type: "array" };
  }
  switch (typeof value) {
    case "string": {
      const format = stringFormat(value);
      // "x-noFormat" remembers that a formatless sample was seen, so a later merge cannot add one.
      return format ? { type: "string", format } : { type: "string", "x-noFormat": true };
    }
    case "number":
      return { type: Number.isInteger(value) ? "integer" : "number" };
    case "boolean":
      return { type: "boolean" };
    case "object": {
      const properties: Record<string, JsonSchema> = {};
      for (const [k, v] of Object.entries(value as object)) {
        if (v !== undefined) properties[k] = schemaOf(v);
      }
      return { type: "object", properties, required: Object.keys(properties).sort() };
    }
    default:
      return {};
  }
}

function typeSet(schema: JsonSchema): Set<string> {
  if (schema.type === undefined) return new Set();
  return new Set(Array.isArray(schema.type) ? schema.type : [schema.type]);
}

export function mergeSchemas(a: JsonSchema, b: JsonSchema): JsonSchema {
  const types = new Set([...typeSet(a), ...typeSet(b)]);
  if (types.has("number")) types.delete("integer");
  const ordered = TYPE_ORDER.filter((t) => types.has(t));
  const out: JsonSchema = {};
  if (ordered.length === 1) out.type = ordered[0];
  else if (ordered.length > 1) out.type = ordered;

  if (types.has("string")) {
    const aStr = typeSet(a).has("string");
    const bStr = typeSet(b).has("string");
    const noFormat = (aStr && !a.format) || (bStr && !b.format) || (aStr && bStr && a.format !== b.format);
    if (noFormat) out["x-noFormat"] = true;
    else out.format = (aStr ? a.format : b.format) as string;
  }

  if (types.has("object")) {
    const aObj = a.properties !== undefined || typeSet(a).has("object");
    const bObj = b.properties !== undefined || typeSet(b).has("object");
    const properties: Record<string, JsonSchema> = {};
    for (const key of new Set([...Object.keys(a.properties ?? {}), ...Object.keys(b.properties ?? {})])) {
      const left = a.properties?.[key];
      const right = b.properties?.[key];
      properties[key] = left && right ? mergeSchemas(left, right) : (left ?? right)!;
    }
    out.properties = properties;
    const required =
      aObj && bObj
        ? (a.required ?? []).filter((k) => (b.required ?? []).includes(k))
        : ((aObj ? a.required : b.required) ?? []);
    out.required = [...required].sort();
  }

  if (types.has("array")) {
    const items = a.items && b.items ? mergeSchemas(a.items, b.items) : (a.items ?? b.items);
    if (items) out.items = items;
  }
  return out;
}

/** Remove bookkeeping and empty keywords so the result is plain JSON Schema. */
export function finalizeSchema(schema: JsonSchema): JsonSchema {
  const out: JsonSchema = {};
  if (schema.type !== undefined) out.type = schema.type;
  if (schema.format !== undefined) out.format = schema.format;
  if (schema.properties) {
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, finalizeSchema(v)]));
    if (schema.required?.length) out.required = schema.required;
  }
  if (schema.items) out.items = finalizeSchema(schema.items);
  return out;
}

/** Infer one schema that accepts every sample. Returns undefined when there are no samples. */
export function inferSchema(samples: unknown[]): JsonSchema | undefined {
  const defined = samples.filter((s) => s !== undefined);
  if (defined.length === 0) return undefined;
  return finalizeSchema(defined.map(schemaOf).reduce(mergeSchemas));
}

/** Schema for values that arrive as strings (query parameters). */
export function inferStringEncoded(values: string[]): JsonSchema {
  if (values.length === 0) return { type: "string" };
  if (values.every((v) => /^-?\d+$/.test(v))) return { type: "integer" };
  if (values.every((v) => /^-?\d+(?:\.\d+)?$/.test(v))) return { type: "number" };
  if (values.every((v) => v === "true" || v === "false")) return { type: "boolean" };
  return inferSchema(values) ?? { type: "string" };
}
