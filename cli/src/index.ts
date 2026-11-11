#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { analyze, parseHar, redactHar, type Analysis } from "@tracekit/core";
import { renderMcpPackage, renderMcpReadme, renderMcpServer } from "./mcp.js";
import { DEFAULT_MODEL, nameWithClaude, type NamingResult } from "./naming.js";
import { renderOpenApi } from "./openapi.js";
import { renderClient, renderSdkIndex, renderTypes } from "./sdk.js";
import { kebab } from "./util.js";

const HELP = `tracekit - turn a recorded browser session (HAR) into an agent tool

Usage
  tracekit build <session.har> --out <dir>   Generate openapi.yaml, sdk/ and mcp-server/
  tracekit inspect <session.har>             Print the inferred endpoints, auth and call order
  tracekit redact <session.har> --out <file> Write a redacted copy of the HAR

Options
  --out, -o <path>     Output directory (build) or file (redact)
  --name <name>        Name for the SDK client and MCP server (default: from the host)
  --origin <url>       Analyse this origin instead of the busiest one
  --min-distinct <n>   Sibling values needed to treat a path segment as a parameter (default 4)
  --no-ai              Skip Claude; use deterministic operation names and descriptions
  --model <id>         Claude model for naming (default ${DEFAULT_MODEL})
  --keep-har           Also write the redacted HAR to <out>/session.redacted.har
  --no-redact          Do not redact secrets. Disables Claude. Only for traffic you fully own
  --help, -h           Show this help

Secrets (tokens, cookies, API keys, passwords, emails) are redacted before anything is
analysed, written or sent to a model. Use tracekit only on your own applications or on
applications whose terms allow automated access.
`;

function fail(message: string): never {
  console.error(`tracekit: ${message}`);
  process.exit(1);
}

function defaultName(analysis: Analysis): string {
  const host = new URL(analysis.baseUrl).hostname;
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":")) return "api";
  const labels = host.split(".").filter((l) => !["www", "api", "app"].includes(l));
  return kebab(labels.length > 1 ? labels.at(-2)! : (labels[0] ?? "api")) || "api";
}

function printSummary(analysis: Analysis): void {
  const { auth, redaction, stats } = analysis;
  console.log(`\n${analysis.baseUrl}  (${stats.apiCalls} API calls out of ${stats.entries} entries)`);
  if (redaction.enabled) {
    const kinds = Object.entries(redaction.byKind)
      .map(([k, n]) => `${n} ${k}`)
      .join(", ");
    console.log(`Redacted ${redaction.total} secret values${kinds ? ` (${kinds})` : ""}`);
  } else {
    console.log("Redaction is OFF");
  }

  console.log("\nEndpoints");
  const width = Math.max(...analysis.operations.map((op) => op.method.length + op.path.length + 1));
  for (const op of analysis.operations) {
    const route = `${op.method} ${op.path}`.padEnd(width);
    console.log(`  ${route}  ${op.id}  (${op.calls} call${op.calls === 1 ? "" : "s"}${op.authenticated ? ", auth" : ""})`);
  }

  const scheme = auth.scheme;
  const how =
    scheme.type === "none"
      ? "none detected"
      : scheme.type === "bearer"
        ? "bearer token"
        : scheme.type === "cookie"
          ? `cookie (${scheme.names.join(", ")})`
          : `API key in ${scheme.in} "${scheme.name}"`;
  const from = auth.obtainedFrom
    ? `, issued by ${auth.obtainedFrom.method} ${auth.obtainedFrom.path}${auth.obtainedFrom.field ? ` (${auth.obtainedFrom.field})` : ""}`
    : "";
  console.log(`\nAuth: ${how}${from}`);

  const deps = analysis.graph.edges.filter((e) => e.kind !== "order");
  console.log(`Call order: ${analysis.graph.nodes.join(" -> ")}`);
  for (const e of deps) {
    console.log(`  ${e.from} -> ${e.to}  [${e.kind}${e.via ? `: ${e.via}` : ""}]`);
  }
  if (stats.skippedOrigins.length) {
    console.log(`\nSkipped other origins: ${stats.skippedOrigins.join(", ")} (use --origin to pick one)`);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: "string", short: "o" },
      name: { type: "string" },
      origin: { type: "string" },
      "min-distinct": { type: "string" },
      "no-ai": { type: "boolean", default: false },
      model: { type: "string" },
      "keep-har": { type: "boolean", default: false },
      "no-redact": { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  const [command, harPath] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  if (!["build", "inspect", "redact"].includes(command)) fail(`unknown command "${command}". Run tracekit --help.`);
  if (!harPath) fail(`missing HAR file. Usage: tracekit ${command} <session.har>`);

  let raw: string;
  try {
    raw = await readFile(harPath, "utf8");
  } catch {
    fail(`cannot read ${harPath}`);
  }

  if (command === "redact") {
    if (!values.out) fail("redact needs --out <file>");
    const { har, report } = redactHar(parseHar(raw));
    await mkdir(dirname(resolve(values.out)), { recursive: true });
    await writeFile(values.out, JSON.stringify(har, null, 2) + "\n");
    console.log(`Redacted ${report.total} secret values -> ${values.out}`);
    return;
  }

  const redact = !values["no-redact"];
  const minDistinct = values["min-distinct"] ? Number(values["min-distinct"]) : undefined;
  if (minDistinct !== undefined && (!Number.isInteger(minDistinct) || minDistinct < 2)) {
    fail("--min-distinct must be an integer of 2 or more");
  }
  const { analysis, har } = analyze(raw, { redact, origin: values.origin, minDistinct });

  if (command === "inspect") {
    printSummary(analysis);
    return;
  }

  if (!values.out) fail("build needs --out <dir>");
  const out = resolve(values.out);
  const name = values.name ?? defaultName(analysis);
  analysis.title = `${name} API`;

  let naming: NamingResult & { apiDescription?: string };
  if (values["no-ai"]) {
    naming = { source: "fallback", reason: "--no-ai" };
  } else if (!redact) {
    // Unredacted traffic never leaves the machine.
    naming = { source: "fallback", reason: "--no-redact disables Claude" };
  } else {
    naming = await nameWithClaude(analysis, { model: values.model });
  }

  const files: [path: string, content: string][] = [
    ["openapi.yaml", renderOpenApi(analysis, naming.apiDescription)],
    ["tracekit.json", JSON.stringify({ generator: "tracekit 0.1.0", name, naming, ...analysis }, null, 2) + "\n"],
    ["sdk/index.ts", renderSdkIndex()],
    ["sdk/client.ts", renderClient(analysis, name)],
    ["sdk/types.ts", renderTypes(analysis)],
    ["mcp-server/package.json", renderMcpPackage(name)],
    ["mcp-server/index.js", renderMcpServer(analysis, name)],
    ["mcp-server/README.md", renderMcpReadme(analysis, name)],
  ];
  if (values["keep-har"]) {
    files.push([redact ? "session.redacted.har" : "session.har", JSON.stringify(har, null, 2) + "\n"]);
  }
  for (const [file, content] of files) {
    const target = join(out, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }

  printSummary(analysis);
  console.log(
    naming.source === "claude"
      ? `\nNames and descriptions: Claude (${naming.model})`
      : `\nNames and descriptions: deterministic (${naming.reason})`,
  );
  console.log(`\nWrote ${files.length} files to ${values.out}`);
  for (const [file] of files) console.log(`  ${file}`);
  console.log(`\nNext: cd ${join(values.out, "mcp-server")} && npm install && node index.js`);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
