// Records examples/session.har by driving the example todo API over real HTTP.
//
// A browser's "Save all as HAR with content" produces the same format. This script exists so
// the example is reproducible without clicking through DevTools: every entry below is a real
// request to the local server and its real response.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createApp, DEMO_USER } from "./todo-api/server.js";

const PORT = Number(process.env.PORT) || 4010;
const BASE = `http://localhost:${PORT}`;
const entries = [];

const pairs = (headers) => [...headers.entries()].map(([name, value]) => ({ name, value }));

async function call(method, path, { body, token } = {}) {
  const url = BASE + path;
  const headers = new Headers({ accept: "application/json", "user-agent": "tracekit-example-recorder/0.1" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const text = body === undefined ? undefined : JSON.stringify(body);

  const startedDateTime = new Date().toISOString();
  const t0 = performance.now();
  const response = await fetch(url, { method, headers, body: text });
  const responseText = await response.text();
  const time = Math.round((performance.now() - t0) * 10) / 10;

  entries.push({
    startedDateTime,
    time,
    request: {
      method,
      url,
      httpVersion: "HTTP/1.1",
      headers: pairs(headers),
      queryString: [...new URL(url).searchParams.entries()].map(([name, value]) => ({ name, value })),
      cookies: [],
      headersSize: -1,
      bodySize: text ? Buffer.byteLength(text) : 0,
      ...(text ? { postData: { mimeType: "application/json", text } } : {}),
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      httpVersion: "HTTP/1.1",
      headers: pairs(response.headers),
      cookies: [],
      content: {
        size: Buffer.byteLength(responseText),
        mimeType: response.headers.get("content-type") ?? "",
        text: responseText,
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: Buffer.byteLength(responseText),
    },
    cache: {},
    timings: { send: 0, wait: time, receive: 0 },
  });
  // Space the calls out a little so start times are distinct, as they are in a real session.
  await new Promise((r) => setTimeout(r, 15));
  return responseText && response.headers.get("content-type")?.includes("json") ? JSON.parse(responseText) : undefined;
}

const server = createApp().listen(PORT, "127.0.0.1");
await new Promise((r) => server.once("listening", r));

try {
  // The session: open the app, log in, look around, add, complete and delete todos.
  await call("GET", "/");
  const { token } = await call("POST", "/api/login", { body: DEMO_USER });
  await call("GET", "/api/me", { token });
  await call("GET", "/api/todos", { token });
  await call("GET", "/api/todos/17", { token });
  await call("GET", "/api/todos/42", { token });
  const milk = await call("POST", "/api/todos", { token, body: { title: "Buy oat milk" } });
  const mail = await call("POST", "/api/todos", { token, body: { title: `Reply to ${DEMO_USER.email}` } });
  await call("GET", `/api/todos/${milk.id}`, { token });
  await call("PATCH", "/api/todos/42", { token, body: { done: true } });
  await call("PATCH", `/api/todos/${milk.id}`, { token, body: { title: "Buy oat milk and coffee", done: true } });
  await call("GET", "/api/todos?done=true", { token });
  await call("GET", "/api/todos?done=false", { token });
  await call("DELETE", `/api/todos/${mail.id}`, { token });
  await call("DELETE", "/api/todos/108", { token });
  await call("GET", "/api/todos/108", { token }); // 404 on purpose: error responses get a schema too
  await call("GET", "/api/todos", { token });
} finally {
  server.close();
}

const har = {
  log: {
    version: "1.2",
    creator: { name: "tracekit-example-recorder", version: "0.1.0" },
    pages: [],
    entries,
  },
};
const out = fileURLToPath(new URL("./session.har", import.meta.url));
await writeFile(out, JSON.stringify(har, null, 2) + "\n");
console.log(`Recorded ${entries.length} requests -> examples/session.har`);
