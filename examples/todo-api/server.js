// A tiny in-memory todo API for trying tracekit. Not for production: demo credentials,
// no persistence, no rate limiting.
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";

export const DEMO_USER = { email: "ada@example.com", password: "tracekit-demo" };

export function createApp() {
  const app = express();
  app.use(express.json());

  const user = { id: 1, name: "Ada", email: DEMO_USER.email };
  const sessions = new Set();
  let nextId = 109;
  const todos = new Map(
    [
      { id: 17, title: "Record a browser session", done: true },
      { id: 42, title: "Export the HAR file", done: false },
      { id: 108, title: "Run tracekit build", done: false },
    ].map((t, i) => [t.id, { ...t, createdAt: new Date(Date.UTC(2026, 10, 9 + i, 9, 30)).toISOString() }]),
  );

  app.get("/", (_req, res) => {
    res.type("html").send("<!doctype html><title>Todo</title><h1>Todo API</h1><p>See /api/todos</p>");
  });

  app.post("/api/login", (req, res) => {
    const { email, password } = req.body ?? {};
    if (email !== DEMO_USER.email || password !== DEMO_USER.password) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    // Shaped like a JWT so it looks like real traffic. It is random and only lives in memory.
    const part = (n) => randomBytes(n).toString("base64url");
    const token = `eyJhbGciOiJIUzI1NiJ9.${part(24)}.${part(32)}`;
    sessions.add(token);
    res.json({ token, user });
  });

  app.use("/api", (req, res, next) => {
    const token = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
    if (!token || !sessions.has(token)) return res.status(401).json({ error: "Missing or invalid token" });
    next();
  });

  app.get("/api/me", (_req, res) => res.json(user));

  app.get("/api/todos", (req, res) => {
    let list = [...todos.values()];
    if (req.query.done !== undefined) list = list.filter((t) => String(t.done) === req.query.done);
    res.json(list);
  });

  app.post("/api/todos", (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    if (!title) return res.status(400).json({ error: "title is required" });
    const todo = { id: nextId++, title, done: false, createdAt: new Date().toISOString() };
    todos.set(todo.id, todo);
    res.status(201).json(todo);
  });

  app.get("/api/todos/:id", (req, res) => {
    const todo = todos.get(Number(req.params.id));
    if (!todo) return res.status(404).json({ error: "Todo not found" });
    res.json(todo);
  });

  app.patch("/api/todos/:id", (req, res) => {
    const todo = todos.get(Number(req.params.id));
    if (!todo) return res.status(404).json({ error: "Todo not found" });
    if (typeof req.body?.title === "string") todo.title = req.body.title;
    if (typeof req.body?.done === "boolean") todo.done = req.body.done;
    res.json(todo);
  });

  app.delete("/api/todos/:id", (req, res) => {
    if (!todos.delete(Number(req.params.id))) return res.status(404).json({ error: "Todo not found" });
    res.status(204).end();
  });

  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4010;
  createApp().listen(port, "127.0.0.1", () => {
    console.log(`Todo API on http://localhost:${port}`);
    console.log(`Log in with ${DEMO_USER.email} / ${DEMO_USER.password}`);
  });
}
