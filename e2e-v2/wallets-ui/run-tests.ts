/**
 * Wallets UI build-smoke test.
 *
 * This suite does NOT exercise any wallet flow — those are manual (see
 * ./README.md). The value here is verifying that the vite bundle still
 * builds against the current @effectstream/wallets SDK and that the
 * fastify server can serve the result.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { assert, printSummary, anyError } from "@e2e-v2/engine";

const __dirname = import.meta.dirname!;
const PORT = 4201;

function run(cmd: string, args: string[], opts: { cwd?: string; detached?: boolean } = {}) {
  return spawn(cmd, args, {
    cwd: opts.cwd ?? __dirname,
    stdio: opts.detached ? ["ignore", "pipe", "pipe"] : "inherit",
    detached: opts.detached,
  });
}

async function buildTest(): Promise<void> {
  await assert("wallets-ui: vite build succeeds", async () => {
    const proc = run("bun", ["run", "build"]);
    return await new Promise<boolean>((resolve) => {
      proc.on("exit", (code) => resolve(code === 0));
    });
  });
}

async function serverTest(): Promise<void> {
  const server = run("bun", ["run", "server:start"], { detached: true });
  try {
    // Wait for the server to bind.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 200));
      try {
        const res = await fetch(`http://localhost:${PORT}/`);
        if (res.ok) break;
      } catch { /* not ready */ }
    }

    await assert("wallets-ui: server responds 200 on /", async () => {
      const res = await fetch(`http://localhost:${PORT}/`);
      return res.status === 200;
    });

    await assert("wallets-ui: response is the built HTML shell", async () => {
      const res = await fetch(`http://localhost:${PORT}/`);
      const body = await res.text();
      return body.includes('id="root"');
    });
  } finally {
    // Kill the whole process group (bun + children).
    if (server.pid) {
      try { process.kill(-server.pid, "SIGTERM"); } catch { /* already gone */ }
    }
  }
}

async function main() {
  try {
    await buildTest();
    await serverTest();
    printSummary();
  } catch (e) {
    printSummary();
    console.error(e);
  } finally {
    if (anyError()) process.exit(1);
    process.exit(0);
  }
}

main();
