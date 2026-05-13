import path from "node:path";
import type { OrchestratorConfig } from "@effectstream/orchestrator/config";
import { DbNames, launchPglite } from "@effectstream/orchestrator/launch-pglite";
import {
  launchMidnight,
  MidnightNames,
} from "@effectstream/orchestrator/launch-midnight";

const root = import.meta.dirname!;

const midnightDeps = [MidnightNames.CONTRACT_DEPLOY];

// Pre-flight: verify the Celestia mainnet light node is reachable and funded.
// Aborts before launching anything else if the operator skipped the setup.
async function probeMainnetLightNode(): Promise<void> {
  const rpcUrl = process.env["CELESTIA_RPC_URL"] ?? "http://127.0.0.1:26658";
  const token = process.env["CELESTIA_AUTH_TOKEN"];
  if (!token) {
    throw new Error(
      "CELESTIA_AUTH_TOKEN is required in mainnet mode. Generate with:\n" +
        "  celestia light auth admin --p2p.network celestia",
    );
  }
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
  const rpc = async (method: string, params: unknown[] = []) => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`${method}: ${JSON.stringify(json.error)}`);
    return json.result;
  };

  try {
    const head = await rpc("header.NetworkHead");
    const height = parseInt(head.header.height, 10);
    const address: string = await rpc("state.AccountAddress");
    let balanceTia = "unknown";
    try {
      const bal = await rpc("state.Balance");
      const utia = BigInt(bal.amount ?? bal.Amount ?? "0");
      balanceTia = (Number(utia) / 1_000_000).toFixed(6);
    } catch {
      /* optional */
    }
    console.log("═".repeat(72));
    console.log(`[Celestia mainnet] Light node reachable at ${rpcUrl}`);
    console.log(`  Head height : ${height}`);
    console.log(`  Wallet addr : ${address}`);
    console.log(`  Balance     : ${balanceTia} TIA`);
    console.log("═".repeat(72));
  } catch (e) {
    throw new Error(
      `Cannot reach Celestia light node at ${rpcUrl}. Start it with:\n` +
        "  celestia light start --core.ip <consensus-rpc> --core.port 9090 --core.tls --p2p.network celestia\n" +
        `Underlying error: ${(e as Error).message}`,
    );
  }
}

await probeMainnetLightNode();

export default {
  processes: [
    ...launchPglite(),

    ...launchMidnight(
      "@zswap-da/contracts-midnight",
      { cwd: path.join(root, "packages/contracts-midnight") },
      { env: { MIDNIGHT_STORAGE_PASSWORD: "YourPasswordMy1!" } },
    ),

    {
      name: "sync",
      description: "ZSwap-DA sync node (mainnet)",
      args: ["run", "packages/node/main.mainnet.ts"],
      waitToExit: false,
      type: "system-dependency",
      env: { PGLITE: "true" },
      dependsOn: [DbNames.PGLITE_WAIT, ...midnightDeps],
    },

    {
      name: "batcher",
      description: "ZSwap-DA batcher (mainnet, port 3334)",
      args: ["run", "packages/batcher/batcher.mainnet.ts"],
      waitToExit: false,
      type: "system-dependency",
      link: "http://localhost:3334",
      stopProcessAtPort: [3334],
      dependsOn: [...midnightDeps],
    },
  ],
} satisfies OrchestratorConfig;
