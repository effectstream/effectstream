import { afterEach, describe, expect, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  copyTemplateForRuntime,
  linkLegacyBinaryCaches,
} from "./prepare-template-runtime.ts";

const temporary: string[] = [];

afterEach(() => {
  for (const directory of temporary.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("prepare template runtime", () => {
  test("moves installed dependencies while preserving Bun cache hardlinks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "effectstream-prepare-runtime-"));
    temporary.push(root);
    const source = path.join(root, "source", "minimal");
    const output = path.join(root, "output");
    const cacheFile = path.join(root, "cache", "package.js");
    const installedFile = path.join(source, "node_modules", "package", "index.js");
    fs.mkdirSync(path.dirname(installedFile), { recursive: true });
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    fs.writeFileSync(path.join(source, "bun.lock"), "fixture lock\n");
    fs.writeFileSync(path.join(source, "package.json"), "{}\n");
    fs.writeFileSync(cacheFile, "export default true;\n");
    fs.linkSync(cacheFile, installedFile);

    const embedded = copyTemplateForRuntime(source, output, "minimal");
    const destination = path.join(output, "template-deps", "minimal", "package", "index.js");

    expect(fs.existsSync(path.join(source, "node_modules"))).toBe(false);
    expect(fs.readFileSync(path.join(output, "templates", "minimal", "package.json"), "utf8"))
      .toBe("{}\n");
    expect(fs.statSync(destination).ino).toBe(fs.statSync(cacheFile).ino);
    expect(embedded).toEqual({
      name: "minimal",
      lockSha256: crypto.createHash("sha256").update("fixture lock\n").digest("hex"),
    });
  });

  test("links older wrapper cache paths to the verified shared payload", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "effectstream-legacy-binaries-"));
    temporary.push(root);
    const template = path.join(root, "template");
    const output = path.join(root, "output");
    const packageRoot = path.join(
      template,
      "node_modules",
      ".bun",
      "@effectstream+npm-midnight-node@0.103.3",
      "node_modules",
      "@effectstream",
      "npm-midnight-node",
    );
    const sharedBinary = path.join(
      output,
      "cache",
      "binaries",
      "midnight-node",
      "1.0.0",
      "linux-amd64",
      "bin",
      "midnight-node",
    );
    const bitcoinPackage = path.join(
      template,
      "node_modules",
      ".bun",
      "@effectstream+bitcoin-core@0.103.3",
      "node_modules",
      "@effectstream",
      "bitcoin-core",
    );
    const bitcoinRoot = path.join(
      output,
      "cache",
      "binaries",
      "bitcoin-core",
      "28.1",
      "linux-amd64",
    );
    fs.mkdirSync(packageRoot, { recursive: true });
    fs.mkdirSync(path.dirname(sharedBinary), { recursive: true });
    fs.mkdirSync(bitcoinPackage, { recursive: true });
    fs.mkdirSync(path.join(bitcoinRoot, "bin"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), "{}\n");
    fs.writeFileSync(sharedBinary, "fixture\n");
    fs.writeFileSync(path.join(bitcoinPackage, "package.json"), "{}\n");
    fs.writeFileSync(path.join(bitcoinRoot, "bin", "bitcoind"), "fixture\n");

    expect(linkLegacyBinaryCaches(template, output, "linux-amd64")).toBe(2);
    expect(fs.realpathSync(path.join(packageRoot, "midnight-node", "midnight-node")))
      .toBe(sharedBinary);
    expect(fs.realpathSync(path.join(bitcoinPackage, "vendor"))).toBe(bitcoinRoot);
  });
});
