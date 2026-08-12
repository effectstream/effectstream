import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditPublicRuntime } from "./verify-template-runtime-public.ts";

const temporary: string[] = [];

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "effectstream-public-runtime-"));
  temporary.push(root);
  fs.mkdirSync(path.join(root, "templates", "minimal"), { recursive: true });
  fs.mkdirSync(path.join(root, "bin"));
  fs.writeFileSync(path.join(root, "templates", "minimal", "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, "runtime-manifest.json"), "{}\n");
  return root;
}

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("public runtime audit", () => {
  test("accepts ordinary public template sources and explicit examples", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "templates", "minimal", ".env.example"), "API_TOKEN=your-token\n");
    expect(auditPublicRuntime(root, {})).toEqual([]);
  });

  test("rejects credential files and recognizable token values", () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, "templates", "minimal", ".npmrc"), "//registry/:_authToken=value\n");
    fs.writeFileSync(
      path.join(root, "templates", "minimal", "leak.txt"),
      `token=ghp_${"a".repeat(30)}\n`,
    );
    expect(auditPublicRuntime(root, {}).map((finding) => finding.code)).toContainAllValues([
      "credential-file",
      "secret-pattern",
    ]);
  });

  test("rejects populated sensitive image environment variables", () => {
    const root = fixture();
    expect(auditPublicRuntime(root, { GITHUB_TOKEN: "value" })).toEqual([
      expect.objectContaining({ code: "sensitive-environment", location: "GITHUB_TOKEN" }),
    ]);
  });
});
