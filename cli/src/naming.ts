import Anthropic from "@anthropic-ai/sdk";
import type { Analysis, JsonSchema, Operation } from "@tracekit/core";

export const DEFAULT_MODEL = "claude-fable-5-2";

export interface NamingResult {
  source: "claude" | "fallback";
  /** Why the deterministic names were kept, when they were. */
  reason?: string;
  model?: string;
}

interface Suggestion {
  title: string;
  description: string;
  operations: { id: string; name: string; summary: string; description: string }[];
}

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "operations"],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    operations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "summary", "description"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          summary: { type: "string" },
          description: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `You name API operations and write tool descriptions for an API that was reverse-engineered from recorded traffic.

The descriptions become MCP tool descriptions, so an AI agent will read them to decide which tool to call and how. For each operation return:
- name: a camelCase operationId that says what the call does (listTodos, createTodo, getInvoicePdf). Keep the given name when it is already good.
- summary: at most eight words, no trailing period.
- description: one to three sentences covering what the call does, when to use it, and anything the inputs or the call order imply (for example that an id comes from another operation's response, or that login must happen first).

Also return a short title for the API and a one-sentence description of it.

Only describe what the data supports. The schemas were inferred from a handful of samples and all secrets were replaced with placeholders such as REDACTED_TOKEN_1 before you saw anything; do not guess at behaviour that is not visible, and never mention the placeholders. Return every operation exactly once, with its id unchanged.`;

/** Compact, already-redacted view of the analysis: shapes only, no recorded values. */
export function namingPayload(analysis: Analysis): unknown {
  const fields = (schema: JsonSchema | undefined): unknown => {
    if (!schema) return undefined;
    if (schema.properties) {
      return Object.fromEntries(
        Object.entries(schema.properties).map(([k, v]) => [
          schema.required?.includes(k) ? k : `${k}?`,
          v.properties || v.items ? fields(v) : [v.type, v.format].flat().filter(Boolean).join(" "),
        ]),
      );
    }
    if (schema.items) return [fields(schema.items)];
    return [schema.type, schema.format].flat().filter(Boolean).join(" ");
  };
  return {
    host: analysis.title,
    auth: analysis.auth,
    operations: analysis.operations.map((op) => ({
      id: op.id,
      method: op.method,
      path: op.path,
      recordedCalls: op.calls,
      needsAuth: op.authenticated,
      pathParams: op.pathParams.map((p) => `${p.name}: ${p.kind}`),
      queryParams: op.queryParams.map((p) => `${p.name}${p.required ? "" : "?"}: ${String(p.schema.type)}`),
      requestBody: fields(op.requestBody?.schema),
      responses: Object.fromEntries(Object.entries(op.responses).map(([s, r]) => [s, fields(r.schema)])),
    })),
    callGraph: analysis.graph.edges.filter((e) => e.kind !== "order"),
  };
}

const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;

/** Apply suggestions in place. Anything invalid or missing keeps its deterministic value. */
export function applySuggestion(analysis: Analysis, suggestion: Suggestion): number {
  const byId = new Map(suggestion.operations.map((s) => [s.id, s]));
  const existing = new Set(analysis.operations.map((op) => op.id));
  const taken = new Set<string>();
  const renames = new Map<string, string>();
  let applied = 0;

  for (const op of analysis.operations) {
    const s = byId.get(op.id);
    let name = s && IDENTIFIER.test(s.name) ? s.name : op.id;
    // A suggestion may not take a name another operation already has, or one already handed out.
    if (taken.has(name) || (name !== op.id && existing.has(name))) name = op.id;
    for (let n = 2; taken.has(name); n++) name = `${op.id}${n}`;
    taken.add(name);
    if (s) {
      if (s.summary.trim()) op.summary = s.summary.trim();
      if (s.description.trim()) op.description = s.description.trim();
      applied++;
    }
    if (name !== op.id) renames.set(op.id, name);
  }
  for (const op of analysis.operations) op.id = renames.get(op.id) ?? op.id;
  analysis.graph.nodes = analysis.graph.nodes.map((n) => renames.get(n) ?? n);
  for (const edge of analysis.graph.edges) {
    edge.from = renames.get(edge.from) ?? edge.from;
    edge.to = renames.get(edge.to) ?? edge.to;
  }
  if (suggestion.title.trim()) analysis.title = suggestion.title.trim();
  return applied;
}

/**
 * Ask Claude to name the operations and write the tool descriptions.
 * Only the redacted shape summary from namingPayload() is sent. Never throws: on any
 * failure the deterministic names stay and the reason is reported.
 */
export async function nameWithClaude(
  analysis: Analysis,
  options: { model?: string; client?: Anthropic } = {},
): Promise<NamingResult & { apiDescription?: string }> {
  const model = options.model ?? DEFAULT_MODEL;
  let client: Anthropic;
  try {
    client = options.client ?? new Anthropic();
  } catch (err) {
    return { source: "fallback", reason: `no Anthropic credentials (${(err as Error).message.split("\n")[0]})` };
  }

  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      // If a safety classifier declines the request, let the API route it to a fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: JSON.stringify(namingPayload(analysis), null, 1) }],
    });

    if (response.stop_reason === "refusal") {
      return { source: "fallback", reason: "the model declined the request", model };
    }
    if (response.stop_reason === "max_tokens") {
      return { source: "fallback", reason: "the response was cut off (too many operations for one request)", model };
    }
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const suggestion = JSON.parse(text) as Suggestion;
    if (!Array.isArray(suggestion.operations)) throw new SyntaxError("missing operations[]");
    const applied = applySuggestion(analysis, suggestion);
    if (applied === 0) return { source: "fallback", reason: "the response matched no operations", model };
    return { source: "claude", model: response.model, apiDescription: suggestion.description };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { source: "fallback", reason: "Anthropic credentials were rejected", model };
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { source: "fallback", reason: "rate limited by the Anthropic API", model };
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return { source: "fallback", reason: "could not reach the Anthropic API", model };
    }
    if (err instanceof Anthropic.APIError) {
      return { source: "fallback", reason: `Anthropic API error ${err.status ?? ""}: ${err.message}`.trim(), model };
    }
    if (err instanceof SyntaxError) {
      return { source: "fallback", reason: `unreadable model response (${err.message})`, model };
    }
    // Missing credentials surface here as a plain Error on the first request.
    const message = (err as Error).message.split("\n")[0] ?? "unknown error";
    const reason = /authentication method/i.test(message)
      ? "no Anthropic credentials found; set ANTHROPIC_API_KEY"
      : message;
    return { source: "fallback", reason, model };
  }
}
