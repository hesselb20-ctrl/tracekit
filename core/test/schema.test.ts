import { describe, expect, it } from "vitest";
import { inferSchema, inferStringEncoded } from "../src/schema.js";

describe("inferSchema", () => {
  it("returns undefined without samples", () => {
    expect(inferSchema([])).toBeUndefined();
    expect(inferSchema([undefined])).toBeUndefined();
  });

  it("infers primitives", () => {
    expect(inferSchema(["hi"])).toEqual({ type: "string" });
    expect(inferSchema([3])).toEqual({ type: "integer" });
    expect(inferSchema([3.5])).toEqual({ type: "number" });
    expect(inferSchema([true])).toEqual({ type: "boolean" });
    expect(inferSchema([null])).toEqual({ type: "null" });
  });

  it("infers an object with all keys required from one sample", () => {
    expect(inferSchema([{ id: 1, title: "Buy milk", done: false }])).toEqual({
      type: "object",
      properties: { id: { type: "integer" }, title: { type: "string" }, done: { type: "boolean" } },
      required: ["done", "id", "title"],
    });
  });

  it("marks a property optional when a sample lacks it", () => {
    const schema = inferSchema([
      { id: 1, title: "a", note: "x" },
      { id: 2, title: "b" },
    ])!;
    expect(schema.required).toEqual(["id", "title"]);
    expect(Object.keys(schema.properties!)).toEqual(["id", "title", "note"]);
  });

  it("widens integer and number to number", () => {
    expect(inferSchema([{ price: 3 }, { price: 3.5 }])!.properties!.price).toEqual({ type: "number" });
  });

  it("keeps null as part of the type", () => {
    expect(inferSchema([{ due: null }, { due: "2026-11-11" }])!.properties!.due).toEqual({
      type: ["string", "null"],
      format: "date",
    });
  });

  it("detects string formats", () => {
    const schema = inferSchema([
      {
        createdAt: "2026-11-11T09:30:00.000Z",
        day: "2026-11-11",
        email: "user1@example.com",
        id: "3f2b8c1e-9a4d-4e2b-8f6a-1c2d3e4f5a6b",
        url: "https://example.com/a",
      },
    ])!;
    expect(schema.properties).toEqual({
      createdAt: { type: "string", format: "date-time" },
      day: { type: "string", format: "date" },
      email: { type: "string", format: "email" },
      id: { type: "string", format: "uuid" },
      url: { type: "string", format: "uri" },
    });
  });

  it("drops a format that not every sample matches", () => {
    expect(inferSchema(["2026-11-11", "tomorrow"])).toEqual({ type: "string" });
    expect(inferSchema(["tomorrow", "2026-11-11"])).toEqual({ type: "string" });
    expect(inferSchema(["2026-11-11", "2026-11-11T09:30:00Z"])).toEqual({ type: "string" });
  });

  it("merges array items across elements and samples", () => {
    expect(inferSchema([[{ id: 1, tag: "a" }, { id: 2 }], [{ id: 3 }]])).toEqual({
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, tag: { type: "string" } },
        required: ["id"],
      },
    });
  });

  it("handles empty arrays without inventing an item type", () => {
    expect(inferSchema([[]])).toEqual({ type: "array" });
    expect(inferSchema([[], [1]])).toEqual({ type: "array", items: { type: "integer" } });
  });

  it("merges nested objects", () => {
    const schema = inferSchema([
      { user: { id: 1, name: "Ada" } },
      { user: { id: 2, name: "Lin", admin: true } },
    ])!;
    expect(schema.properties!.user).toEqual({
      type: "object",
      properties: { id: { type: "integer" }, name: { type: "string" }, admin: { type: "boolean" } },
      required: ["id", "name"],
    });
  });

  it("represents mixed types as a type union", () => {
    expect(inferSchema([1, "one", null])).toEqual({ type: ["string", "integer", "null"] });
  });

  it("emits no bookkeeping keywords", () => {
    expect(JSON.stringify(inferSchema([{ a: "x", b: ["y"] }]))).not.toContain("x-");
  });
});

describe("inferStringEncoded", () => {
  it("types query-string values", () => {
    expect(inferStringEncoded(["1", "20"])).toEqual({ type: "integer" });
    expect(inferStringEncoded(["1.5", "2"])).toEqual({ type: "number" });
    expect(inferStringEncoded(["true", "false"])).toEqual({ type: "boolean" });
    expect(inferStringEncoded(["open", "done"])).toEqual({ type: "string" });
    expect(inferStringEncoded(["2026-11-11"])).toEqual({ type: "string", format: "date" });
  });
});
