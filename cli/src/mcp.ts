import type { Analysis, JsonSchema } from "@tracekit/core";
import { credentialIssuer, kebab, snake } from "./util.js";

export const MCP_SDK_RANGE = "^1.32.0";

interface ToolConfig {
  name: string;
  description: string;
  method: string;
  path: string;
  pathParams: string[];
  queryParams: string[];
  /** flat: body fields are top-level tool arguments. nested: the body is the `body` argument. */
  body: "none" | "flat" | "nested";
  bodyKeys: string[];
  auth: boolean;
  inputSchema: JsonSchema;
  annotations: Record<string, boolean>;
}

interface ServerConfig {
  name: string;
  version: string;
  baseUrl: string;
  envPrefix: string;
  auth: {
    type: "none" | "bearer" | "apiKey" | "cookie";
    env?: string;
    in?: "header" | "query";
    name?: string;
    /** Tool whose response contains the credential, and the field it is in. */
    capture?: { tool: string; field: string };
  };
  tools: ToolConfig[];
}

export function buildServerConfig(analysis: Analysis, name: string): ServerConfig {
  const scheme = analysis.auth.scheme;
  const issuer = credentialIssuer(analysis);

  // Descriptions refer to other operations by id; tools are named in snake_case.
  const ids = analysis.operations.map((op) => op.id).sort((x, y) => y.length - x.length);
  const toolNames = (text: string): string =>
    ids.reduce((t, id) => t.replace(new RegExp(`\\b${id}\\b`, "g"), snake(id)), text);

  const tools = analysis.operations.map((op): ToolConfig => {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const p of op.pathParams) {
      properties[p.name] = { ...p.schema, description: `Path parameter in ${op.path}` };
      required.push(p.name);
    }
    for (const p of op.queryParams) {
      properties[p.name] = { ...p.schema, description: "Query parameter" };
      if (p.required) required.push(p.name);
    }

    let body: ToolConfig["body"] = "none";
    let bodyKeys: string[] = [];
    const schema = op.requestBody?.schema;
    if (schema) {
      const keys = Object.keys(schema.properties ?? {});
      const flat = schema.type === "object" && keys.length > 0 && !keys.some((k) => k in properties);
      if (flat) {
        body = "flat";
        bodyKeys = keys;
        Object.assign(properties, schema.properties);
        required.push(...(schema.required ?? []));
      } else {
        body = "nested";
        properties["body"] = { ...schema, description: "JSON request body" };
        required.push("body");
      }
    }

    return {
      name: snake(op.id),
      description: toolNames(op.description),
      method: op.method,
      path: op.path,
      pathParams: op.pathParams.map((p) => p.name),
      queryParams: op.queryParams.map((p) => p.name),
      body,
      bodyKeys,
      auth: op.authenticated,
      inputSchema: { type: "object", properties, ...(required.length ? { required } : {}) },
      annotations: {
        readOnlyHint: op.method === "GET",
        destructiveHint: op.method === "DELETE",
        idempotentHint: op.method !== "POST" && op.method !== "PATCH",
        openWorldHint: true,
      },
    };
  });

  const auth: ServerConfig["auth"] = { type: scheme.type };
  if (scheme.type === "bearer") auth.env = "TOKEN";
  if (scheme.type === "apiKey") Object.assign(auth, { env: "API_KEY", in: scheme.in, name: scheme.name });
  if (scheme.type === "cookie") auth.env = "COOKIE";
  if (issuer?.field && scheme.type !== "none") {
    auth.capture = { tool: snake(issuer.op.id), field: issuer.field };
  }

  return {
    name: kebab(name),
    version: "0.1.0",
    baseUrl: analysis.baseUrl,
    envPrefix: snake(name).toUpperCase(),
    auth,
    tools,
  };
}

