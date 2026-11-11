import { describe, expect, it } from "vitest";
import { classifySegment, clusterPaths, extractParams, templatePath } from "../src/template.js";

describe("classifySegment", () => {
  it.each([
    ["123", "integer"],
    ["0", "integer"],
    ["3f2b8c1e-9a4d-4e2b-8f6a-1c2d3e4f5a6b", "uuid"],
    ["5f8d0d55b54764421b7156c9", "hex"],
    ["01ARZ3NDEKTSV4RRFFQ69G5FAV", "ulid"],
    ["2026-11-11", "date"],
    ["usr_9f2c81d0", "token"],
    ["a8Kq02LmZx9P", "token"],
    ["REDACTED_TOKEN_1", "token"],
  ])("treats %s as %s", (segment, kind) => {
    expect(classifySegment(segment)).toBe(kind);
  });

  it.each(["users", "v1", "v2.1", "me", "oauth2", "page2", "top10-list", "settings", "search"])(
    "keeps %s literal",
    (segment) => {
      expect(classifySegment(segment)).toBeNull();
    },
  );
});

describe("templatePath", () => {
  it("templates a numeric id", () => {
    expect(templatePath("/users/123").template).toBe("/users/{id}");
  });

  it("types the parameter from its shape", () => {
    expect(templatePath("/users/123").params).toEqual([{ name: "id", kind: "integer", schema: { type: "integer" } }]);
    expect(templatePath("/orders/3f2b8c1e-9a4d-4e2b-8f6a-1c2d3e4f5a6b").params[0]!.schema).toEqual({
      type: "string",
      format: "uuid",
    });
  });

  it("names several parameters after their parent segment", () => {
    expect(templatePath("/users/123/posts/456").template).toBe("/users/{userId}/posts/{postId}");
    expect(templatePath("/api/v1/companies/9/invoices/2026-11-11").template).toBe(
      "/api/v1/companies/{companyId}/invoices/{invoiceDate}",
    );
  });

  it("leaves paths without identifiers alone", () => {
    expect(templatePath("/api/v1/todos").template).toBe("/api/v1/todos");
    expect(templatePath("/").template).toBe("/");
  });

  it("ignores trailing slashes and decodes segments", () => {
    expect(templatePath("/users/123/").template).toBe("/users/{id}");
    expect(templatePath("/files/2026%2D11%2D11").template).toBe("/files/{date}");
  });
});

describe("clusterPaths", () => {
  it("collapses raw URLs into one templated endpoint", () => {
    const lookup = clusterPaths(["/api/todos/17", "/api/todos/42", "/api/todos/108", "/api/todos"]);
    expect(lookup.get("/api/todos/17")!.template).toBe("/api/todos/{id}");
    expect(lookup.get("/api/todos/108")).toBe(lookup.get("/api/todos/42"));
    expect(lookup.get("/api/todos/42")!.paths).toHaveLength(3);
    expect(lookup.get("/api/todos")!.template).toBe("/api/todos");
  });

  it("collapses slugs once enough distinct siblings are seen", () => {
    const lookup = clusterPaths([
      "/blog/posts/hello-world",
      "/blog/posts/shipping-v2",
      "/blog/posts/why-we-rewrote-it",
      "/blog/posts/2026-in-review",
    ]);
    expect(new Set([...lookup.values()].map((c) => c.template))).toEqual(new Set(["/blog/posts/{slug}"]));
  });

  it("does not collapse too few siblings", () => {
    const lookup = clusterPaths(["/blog/posts/hello-world", "/blog/posts/shipping-v2"]);
    expect(lookup.get("/blog/posts/hello-world")!.template).toBe("/blog/posts/hello-world");
  });

  it("does not mistake sibling resources for a parameter", () => {
    const paths = ["/api/users", "/api/todos", "/api/settings", "/api/login", "/api/me", "/api/projects"];
    const lookup = clusterPaths(paths);
    for (const path of paths) expect(lookup.get(path)!.template).toBe(path);
  });

  it("respects minDistinct", () => {
    const paths = ["/tags/a-1", "/tags/b-2"];
    expect(clusterPaths(paths, { minDistinct: 2 }).get("/tags/a-1")!.template).toBe("/tags/{slug}");
  });
});

describe("extractParams", () => {
  it("reads parameter values back out of a raw path", () => {
    expect(extractParams("/users/{userId}/posts/{postId}", "/users/7/posts/99")).toEqual({
      userId: "7",
      postId: "99",
    });
  });
});
