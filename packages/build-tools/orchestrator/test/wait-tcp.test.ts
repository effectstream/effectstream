import { describe, expect, spyOn, test } from "bun:test";
import {
  DEFAULT_TCP_TIMEOUT_MS,
  parseWaitTcpArgs,
  waitForTcp,
} from "../scripts/wait-tcp.ts";

describe("bounded TCP readiness", () => {
  test("uses a 60-second default and parses diagnostic fields", () => {
    expect(DEFAULT_TCP_TIMEOUT_MS).toBe(60_000);
    expect(
      parseWaitTcpArgs([
        "18771",
        "--service",
        "Midnight indexer",
        "--timeout-ms",
        "2500",
        "--log-hint",
        "inspect logs/midnight-indexer.log",
        "--compatibility-file",
        "/tmp/compatibility.json",
      ]),
    ).toEqual({
      port: 18771,
      service: "Midnight indexer",
      timeoutMs: 2500,
      logHint: "inspect logs/midnight-indexer.log",
      compatibilityFile: "/tmp/compatibility.json",
    });
  });

  test("returns immediately when the listener is ready", async () => {
    let attempts = 0;
    const result = await waitForTcp({
      port: 18772,
      connect: async () => {
        attempts += 1;
        return true;
      },
    });
    expect(result.ok).toBe(true);
    expect(attempts).toBe(1);
  });

  test("connects to a real listener above port 10000", async () => {
    const port = Number(process.env.WAIT_TCP_TEST_LISTENER_PORT || 18777);
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch() {
        return new Response("ok");
      },
    });
    try {
      const result = await waitForTcp({
        port,
        service: "test listener",
        timeoutMs: 1000,
        intervalMs: 10,
      });
      expect(result.ok).toBe(true);
      expect(result.elapsedMs).toBeLessThan(1000);
    } finally {
      server.stop(true);
    }
  });

  test("fails at the configured bound with labeled next action", async () => {
    let clock = 0;
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await waitForTcp({
        port: 18773,
        service: "Midnight indexer",
        timeoutMs: 100,
        intervalMs: 25,
        logHint: "inspect logs/midnight-indexer.log",
        connect: async () => false,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      });

      expect(result).toEqual({ ok: false, elapsedMs: 100 });
      const output = errors.mock.calls.flat().join("\n");
      expect(output).toContain("Midnight indexer");
      expect(output).toContain("tcp://127.0.0.1:18773");
      expect(output).toContain("after 100ms");
      expect(output).toContain("unknown readiness failure");
      expect(output).toContain("inspect logs/midnight-indexer.log");
    } finally {
      errors.mockRestore();
    }
  });

  test("reads the compatibility tuple without overclaiming a timeout", async () => {
    let clock = 0;
    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      const compatibilityFile = new URL(
        "../../../binaries/midnight-indexer/compatibility.json",
        import.meta.url,
      ).pathname;
      const result = await waitForTcp({
        port: 18774,
        service: "Midnight indexer",
        timeoutMs: 10,
        intervalMs: 10,
        logHint: "inspect both service logs",
        compatibilityFile,
        connect: async () => false,
        now: () => clock,
        sleep: async (milliseconds) => {
          clock += milliseconds;
        },
      });

      expect(result.ok).toBe(false);
      const output = errors.mock.calls.flat().join("\n");
      expect(output).toContain("node 2.0.0-rc.4");
      expect(output).toContain("Ledger 9");
      expect(output).toContain("indexer 4.4.0-rc.1");
      expect(output).toContain("only the exact node-log signal");
      expect(output).toContain(
        "Without it, this remains an unknown readiness failure",
      );
      expect(output).toContain(
        "Indexer --clean removes only indexer SQLite data",
      );
      expect(output).toContain("no data is reset automatically");
    } finally {
      errors.mockRestore();
    }
  });
});
