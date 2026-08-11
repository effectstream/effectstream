import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = "/template";
const readmePath = `${root}/README.md`;
const readme = readFileSync(readmePath, "utf8");
const compose = readFileSync(`${root}/compose.yaml`, "utf8");
const contractsPackage = JSON.parse(readFileSync(`${root}/packages/contracts/package.json`, "utf8"));

describe("Midnight stagenet v2 documentation", () => {
  test("resolves every repository-local Markdown link from the exported template", () => {
    const links = [...readme.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1]);
    const localLinks = links.filter((link) => !/^[a-z]+:/i.test(link) && !link.startsWith("#"));
    expect(localLinks.length).toBeGreaterThanOrEqual(3);
    for (const link of localLinks) {
      const path = resolve(dirname(readmePath), decodeURIComponent(link.split("#")[0]));
      expect(existsSync(path), `missing local README link ${link}`).toBe(true);
    }
  });

  test("documents the exact Docker-only build, test, live, and cleanup commands", () => {
    for (const required of [
      "docker build --pull=false --progress=plain",
      "--target call-tree-build",
      "--profile hermetic up --build --abort-on-container-exit",
      "--exit-code-from tests",
      "--profile live-read run --build --rm live-read-tests",
      "--profile live-write run --build --rm hosted-write-tests",
      "down --volumes --remove-orphans",
      "MIDNIGHT_V2_DIAGNOSTIC_PORT",
      "COMPOSE_PROJECT_NAME",
      "MIDNIGHT_V2_WALLET_SEED_SOURCE_FILE",
      "RUN_STAGENET_WRITE_TESTS=1",
      "MIDNIGHT_V2_WRITE_WALLET_FUNDED=1",
      "lsof -nP",
      "docker ps --format",
    ]) expect(readme).toContain(required);

    for (const profile of ["hermetic", "live-read", "live-write"]) {
      expect(compose).toContain(`- ${profile}`);
    }
  });

  test("fixes the source-to-compile-to-deploy order and security invariants", () => {
    const ordered = [
      "Compile `CryptoEventSink.compact`",
      "compile `FeatureGateway.compact`",
      "Hash both artifact trees",
      "load and authenticate the complete sibling registry",
      "Deploy the sink first",
      "Authenticate call order `[sink, gateway]`",
    ].map((text) => readme.indexOf(text));
    expect(ordered.every((position) => position >= 0)).toBe(true);
    expect([...ordered].sort((a, b) => a - b)).toEqual(ordered);
    expect(contractsPackage.scripts["build:call-tree"]).toBe(
      "bun run build:sink && bun run build:gateway && bun run build:manifest",
    );

    for (const required of [
      "Keccak-256 is not SHA3-256",
      "Unpaused` on every successful call",
      "public undeployed genesis fixture",
      "Never reuse the public undeployed genesis fixture on stagenet",
      "Turnstile token is a manual human prerequisite",
      "positive unshielded NIGHT",
      "completed DUST registration",
      "Hosted deployments are immutable public chain state",
      "delivered at least once",
      "one coherent release slot",
      "Never log proof bytes",
    ]) expect(readme).toContain(required);
  });

  test("pins all four stagenet URLs without host-specific paths or embedded secrets", () => {
    for (const endpoint of [
      "wss://rpc.stagenet.shielded.tools",
      "https://indexer.stagenet.shielded.tools/api/v4/graphql",
      "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
      "https://faucet.stagenet.shielded.tools/api/drips",
    ]) expect(readme).toContain(endpoint);

    expect(readme).not.toMatch(/\/Users\/|\/home\/[A-Za-z0-9._-]+\/|[A-Z]:\\\\/);
    expect(readme).not.toMatch(/MIDNIGHT_V2_(?:WALLET|WRITE_WALLET)_SEED\s*=/);
    expect(readme).toContain("/secure/path/to/disposable.seed");
  });
});
