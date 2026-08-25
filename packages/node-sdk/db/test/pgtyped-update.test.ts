import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../scripts/pgtyped-update.ts";

const configMarker = "quoted \"value\" with newline\nand unicode ✓";

async function expectPortClosed(port: number): Promise<void> {
  await expect(new Promise<void>((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("error", reject);
  })).rejects.toMatchObject({ code: "ECONNREFUSED" });
}

async function runAndCapture(
  pgtypedBin: URL,
  pgtypedTimeoutMs = 30_000,
): Promise<{
  closeCount: number;
  derivedConfigPath: string;
  output: string;
  port: number;
  error?: unknown;
}> {
  const configDirectory = await mkdtemp(join(tmpdir(), "effectstream-pgtyped-test-"));
  const configPath = join(configDirectory, "pgtypedconfig.json");
  await writeFile(configPath, JSON.stringify({
    customMarker: configMarker,
    db: {
      dbName: "wrong-db",
      host: "wrong-host",
      password: "special ✓ password",
      port: 1,
      ssl: false,
      user: "wrong-user",
    },
    dbUrl: "postgresql://must-not-be-used",
    failOnError: false,
    maxWorkerThreads: 1,
    srcDir: "./sql",
    transforms: [],
  }));

  const originalClose = PGlite.prototype.close;
  const originalInfo = console.info;
  const originalLog = console.log;
  const originalError = console.error;
  let closeCount = 0;
  const output: string[] = [];

  PGlite.prototype.close = async function () {
    closeCount += 1;
    return await originalClose.call(this);
  };
  console.info = (...args: unknown[]) => output.push(args.join(" "));
  console.log = (...args: unknown[]) => output.push(args.join(" "));
  console.error = (...args: unknown[]) => output.push(args.join(" "));

  let error: unknown;
  try {
    await main({
      userMigrations: [],
      pgtypedConfigPath: configPath,
      pgtypedBin: pgtypedBin.pathname,
      pgtypedTimeoutMs,
    });
  } catch (caught) {
    error = caught;
  } finally {
    PGlite.prototype.close = originalClose;
    console.info = originalInfo;
    console.log = originalLog;
    console.error = originalError;
    await rm(configDirectory, { force: true, recursive: true });
  }

  const text = output.join("\n");
  const match = text.match(/database: server listening on port (\d+)/);
  if (!match) throw new Error(`No reported PGlite port in output:\n${text}`);
  const configMatch = text.match(/PGTYPED_CONFIG_PATH:(.+)/);
  if (!configMatch) throw new Error(`No derived pgtyped config path in output:\n${text}`);
  return {
    closeCount,
    derivedConfigPath: configMatch[1],
    output: text,
    port: Number(match[1]),
    error,
  };
}

test("pgtyped update uses the reported IPv4 connection and closes every resource on success", async () => {
  const result = await runAndCapture(new URL("./fixtures/pgtyped/success.mjs", import.meta.url));

  expect(result.error).toBeUndefined();
  expect(result.output).toContain(`PGTYPED_CONNECTION_OK:${result.port}`);
  expect(result.output).toContain("PGTYPED_CONFIG_SHAPE_OK");
  expect(result.port).not.toBe(5432);
  expect(result.closeCount).toBe(1);
  expect(existsSync(result.derivedConfigPath)).toBe(false);
  await expectPortClosed(result.port);
}, 30_000);

test("pgtyped update closes every resource when its child fails", async () => {
  const result = await runAndCapture(new URL("./fixtures/pgtyped/failure.mjs", import.meta.url));

  expect(result.error).toEqual(new Error("pgtyped failed with exit code 23"));
  expect(result.output).toContain("PGTYPED_INJECTED_FAILURE");
  expect(result.closeCount).toBe(1);
  expect(existsSync(result.derivedConfigPath)).toBe(false);
  await expectPortClosed(result.port);
}, 30_000);

test("pgtyped update times out its child and removes the derived config", async () => {
  const result = await runAndCapture(
    new URL("./fixtures/pgtyped/hang.mjs", import.meta.url),
    100,
  );

  expect(result.error).toEqual(new Error("pgtyped timed out after 100ms"));
  expect(result.output).toContain("PGTYPED_INJECTED_HANG");
  expect(result.closeCount).toBe(1);
  expect(existsSync(result.derivedConfigPath)).toBe(false);
  await expectPortClosed(result.port);
}, 30_000);
