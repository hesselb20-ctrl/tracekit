#!/usr/bin/env node
// Stable launcher so the bin link exists before the first build.
try {
  await import("../dist/index.js");
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND" && String(error.message).includes("dist")) {
    console.error("tracekit is not built yet. Run `npm run build` in the tracekit repo first.");
    process.exit(1);
  }
  throw error;
}
