import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { analyze } from "../../core/src/index.js";
import { buildServerConfig, renderMcpServer } from "../src/mcp.js";
import { applySuggestion, nameWithClaude, namingPayload } from "../src/naming.js";
import { renderOpenApi } from "../src/openapi.js";
import { renderClient, renderTypes, schemaToTs } from "../src/sdk.js";

const HAR = readFileSync(fileURLToPath(new URL("../../examples/session.har", import.meta.url)), "utf8");
const fresh = () => analyze(HAR).analysis;

describe("example session", () => {
  const analysis = fresh();

  it("clusters the recorded calls into seven operations", () => {
    expect(analysis.operations.map((op) => `${op.method} ${op.path} ${op.id}`)).toEqual([
      "POST /api/login login",
      "GET /api/me getMe",
      "GET /api/todos listTodos",
      "GET /api/todos/{id} getTodo",
      "POST /api/todos createTodo",
      "PATCH /api/todos/{id} updateTodo",
      "DELETE /api/todos/{id} deleteTodo",
    ]);
  });

  it("finds the auth flow and the data dependencies", () => {
    expect(analysis.auth.scheme.type).toBe("bearer");
    expect(analysis.auth.obtainedFrom).toEqual({ method: "POST", path: "/api/login", field: "token" });
    const edges = analysis.graph.edges.map((e) => `${e.kind}:${e.from}>${e.to}`);
    expect(edges).toContain("auth:login>listTodos");
    expect(edges).toContain("data:createTodo>getTodo");
    expect(edges).toContain("data:listTodos>deleteTodo");
    expect(edges).not.toContain("data:login>getTodo");
  });

  it("never lets the demo credentials through", () => {
    const everything = JSON.stringify(analysis) + renderOpenApi(analysis) + renderMcpServer(analysis, "todo");
    expect(everything).not.toContain("ada@example.com");
    expect(everything).not.toContain("tracekit-demo");
    expect(everything).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});

describe("openapi", () => {
  const doc = parse(renderOpenApi(fresh()));

  it("is an OpenAPI 3.1 document with every operation", () => {
    expect(doc.openapi).toBe("3.1.0");
    expect(Object.keys(doc.paths)).toEqual(["/api/login", "/api/me", "/api/todos", "/api/todos/{id}"]);
    expect(doc.paths["/api/todos/{id}"].get.parameters).toEqual([
      { name: "id", in: "path", required: true, schema: { type: "integer" } },
    ]);
    expect(doc.components.securitySchemes.bearerAuth).toEqual({ type: "http", scheme: "bearer" });
  });

  it("marks login as public and the rest as secured", () => {
    expect(doc.paths["/api/login"].post.security).toEqual([]);
    expect(doc.paths["/api/todos"].get.security).toEqual([{ bearerAuth: [] }]);
  });

  it("documents error responses that were recorded", () => {
    expect(Object.keys(doc.paths["/api/todos/{id}"].get.responses)).toEqual(["200", "404"]);
  });
});

describe("sdk", () => {
  it("renders TypeScript types from schemas", () => {
    expect(schemaToTs({ type: ["string", "null"] })).toBe("string | null");
    expect(schemaToTs({ type: "array", items: { type: ["string", "integer"] } })).toBe("(string | number)[]");
    expect(schemaToTs({ type: "object", properties: { "a-b": { type: "integer" } } })).toBe('{\n  "a-b"?: number;\n}');
    expect(schemaToTs(undefined)).toBe("unknown");
  });

  it("generates one typed method per operation", () => {
    const client = renderClient(fresh(), "todo");
    expect(client).toContain("export class TodoClient");
    expect(client).toContain("async getTodo(id: number): Promise<T.GetTodoResponse>");
    expect(client).toContain("async createTodo(body: T.CreateTodoBody): Promise<T.CreateTodoResponse>");
    expect(client).toContain("async listTodos(query: T.ListTodosQuery = {}): Promise<T.ListTodosResponse>");
    expect(client).toContain("async deleteTodo(id: number): Promise<void>");
    expect(renderTypes(fresh())).toContain("export type UpdateTodoBody = {\n  done?: boolean;\n  title?: string;\n};");
  });
});

describe("mcp server", () => {
  const config = buildServerConfig(fresh(), "todo");

  it("exposes snake_case tools with JSON Schema inputs", () => {
    expect(config.tools.map((t) => t.name)).toEqual([
      "login",
      "get_me",
      "list_todos",
      "get_todo",
      "create_todo",
      "update_todo",
      "delete_todo",
    ]);
    const update = config.tools.find((t) => t.name === "update_todo")!;
    expect(update.inputSchema).toMatchObject({ type: "object", required: ["id"] });
    expect(Object.keys(update.inputSchema.properties!)).toEqual(["id", "done", "title"]);
  });

  it("captures the token from login instead of asking for it", () => {
    expect(config.auth).toEqual({ type: "bearer", env: "TOKEN", capture: { tool: "login", field: "token" } });
    expect(config.envPrefix).toBe("TODO");
  });
});

describe("naming", () => {
  it("sends shapes only, never recorded values", () => {
    const payload = JSON.stringify(namingPayload(fresh()));
    expect(payload).toContain("/api/todos/{id}");
    expect(payload).not.toContain("Buy oat milk");
    expect(payload).not.toContain("REDACTED");
    expect(payload).not.toContain("user1@example.com");
  });

  it("applies valid suggestions and keeps the graph consistent", () => {
    const analysis = fresh();
    applySuggestion(analysis, {
      title: "Todo API",
      description: "A small todo list.",
      operations: [
        { id: "login", name: "signIn", summary: "Sign in", description: "Exchange credentials for a token." },
        { id: "getTodo", name: "not a valid name", summary: "Fetch a todo", description: "Fetch one todo by id." },
        { id: "listTodos", name: "createTodo", summary: "", description: "" },
      ],
    });
    const ids = analysis.operations.map((op) => op.id);
    expect(ids).toContain("signIn");
    expect(ids).toContain("getTodo");
    expect(ids).toContain("listTodos");
    expect(new Set(ids).size).toBe(ids.length);
    expect(analysis.graph.nodes[0]).toBe("signIn");
    expect(analysis.graph.edges.some((e) => e.from === "login")).toBe(false);
    expect(analysis.operations.find((op) => op.id === "getTodo")!.description).toBe("Fetch one todo by id.");
    expect(analysis.title).toBe("Todo API");
  });

  const fakeClient = (reply: object | Error) =>
    ({
      beta: {
        messages: {
          create: async (params: { model: string }) => {
            if (reply instanceof Error) throw reply;
            return { model: params.model, ...reply };
          },
        },
      },
    }) as unknown as Anthropic;

  it("uses Claude's names when the request succeeds", async () => {
    const analysis = fresh();
    const suggestion = {
      title: "Todo API",
      description: "A small todo list.",
      operations: analysis.operations.map((op) => ({
        id: op.id,
        name: op.id === "getMe" ? "getCurrentUser" : op.id,
        summary: `Summary for ${op.id}`,
        description: `Description for ${op.id}.`,
      })),
    };
    const result = await nameWithClaude(analysis, {
      client: fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(suggestion) }] }),
    });
    expect(result).toMatchObject({ source: "claude", model: "claude-fable-5-2", apiDescription: "A small todo list." });
    expect(analysis.operations.map((op) => op.id)).toContain("getCurrentUser");
  });

  it("falls back without throwing on a refusal, bad JSON or a network error", async () => {
    for (const reply of [
      { stop_reason: "refusal", content: [] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "not json" }] },
      new Error("connect ECONNREFUSED"),
    ]) {
      const analysis = fresh();
      const result = await nameWithClaude(analysis, { client: fakeClient(reply) });
      expect(result.source).toBe("fallback");
      expect(result.reason).toBeTruthy();
      expect(analysis.operations[0]!.id).toBe("login");
    }
  });
});
