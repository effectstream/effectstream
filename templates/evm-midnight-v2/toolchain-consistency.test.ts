import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const templateRoot = import.meta.dir;
const repositoryRoot = resolve(templateRoot, "../..");

const readTemplate = (path: string) =>
  readFileSync(join(templateRoot, path), "utf8");
const readRepository = (path: string) =>
  readFileSync(join(repositoryRoot, path), "utf8");

function selectedCompactVersion(): string {
  const declaration = join(templateRoot, "toolchain.json");
  if (existsSync(declaration)) {
    return JSON.parse(readFileSync(declaration, "utf8")).compact.version;
  }

  const contractPackage = JSON.parse(
    readTemplate("packages/contracts-midnight/contract-round-value/package.json"),
  );
  const match = contractPackage.scripts.compact.match(/compact compile \+([^ ]+)/);
  if (!match) throw new Error("No Compact selection found in the baseline compile script");
  return match[1];
}

const compactVersion = selectedCompactVersion();

describe("EVM/Midnight template toolchain selection", () => {
  test("executable paths consume one template-owned declaration", () => {
    expect(compactVersion).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);

    const declaration = JSON.parse(readTemplate("toolchain.json"));
    expect(declaration.compact.version).toBe(compactVersion);
    expect(declaration.compact.releaseBaseUrl).toContain(compactVersion);
    expect(Object.keys(declaration.compact.targets).sort()).toEqual([
      "aarch64-darwin",
      "aarch64-unknown-linux-musl",
      "x86_64-darwin",
      "x86_64-unknown-linux-musl",
    ]);
    for (const target of Object.values(declaration.compact.targets) as Array<{
      asset: string;
      sha256: string;
    }>) {
      expect(target.asset).toContain(compactVersion);
      expect(target.sha256).toMatch(/^[0-9a-f]{64}$/);
    }

    const runner = readTemplate("toolchain/compact.ts");
    expect(runner).toContain("toolchain.json");

    const contractPackage = readTemplate(
      "packages/contracts-midnight/contract-round-value/package.json",
    );
    expect(contractPackage).toContain("../../../toolchain/compact.ts compile");
    expect(contractPackage).not.toMatch(/compact compile \+\d/);

    const dockerfile = readTemplate("Dockerfile");
    expect(dockerfile).toContain("COPY toolchain.json");
    expect(dockerfile).toContain("toolchain/compact.ts install");
    expect(dockerfile).not.toContain("0.31.0");
    expect(dockerfile).not.toContain(compactVersion);

    const start = readTemplate("start.dev.ts");
    expect(start).toContain('from "./toolchain/compact"');
    expect(start).toContain("midnight-compact-preflight");
    expect(start).toContain("compactSelection");
    expect(start).not.toContain(compactVersion);
  });

  test("canonical onboarding names Foundry and the selected Compact version before startup", () => {
    const onboarding = [
      ["root README", readRepository("README.md")],
      ["docs intro", readRepository("docs/site/docs/home/0-intro/0-intro.md")],
      ["docs Quick Start", readRepository("docs/site/docs/home/10-quickstart/10-quickstart.md")],
      ["template README", readTemplate("README.md")],
      ["generated template docs", readRepository("docs/site/docs/home/1200-templates/1201-evm-midnight.md")],
      ["template developer note", readTemplate("CLAUDE.md")],
    ] as const;

    for (const [label, markdown] of onboarding) {
      const firstStartup = markdown.indexOf("bun run dev");
      expect(firstStartup, `${label} must include bun run dev`).toBeGreaterThan(-1);
      expect(markdown.indexOf("Foundry"), `${label} must name Foundry before startup`)
        .toBeGreaterThan(-1);
      expect(markdown.indexOf("Foundry"), `${label} must name Foundry before startup`)
        .toBeLessThan(firstStartup);
      expect(markdown.indexOf(compactVersion), `${label} must name the selected Compact version before startup`)
        .toBeGreaterThan(-1);
      expect(markdown.indexOf(compactVersion), `${label} must name the selected Compact version before startup`)
        .toBeLessThan(firstStartup);
      expect(markdown, `${label} must not advertise the stale Compact selection`)
        .not.toContain("0.31.0");
    }
  });
});
