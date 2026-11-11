// The example session the whole video is built around: the local Express todo API.

export type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface RawCall {
  method: Method;
  path: string;
  status: number;
  cluster: number;
}

export const rawCalls: RawCall[] = [
  { method: "POST", path: "/api/login", status: 200, cluster: 0 },
  { method: "GET", path: "/api/me", status: 200, cluster: 1 },
  { method: "GET", path: "/api/todos", status: 200, cluster: 2 },
  { method: "POST", path: "/api/todos", status: 201, cluster: 3 },
  { method: "GET", path: "/api/todos/17", status: 200, cluster: 4 },
  { method: "PATCH", path: "/api/todos/17", status: 200, cluster: 5 },
  { method: "GET", path: "/api/todos/42", status: 200, cluster: 4 },
  { method: "POST", path: "/api/todos", status: 201, cluster: 3 },
  { method: "GET", path: "/api/todos/108", status: 200, cluster: 4 },
  { method: "PATCH", path: "/api/todos/108", status: 200, cluster: 5 },
  { method: "DELETE", path: "/api/todos/42", status: 204, cluster: 6 },
  { method: "GET", path: "/api/todos", status: 200, cluster: 2 },
];

export interface Cluster {
  method: Method;
  path: string;
  operationId: string;
  tool: string;
}

export const clusters: Cluster[] = [
  { method: "POST", path: "/api/login", operationId: "login", tool: "login" },
  { method: "GET", path: "/api/me", operationId: "getMe", tool: "get_me" },
  { method: "GET", path: "/api/todos", operationId: "listTodos", tool: "list_todos" },
  { method: "POST", path: "/api/todos", operationId: "createTodo", tool: "create_todo" },
  { method: "GET", path: "/api/todos/{id}", operationId: "getTodo", tool: "get_todo" },
  { method: "PATCH", path: "/api/todos/{id}", operationId: "updateTodo", tool: "update_todo" },
  { method: "DELETE", path: "/api/todos/{id}", operationId: "deleteTodo", tool: "delete_todo" },
];

export const clusterCounts = clusters.map((_, i) => rawCalls.filter((c) => c.cluster === i).length);

export const repoUrl = "github.com/hesselb20-ctrl/tracekit";
