import path from "path";
import fs from "fs";
import { assert } from "../helpers.ts";

const NUM_WALLETS = 3;

function walletsDirFor(chain: "bitcoin" | "midnight"): string {
  const pkg = chain === "bitcoin" ? "contracts-bitcoin" : "contracts-midnight";
  return path.resolve(import.meta.dirname!, `../../../packages/${pkg}/generated`);
}

export async function walletsCreatedTest() {
  for (const chain of ["bitcoin", "midnight"] as const) {
    for (let i = 0; i < NUM_WALLETS; i++) {
      const filePath = path.join(walletsDirFor(chain), `wallet-${i}.json`);
      await assert(`${chain} wallet-${i}.json exists and has content`, async () => {
        if (!fs.existsSync(filePath)) return false;
        try {
          const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
          return typeof json === "object" && json !== null;
        } catch {
          return false;
        }
      });
    }
  }
}
