// End-to-end check: start the example API, connect to the generated MCP server over stdio
// with a real MCP client, and call a few tools. Run `npm install` in generated/mcp-server first.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createApp, DEMO_USER } from "./todo-api/server.js";

const serverDir = fileURLToPath(new URL("./generated/mcp-server/", import.meta.url));
const require = createRequire(serverDir);
const load = (id) => import(pathToFileURL(require.resolve(id)).href);
const { Client } = await load("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = await load("@modelcontextprotocol/sdk/client/stdio.js");

const PORT = Number(process.env.PORT) || 4010;
const api = createApp().listen(PORT, "127.0.0.1");
await new Promise((r) => api.once("listening", r));

const client = new Client({ name: "tracekit-example", version: "0.1.0" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [serverDir + "index.js"],
    env: { ...process.env, TODO_BASE_URL: `http://localhost:${PORT}` },
  }),
);

const show = (label, result) => console.log(`\n> ${label}${result.isError ? "  [error]" : ""}\n${result.content[0].text}`);
let failed = false;
const expect = (condition, message) => {
  if (!condition) {
    failed = true;
    console.error(`FAILED: ${message}`);
  }
};

try {
  const { tools } = await client.listTools();
  console.log(`tools: ${tools.map((t) => t.name).join(", ")}`);
  expect(tools.length === 7, "expected 7 tools");

  const early = await client.callTool({ name: "list_todos", arguments: {} });
  show("list_todos (before login)", early);
  expect(early.isError === true, "list_todos should fail before login");

  const login = await client.callTool({ name: "login", arguments: DEMO_USER });
  show("login", login);
  expect(!login.isError && !/eyJ/.test(login.content[0].text), "login should succeed without echoing the token");

  const list = await client.callTool({ name: "list_todos", arguments: { done: false } });
  show("list_todos { done: false }", list);
  expect(!list.isError, "list_todos should succeed after login");

  const created = await client.callTool({ name: "create_todo", arguments: { title: "Called through MCP" } });
  show("create_todo", created);
  const id = JSON.parse(created.content[0].text.replace(/^HTTP \d+\n/, "")).id;

  const updated = await client.callTool({ name: "update_todo", arguments: { id, done: true } });
  show("update_todo", updated);
  expect(/"done": true/.test(updated.content[0].text), "update_todo should mark the todo done");

  const removed = await client.callTool({ name: "delete_todo", arguments: { id } });
  show("delete_todo", removed);
  expect(!removed.isError, "delete_todo should succeed");
} finally {
  await client.close();
  api.close();
}

console.log(failed ? "\nMCP round trip FAILED" : "\nMCP round trip OK");
process.exit(failed ? 1 : 0);
