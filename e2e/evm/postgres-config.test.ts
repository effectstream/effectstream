import { afterEach, expect, test } from "bun:test";
import net from "node:net";
import {
  assertCkbAcceptancePortFree,
  ckbAcceptanceDatabaseUrl,
  DEFAULT_CKB_ACCEPTANCE_DB_PORT,
  resolveCkbAcceptanceDbPort,
  stopOwnedPostgres,
} from "./postgres-config.ts";

const servers: net.Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

test("CKB acceptance PostgreSQL port defaults to 55432", () => {
  expect(resolveCkbAcceptanceDbPort()).toBe(DEFAULT_CKB_ACCEPTANCE_DB_PORT);
});

test("blank CKB acceptance PostgreSQL port preserves the default", () => {
  expect(resolveCkbAcceptanceDbPort(" ")).toBe(DEFAULT_CKB_ACCEPTANCE_DB_PORT);
});

test("CKB acceptance PostgreSQL port and URL use the configured port", () => {
  const port = resolveCkbAcceptanceDbPort("55433");
  expect(port).toBe(55433);
  expect(ckbAcceptanceDatabaseUrl(port)).toBe("postgresql://effectstream@127.0.0.1:55433/effectstream");
});

test.each(["abc", "1.5", "0", "1023", "65536", "999999999999999999999"]) (
  "rejects invalid CKB acceptance port %j",
  (value) => {
    expect(() => resolveCkbAcceptanceDbPort(value)).toThrow("CKB_ACCEPTANCE_DB_PORT");
  },
);

test("rejects an occupied configured loopback port", async () => {
  const server = net.createServer();
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP listener address");
  await expect(assertCkbAcceptancePortFree(address.port, async (port) => {
    return await new Promise<boolean>((resolve) => {
      const probe = net.createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
  })).rejects.toThrow(`loopback port ${address.port} is already occupied`);
});

test("cleanup stops only a PostgreSQL instance marked as started by this run", async () => {
  let stopCalls = 0;
  const stop = async () => { stopCalls++; };
  await stopOwnedPostgres(false, stop);
  expect(stopCalls).toBe(0);
  await stopOwnedPostgres(true, stop);
  expect(stopCalls).toBe(1);
});
