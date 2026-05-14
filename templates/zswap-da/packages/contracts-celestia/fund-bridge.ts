/**
 * Fund the Celestia bridge node wallet so it can submit blobs.
 *
 * 1. Gets the bridge wallet address via state.AccountAddress RPC
 * 2. Sends tokens from the validator account via celestia-appd tx bank send
 *
 * Requires CELESTIA_HOME env var pointing to the celestia-appd data directory
 * (where the validator keyring lives).
 */
import { fund, getBridgeAddress } from "@effectstream/celestia";

const BRIDGE_RPC = "http://localhost:26658";
const MAX_RETRIES = 30;
const APP_HOME = process.env.CELESTIA_HOME;

if (!APP_HOME) {
  throw new Error("CELESTIA_HOME env var is required (path to celestia-appd data dir)");
}

async function main() {
  let address: string | null = null;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      address = await getBridgeAddress(BRIDGE_RPC);
      if (address) break;
    } catch {
      // bridge not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (!address) {
    throw new Error("Could not get bridge wallet address after retries");
  }

  console.log(`Bridge wallet address: ${address}`);
  console.log("Funding bridge wallet...");

  const result = await fund(address, "100000000utia", { appHome: APP_HOME });
  console.log(`Fund tx result: ${result}`);
  console.log("Bridge wallet funded successfully");
}

main();
