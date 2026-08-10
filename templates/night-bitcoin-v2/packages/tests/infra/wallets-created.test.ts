import path from "path";
import fs from "fs";
import { assert } from "../helpers.ts";

const NUM_WALLETS = 3;
const GENESIS_PROFILE_ID = "night-bitcoin-v2-node-1.0.0-prefunded-v1";

function walletsDirFor(chain: "bitcoin" | "midnight"): string {
  const pkg = chain === "bitcoin" ? "contracts-bitcoin" : "contracts-midnight";
  return path.resolve(import.meta.dirname!, `../../../packages/${pkg}/generated`);
}

export async function walletsCreatedTest() {
  const midnightSeedProfile = JSON.parse(
    fs.readFileSync(
      path.resolve(
        import.meta.dirname!,
        "../../../packages/contracts-midnight/undeployed-genesis-seeds.json",
      ),
      "utf8",
    ),
  ) as Record<string, string>;

  for (const chain of ["bitcoin", "midnight"] as const) {
    for (let i = 0; i < NUM_WALLETS; i++) {
      const filePath = path.join(walletsDirFor(chain), `wallet-${i}.json`);
      await assert(`${chain} wallet-${i}.json exists and has content`, async () => {
        if (!fs.existsSync(filePath)) return false;
        try {
          const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          if (typeof json !== "object" || json === null) return false;
          if (chain === "midnight") {
            return (
              json.genesisProfileId === GENESIS_PROFILE_ID &&
              json.walletId === `filler-${i}` &&
              json.seed === midnightSeedProfile[`filler-${i}`] &&
              json.expectedNightUtxos === 5 &&
              typeof json.unshieldedAddress === "string" &&
              json.unshieldedAddress.startsWith("mn_addr_undeployed1")
            );
          }
          return true;
        } catch {
          return false;
        }
      });
    }
  }
}
