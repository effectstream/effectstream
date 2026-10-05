// A throwaway solana-test-validator for tests that must not share state with
// the orchestrator's validator: fresh ledger, random free ports >= 10000, the
// bridge program preloaded at the local program id. `stop()` kills it and
// removes the ledger.
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { run } from "@effectstream/solana-node";
import { LOCAL_BRIDGE_PROGRAM_ID } from "@solana-midnight-bridge/contracts-solana/program-id";

const PROGRAM_SO = path.resolve(
  import.meta.dirname!,
  "../../contracts-solana/build/bridge.so",
);

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: "127.0.0.1" }, () => srv.close(() => resolve(true)));
  });
}

/** A random port in [10000, 60000) whose next `span - 1` ports are free too. */
export async function freePortRange(span = 1): Promise<number> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const base = 10_000 + Math.floor(Math.random() * 50_000);
    let ok = true;
    for (let i = 0; i < span && ok; i++) ok = await portIsFree(base + i);
    if (ok) return base;
  }
  throw new Error("no free port range found");
}

export async function waitForRpcHealth(rpcUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      const body = (await res.json()) as { result?: string };
      if (body.result === "ok") return;
      last = JSON.stringify(body);
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`validator at ${rpcUrl} not healthy after ${timeoutMs} ms (last: ${last})`);
}

export type TestValidator = { rpcUrl: string; stop: () => void };

/**
 * `soPath` preloads another build of the program at the local program id (00058: the 00050 `.so`,
 * to prove that a program without `LockToContract` refuses tag 3).
 */
export async function startTestValidator(timeoutMs = 300_000, soPath: string = PROGRAM_SO): Promise<TestValidator> {
  if (!fs.existsSync(soPath)) throw new Error(`missing ${soPath}`);
  // RPC uses rpcPort and rpcPort + 1 (websocket).
  const rpcPort = await freePortRange(2);
  const faucetPort = await freePortRange(1);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-program-test-"));
  const v = await run({
    rpcPort,
    faucetPort,
    reset: true,
    dataDir,
    verbose: process.env.SOLANA_VERBOSE === "1",
    bpfPrograms: [{ address: LOCAL_BRIDGE_PROGRAM_ID, soPath }],
  });
  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    v.child.kill("SIGKILL");
    fs.rmSync(dataDir, { recursive: true, force: true });
  };
  process.once("exit", stop);
  try {
    await waitForRpcHealth(rpcUrl, timeoutMs);
  } catch (e) {
    stop();
    throw e;
  }
  return { rpcUrl, stop };
}
