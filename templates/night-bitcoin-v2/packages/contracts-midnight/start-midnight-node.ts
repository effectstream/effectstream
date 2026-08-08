import { spawn } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { prepareMidnightGenesis } from "./prepare-midnight-genesis.ts";
import { GENESIS_PROFILE_ID } from "./wallet-profile.ts";

export function midnightNodeArgs(chainSpecPath: string): string[] {
  if (!path.isAbsolute(chainSpecPath)) {
    throw new Error(`Midnight chain spec path must be absolute: ${chainSpecPath}`);
  }
  return [
    "--chain",
    chainSpecPath,
    "--tmp",
    "--alice",
    "--validator",
    "--force-authoring",
    "--node-key",
    "0000000000000000000000000000000000000000000000000000000000000001",
    "--rpc-port",
    "9944",
    "--port",
    "30333",
    "--unsafe-rpc-external",
    "--rpc-cors=all",
    "--state-pruning",
    "archive",
    "--blocks-pruning",
    "archive",
    "--public-addr",
    "/ip4/127.0.0.1",
  ];
}

async function assertLaunchChainSpec(chainSpecPath: string): Promise<void> {
  const stat = await lstat(chainSpecPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Refusing unsafe Midnight chain spec: ${chainSpecPath}`);
  }
  const chainSpec = JSON.parse(await readFile(chainSpecPath, "utf8")) as {
    id?: unknown;
    chainType?: unknown;
    bootNodes?: unknown;
  };
  if (
    chainSpec.id !== "midnight_undeployed" ||
    chainSpec.chainType !== "Local" ||
    !Array.isArray(chainSpec.bootNodes) ||
    chainSpec.bootNodes.length !== 0
  ) {
    throw new Error("Refusing a non-local or malformed Midnight chain spec");
  }
}

/** Start the template's npm-wrapped node against an already prepared spec. */
export async function runPreparedMidnightNode(
  chainSpecPath: string,
): Promise<number> {
  await assertLaunchChainSpec(chainSpecPath);
  const cli = path.join(
    import.meta.dirname,
    "node_modules",
    ".bin",
    "npm-midnight-node",
  );
  const child = spawn(
    process.execPath,
    [cli, ...midnightNodeArgs(chainSpecPath)],
    {
      cwd: import.meta.dirname,
      env: {
        ...process.env,
        CFG_PRESET: "dev",
        MIDNIGHT_STORAGE_PASSWORD:
          process.env.MIDNIGHT_STORAGE_PASSWORD || "YourPasswordMy1!",
      },
      stdio: "inherit",
    },
  );

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => child.kill(signal));
  }

  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        console.error(`[midnight-node] stopped by ${signal}`);
        resolve(1);
      } else {
        resolve(code ?? 1);
      }
    });
  });
}

if (import.meta.main) {
  const prepared = await prepareMidnightGenesis();
  console.log(
    `[midnight-genesis] ${prepared.cacheHit ? "cache hit" : "generated"} ${GENESIS_PROFILE_ID}`,
  );
  process.exit(await runPreparedMidnightNode(prepared.chainSpecPath));
}
