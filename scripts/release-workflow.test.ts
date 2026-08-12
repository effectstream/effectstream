import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");

describe("release workflow ownership", () => {
  test("normal npm publication never synchronizes or stages templates", () => {
    const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yaml"), "utf8");
    expect(workflow).not.toContain("sync-template-release.ts");
    expect(workflow).not.toContain("templates/**/package.json");
    expect(workflow).not.toContain("templates/*/bun.lock");
    expect(workflow).toContain("needs: publish");
  });

  test("template synchronization is manual-only", () => {
    const workflow = fs.readFileSync(
      path.join(root, ".github", "workflows", "sync-template-baseline.yaml"),
      "utf8",
    );
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("sync-template-release.ts");
    expect(workflow).not.toMatch(/\n\s+(?:push|release|schedule):/);
  });

  test("template image publication requires a large runner and releases build cache before pull", () => {
    const workflow = fs.readFileSync(
      path.join(root, ".github", "workflows", "template-runtime-image.yaml"),
      "utf8",
    );
    expect(workflow).toContain("TEMPLATE_RUNTIME_RUNNER");
    expect(workflow).toContain("MINIMUM_FREE_KIB=$((50 * 1024 * 1024))");
    expect(workflow).toContain("docker buildx prune --all --force --verbose");
    expect(workflow.indexOf("docker buildx prune --all --force --verbose"))
      .toBeLessThan(workflow.indexOf("docker pull \"$CANDIDATE\""));
  });

  test("final image does not recursively rewrite the installed dependency trees", () => {
    const dockerfile = fs.readFileSync(
      path.join(root, ".github", "Dockerfile.template-runtime"),
      "utf8",
    );
    expect(dockerfile).not.toContain(
      "find /opt/effectstream/templates /opt/effectstream/template-deps",
    );
    expect(dockerfile).toContain(
      "find /opt/effectstream/template-deps -mindepth 1 -maxdepth 1",
    );
  });
});
