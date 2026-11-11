// ---- HAR 1.2 (the subset tracekit reads) ----

export interface HarNameValue {
  name: string;
  value: string;
  [extra: string]: unknown;
}

export interface HarRequest {
  method: string;
  url: string;
  headers?: HarNameValue[];
  queryString?: HarNameValue[];
  cookies?: HarNameValue[];
  postData?: { mimeType?: string; text?: string; params?: HarNameValue[] };
  [extra: string]: unknown;
}

export interface HarResponse {
  status: number;
  statusText?: string;
  headers?: HarNameValue[];
  cookies?: HarNameValue[];
  content?: { mimeType?: string; text?: string; encoding?: string; size?: number };
  [extra: string]: unknown;
}

export interface HarEntry {
  startedDateTime?: string;
  time?: number;
  request: HarRequest;
  response: HarResponse;
  _resourceType?: string;
  [extra: string]: unknown;
}

export interface Har {
  log: {
    version?: string;
    creator?: { name: string; version: string };
    entries: HarEntry[];
    [extra: string]: unknown;
  };
}

// ---- Normalised request/response pair ----

export interface Exchange {
  /** Position in the HAR after sorting by start time. */
  index: number;
  startedAt: number;
  method: string;
  origin: string;
  path: string;
  query: Record<string, string>;
  requestHeaders: Record<string, string>;
  requestContentType?: string;
  requestBody?: unknown;
  status: number;
  responseHeaders: Record<string, string>;
  /** Every Set-Cookie header, unmerged. */
  setCookies: string[];
  responseContentType?: string;
  responseBody?: unknown;
}

// ---- Analysis output ----

export type JsonSchema = {
  type?: string | string[];
  format?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  [extra: string]: unknown;
};

export type ParamKind = "integer" | "uuid" | "hex" | "ulid" | "token" | "date" | "slug";

export interface PathParam {
  name: string;
  kind: ParamKind;
  schema: JsonSchema;
}

export interface QueryParam {
  name: string;
  required: boolean;
  schema: JsonSchema;
}

export interface Operation {
  /** camelCase operationId, e.g. listTodos. */
  id: string;
  method: string;
  /** Templated path, e.g. /api/todos/{id}. */
  path: string;
  tag: string;
  summary: string;
  description: string;
  pathParams: PathParam[];
  queryParams: QueryParam[];
  requestBody?: { contentType: string; schema: JsonSchema };
  responses: Record<string, { contentType?: string; schema?: JsonSchema }>;
  /** How many recorded calls back this operation. */
  calls: number;
  /** Whether the recorded calls carried the detected credentials. */
  authenticated: boolean;
}

export type AuthScheme =
  | { type: "none" }
  | { type: "bearer"; header: "authorization" }
  | { type: "apiKey"; in: "header" | "query"; name: string }
  | { type: "cookie"; names: string[] };

export interface AuthInfo {
  scheme: AuthScheme;
  /** Share of API calls that carried the credentials (0..1). */
  coverage: number;
  /** The call that handed out the credentials, when it is in the recording. */
  obtainedFrom?: { method: string; path: string; field?: string };
}

export interface GraphEdge {
  from: string;
  to: string;
  /** order: B followed A in the recording. data: B reused a value A returned. auth: B used credentials A issued. */
  kind: "order" | "data" | "auth";
  count: number;
  via?: string;
}

export interface CallGraph {
  /** Operation ids in order of first appearance. */
  nodes: string[];
  edges: GraphEdge[];
}

export interface RedactionReport {
  enabled: boolean;
  total: number;
  byKind: Record<string, number>;
}

export interface Analysis {
  title: string;
  baseUrl: string;
  operations: Operation[];
  auth: AuthInfo;
  graph: CallGraph;
  redaction: RedactionReport;
  stats: { entries: number; apiCalls: number; skippedOrigins: string[] };
}