// The runtime is plain JavaScript with no template literals, so it can be embedded verbatim.
const RUNTIME = String.raw`
const env = (suffix) => process.env[CONFIG.envPrefix + "_" + suffix];
const baseUrl = (env("BASE_URL") || CONFIG.baseUrl).replace(/\/+$/, "");
const timeoutMs = Number(env("TIMEOUT_MS")) || 30000;
const MAX_CHARS = 100000;

// Credentials come from the environment, or from the login tool when the recording had one.
// They stay in this process: tool results never echo them back to the model.
let credential = CONFIG.auth.env ? env(CONFIG.auth.env) : undefined;

function readField(value, path) {
  return path.split(".").reduce((v, key) => (v && typeof v === "object" ? v[key] : undefined), value);
}

function writeField(value, path, replacement) {
  const keys = path.split(".");
  const last = keys.pop();
  const parent = keys.reduce((v, key) => (v && typeof v === "object" ? v[key] : undefined), value);
  if (parent && typeof parent === "object") parent[last] = replacement;
}

async function callTool(tool, args) {
  let path = tool.path;
  for (const name of tool.pathParams) {
    if (args[name] === undefined || args[name] === null || args[name] === "") {
      throw new Error("Missing required argument: " + name);
    }
    path = path.replace("{" + name + "}", encodeURIComponent(String(args[name])));
  }
  const url = new URL(baseUrl + path);
  for (const name of tool.queryParams) {
    if (args[name] !== undefined && args[name] !== null) url.searchParams.set(name, String(args[name]));
  }

  let body;
  if (tool.body === "flat") {
    body = {};
    for (const key of tool.bodyKeys) if (args[key] !== undefined) body[key] = args[key];
  } else if (tool.body === "nested") {
    body = args.body;
  }

  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (tool.auth && CONFIG.auth.type !== "none") {
    if (!credential) {
      const hint = CONFIG.auth.capture ? "Call " + CONFIG.auth.capture.tool + " first, or set " : "Set ";
      throw new Error("Not authenticated. " + hint + CONFIG.envPrefix + "_" + CONFIG.auth.env + ".");
    }
    if (CONFIG.auth.type === "bearer") headers["authorization"] = "Bearer " + credential;
    else if (CONFIG.auth.type === "cookie") headers["cookie"] = credential;
    else if (CONFIG.auth.in === "header") headers[CONFIG.auth.name] = credential;
    else url.searchParams.set(CONFIG.auth.name, credential);
  }

  const response = await fetch(url, {
    method: tool.method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let data;
  try {
    data = text === "" ? undefined : JSON.parse(text);
  } catch {
    data = text;
  }

  const capture = CONFIG.auth.capture;
  if (response.ok && capture && capture.tool === tool.name && data && typeof data === "object") {
    const issued = readField(data, capture.field);
    if (typeof issued === "string" && issued !== "") {
      credential = issued;
      writeField(data, capture.field, "[stored by the MCP server]");
    }
  }

  let rendered = data === undefined ? "(empty response)" : typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (rendered.length > MAX_CHARS) rendered = rendered.slice(0, MAX_CHARS) + "\n... truncated";
  return {
    content: [{ type: "text", text: "HTTP " + response.status + "\n" + rendered }],
    isError: !response.ok,
  };
}

const server = new Server({ name: CONFIG.name, version: CONFIG.version }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: CONFIG.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = CONFIG.tools.find((t) => t.name === request.params.name);
  if (!tool) {
    return { content: [{ type: "text", text: "Unknown tool: " + request.params.name }], isError: true };
  }
  try {
    return await callTool(tool, request.params.arguments ?? {});
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: [{ type: "text", text: message }], isError: true };
  }
});

await server.connect(new StdioServerTransport());
console.error(CONFIG.name + " MCP server ready: " + CONFIG.tools.length + " tools, " + baseUrl);
`;

export function renderMcpServer(analysis: Analysis, name: string): string {
  const config = buildServerConfig(analysis, name);
  return `#!/usr/bin/env node
// Generated by tracekit. Re-run \`tracekit build\` instead of editing by hand.
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const CONFIG = ${JSON.stringify(config, null, 2)};
${RUNTIME}`;
}

export function renderMcpPackage(name: string): string {
  const pkg = {
    name: `${kebab(name)}-mcp-server`,
    version: "0.1.0",
    private: true,
    description: `MCP server for the ${name} API, generated by tracekit.`,
    type: "module",
    bin: { [`${kebab(name)}-mcp-server`]: "./index.js" },
    scripts: { start: "node index.js" },
    engines: { node: ">=20" },
    dependencies: { "@modelcontextprotocol/sdk": MCP_SDK_RANGE },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

export function renderMcpReadme(analysis: Analysis, name: string): string {
  const config = buildServerConfig(analysis, name);
  const prefix = config.envPrefix;
  const envRows = [`| \`${prefix}_BASE_URL\` | API base URL. Defaults to \`${config.baseUrl}\`. |`];
  if (config.auth.env) {
    const what =
      config.auth.type === "bearer" ? "Bearer token" : config.auth.type === "cookie" ? "Cookie header value" : "API key";
    const optional = config.auth.capture ? ` Optional: the \`${config.auth.capture.tool}\` tool can obtain it instead.` : "";
    envRows.push(`| \`${prefix}_${config.auth.env}\` | ${what} for authenticated calls.${optional} |`);
  }
  envRows.push(`| \`${prefix}_TIMEOUT_MS\` | Per-request timeout. Defaults to 30000. |`);

  const env: Record<string, string> = { [`${prefix}_BASE_URL`]: config.baseUrl };
  const mcpJson = {
    mcpServers: { [config.name]: { command: "node", args: ["/absolute/path/to/mcp-server/index.js"], env } },
  };

  return `# ${config.name} MCP server

Generated by [tracekit](https://github.com/hesselb20-ctrl/tracekit) from a recorded session.
${config.tools.length} tools over \`${config.baseUrl}\`.

## Run

\`\`\`bash
npm install
node index.js
\`\`\`

The server speaks MCP over stdio.

## Add to Claude Code

\`\`\`bash
claude mcp add ${config.name} -- node /absolute/path/to/mcp-server/index.js
\`\`\`

Or in \`.mcp.json\`:

\`\`\`json
${JSON.stringify(mcpJson, null, 2)}
\`\`\`

## Environment

| Variable | Purpose |
|---|---|
${envRows.join("\n")}

Credentials stay inside the server process. When a login tool returns a token, the server keeps it
and replaces it in the tool result, so it never enters the model's context.

## Tools

| Tool | Request | Description |
|---|---|---|
${config.tools.map((t) => `| \`${t.name}\` | \`${t.method} ${t.path}\` | ${t.description.replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|")} |`).join("\n")}

Only use this server against applications you own or whose terms allow automated access.
`;
}
