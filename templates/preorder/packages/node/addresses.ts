import fs from "node:fs";
import path from "node:path";

/**
 * Deployed contract addresses, written by contracts-evm/deploy.ts to build/extra-addresses.json.
 * Read once here so config.dev.ts, the state machine, and the API share a single source.
 */
export interface ExtraAddresses {
  launchpadProxy: string;
  factory: string;
  mockErc20: string;
  effectStreamL2: string;
  admin: string;
}

const ZERO = "0x0000000000000000000000000000000000000000";

let extra: ExtraAddresses = {
  launchpadProxy: ZERO,
  factory: ZERO,
  mockErc20: ZERO,
  effectStreamL2: ZERO,
  admin: ZERO,
};

try {
  const p = path.resolve(
    import.meta.dirname!,
    "../contracts-evm/build/extra-addresses.json",
  );
  extra = { ...extra, ...JSON.parse(fs.readFileSync(p, "utf-8")) };
  console.log("[addresses] loaded:", extra);
} catch {
  console.log("[addresses] extra-addresses.json not found; using zero addresses");
}

export const EXTRA_ADDRESSES = extra;
export const LAUNCHPAD_ADDRESS = extra.launchpadProxy.toLowerCase();
export const EFFECTSTREAM_L2_ADDRESS = extra.effectStreamL2;
export const MOCK_ERC20_ADDRESS = extra.mockErc20.toLowerCase();
/** Lower-cased admin address; the STM authorizes admin commands by comparing the L2 input signer to this. */
export const ADMIN_ADDRESS = extra.admin.toLowerCase();
