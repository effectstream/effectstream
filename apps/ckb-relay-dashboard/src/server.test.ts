import { describe, expect, test } from "bun:test";
import { handler, loopback, parsePagination, validEventId } from "./server.ts";

describe("dashboard API boundaries", () => {
  test("accepts only unauthenticated loopback HTTP RPC URLs", () => {
    expect(loopback("http://127.0.0.1:8114").hostname).toBe("127.0.0.1");
    for (const url of ["https://127.0.0.1", "http://example.com", "http://user:pass@localhost", "http://localhost/?x=1"]) {
      expect(() => loopback(url)).toThrow();
    }
  });

  test("validates deterministic CKB event IDs", () => {
    expect(validEventId(`ckb-cell-created:${"a".repeat(64)}`)).toBe(true);
    expect(validEventId("anything")).toBe(false);
    expect(validEventId(`ckb-cell-created:${"A".repeat(64)}`)).toBe(false);
  });

  test("bounds pagination and search inputs", () => {
    expect(parsePagination(new URL("http://local/api?page=2&pageSize=50&q=abc"))).toEqual({ page: 2, pageSize: 50, query: "abc" });
    for (const search of ["?page=0", "?page=1.2", "?pageSize=101", `?q=${"a".repeat(161)}`]) {
      expect(parsePagination(new URL(`http://local/api${search}`))).toBeNull();
    }
  });

  test("serves the dashboard locally and rejects unknown API routes", async () => {
    const page = await handler(new Request("http://127.0.0.1/"));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    const missing = await handler(new Request("http://127.0.0.1/api/v1/nope"));
    expect(missing.status).toBe(404);
    const malformedId = await handler(new Request(`http://127.0.0.1/api/v1/events/${"a".repeat(64)}`));
    expect(malformedId.status).toBe(400);
    const absentDb = await handler(new Request("http://127.0.0.1/api/v1/events?page=0"));
    expect(absentDb.status).toBe(400);
    const validWithoutDb = await handler(new Request("http://127.0.0.1/api/v1/events"));
    expect(validWithoutDb.status).toBe(503);
  });
});
