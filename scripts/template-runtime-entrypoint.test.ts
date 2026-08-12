import { afterEach, describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  embeddedTemplate,
  materializeTemplate,
  prepareSolanaHome,
  prepareYaciHome,
  removeWorkspaceVolumeSeed,
} from "./template-runtime-entrypoint.ts";

const temporary: string[] = [];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "effectstream-entrypoint-"));
  temporary.push(root);
  const source = path.join(root, "templates", "minimal");
  const deps = path.join(root, "template-deps", "minimal");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(deps, { recursive: true });
  fs.writeFileSync(path.join(source, "bun.lock"), "fixture lock\n");
  fs.writeFileSync(path.join(source, "package.json"), "{}\n");
  fs.writeFileSync(path.join(deps, "installed.txt"), "yes\n");
  const lockSha256 = crypto.createHash("sha256").update("fixture lock\n").digest("hex");
  fs.writeFileSync(path.join(root, "runtime-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    effectstreamVersion: "1.2.3",
    templateBaselineVersion: "1.1.0",
    releaseSha: "a".repeat(40),
    platform: "linux-amd64",
    templates: [{ name: "minimal", lockSha256 }],
  }));
  return { root, destination: path.join(root, "workspace") };
}

afterEach(() => {
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("template runtime entrypoint", () => {
  test("validates template names", () => {
    expect(() => embeddedTemplate("unknown", { templates: [{ name: "minimal", lockSha256: "x" }] } as any)).toThrow("unknown template");
  });

  test("copies source and installed dependencies into a writable workspace", () => {
    const { root, destination } = fixture();
    expect(materializeTemplate({ name: "minimal", destination, runtimeRoot: root })).toBe(destination);
    expect(fs.readFileSync(path.join(destination, "package.json"), "utf8")).toBe("{}\n");
    expect(fs.readFileSync(path.join(destination, "node_modules", "installed.txt"), "utf8")).toBe("yes\n");
    expect(JSON.parse(fs.readFileSync(path.join(destination, ".effectstream-template.json"), "utf8"))).toMatchObject({
      name: "minimal",
      effectstreamVersion: "1.2.3",
      templateBaselineVersion: "1.1.0",
    });
  });

  test("is idempotent for a matching materialized release", () => {
    const { root, destination } = fixture();
    materializeTemplate({ name: "minimal", destination, runtimeRoot: root });
    fs.writeFileSync(path.join(destination, "local-change.txt"), "keep\n");
    const manifestFile = path.join(root, "runtime-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    manifest.effectstreamVersion = "1.2.4";
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    materializeTemplate({ name: "minimal", destination, runtimeRoot: root });
    expect(fs.existsSync(path.join(destination, "local-change.txt"))).toBe(true);
    expect(JSON.parse(
      fs.readFileSync(path.join(destination, ".effectstream-template.json"), "utf8"),
    )).toMatchObject({ effectstreamVersion: "1.2.4", templateBaselineVersion: "1.1.0" });
  });

  test("refuses unrelated non-empty destinations", () => {
    const { root, destination } = fixture();
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, "unrelated"), "x");
    expect(() => materializeTemplate({ name: "minimal", destination, runtimeRoot: root })).toThrow("not empty");
  });

  test("removes the named-volume ownership seed before materialization", () => {
    const { root, destination } = fixture();
    fs.mkdirSync(destination);
    const seed = path.join(destination, ".effectstream-volume");
    fs.writeFileSync(seed, "");
    removeWorkspaceVolumeSeed(destination);
    expect(fs.existsSync(seed)).toBe(false);
    expect(fs.readdirSync(destination)).toEqual([]);
    expect(fs.existsSync(root)).toBe(true);
  });

  test("seeds a writable Yaci home with read-only Cardano payload links", () => {
    const { root } = fixture();
    const payload = path.join(root, "cache", "binaries", "cardano-node", "10.1.4", "linux-amd64");
    fs.mkdirSync(path.join(payload, "bin"), { recursive: true });
    fs.mkdirSync(path.join(payload, "share"), { recursive: true });
    fs.writeFileSync(path.join(payload, "bin", "cardano-node"), "fixture");
    const home = path.join(root, "home");
    const yaciHome = prepareYaciHome({ runtimeRoot: root, home });
    expect(fs.realpathSync(path.join(yaciHome, "cardano-node"))).toBe(payload);
    expect(fs.realpathSync(path.join(yaciHome, "bin"))).toBe(path.join(payload, "bin"));
  });

  test("links the preloaded Solana platform tools into the user's cache", () => {
    const { root } = fixture();
    const payload = path.join(root, "cache", "solana-platform-tools", "v1.52");
    fs.mkdirSync(path.join(payload, "rust", "bin"), { recursive: true });
    fs.writeFileSync(path.join(payload, "rust", "bin", "rustc"), "fixture");
    const destination = prepareSolanaHome({ runtimeRoot: root, home: path.join(root, "home") });
    expect(fs.realpathSync(destination)).toBe(payload);
  });
});
