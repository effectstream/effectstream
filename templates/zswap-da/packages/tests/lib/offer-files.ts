// Reusable helpers to join the deployed offer-files contract and mint test
// token colors on demand. Extracted from contracts-midnight/mint-test-tokens.ts
// so e2e scripts can mint arbitrary NAMED colors (and target arbitrary
// unshielded recipients) without duplicating the contract wiring or disturbing
// the fixed-separator startup mint.
//
//   mint_shielded(domain_sep, amount, nonce)  → mints to the CALLER (ownPublicKey)
//   mint_unshielded(domain_sep, amount, recipient) → mints to ANY UserAddress

import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import { configureMidnightNodeProviders } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import type { WalletResult } from "@effectstream/midnight-contracts/types";
import { OfferFilesContract, witnesses } from "@zswap-da/contract-offer-files";

// packages/tests/lib → packages/contracts-midnight
const CONTRACT_DIR = resolve(
  dirname(new URL(import.meta.url).pathname),
  "../../contracts-midnight",
);
const ZK_CONFIG_PATH = resolve(CONTRACT_DIR, "contract-offer-files", "src", "managed");
const PRIVATE_STATE_STORE = "offerFilesPrivateState";

const compiledContract = CompiledContract.make(
  "contract-offer-files",
  OfferFilesContract.Contract as any,
).pipe(
  CompiledContract.withWitnesses(witnesses as unknown as never),
  CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH),
);

const toHex = (u: Uint8Array): string =>
  Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");

const normalizeColor = (raw: unknown): string =>
  (raw instanceof Uint8Array ? toHex(raw) : String(raw).replace(/^0x/, "")).toLowerCase();

function unshieldedToUserAddressBytes(unshieldedAddr: string): Uint8Array {
  if (!unshieldedAddr.startsWith("mn_addr_")) {
    throw new Error(`expected mn_addr_ bech32m unshielded address, got "${unshieldedAddr}"`);
  }
  const parsed = MidnightBech32m.parse(unshieldedAddr);
  return Uint8Array.prototype.slice.call(parsed.data, 0, 32);
}

export async function getContractAddress(): Promise<string> {
  const file = resolve(CONTRACT_DIR, "contract-offer-files.undeployed.json");
  const json = JSON.parse(await readFile(file, "utf-8"));
  return json.contractAddress as string;
}

/** Join the deployed offer-files contract using `walletResult`'s wallet/keys.
 *  The wallet must be synced and registered for dust (circuit calls pay fees). */
export async function joinOfferFiles(walletResult: WalletResult): Promise<any> {
  const contractAddress = await getContractAddress();
  const providers = (await configureMidnightNodeProviders(
    walletResult.wallet,
    walletResult.zswapSecretKeys,
    walletResult.walletZswapSecretKeys,
    walletResult.dustSecretKey,
    walletResult.walletDustSecretKey,
    {
      indexer: net.indexer,
      indexerWS: net.indexerWS,
      node: net.node,
      proofServer: net.proofServer,
    },
    PRIVATE_STATE_STORE,
    ZK_CONFIG_PATH,
    walletResult.unshieldedKeystore,
  )) as any;

  return findDeployedContract(providers, {
    contractAddress,
    compiledContract: compiledContract as any,
    privateStateId: PRIVATE_STATE_STORE,
    initialPrivateState: {},
  });
}

/** Mint a shielded color to the CALLER (the wallet that joined `deployed`).
 *  `nonce` must be unique per (sep) per run — re-using it recreates an
 *  identical coin commitment which the node rejects as a duplicate. */
export async function mintShielded(
  deployed: any,
  sepByte: number,
  amount: bigint,
  nonce: bigint,
): Promise<string> {
  const sep = new Uint8Array(32).fill(sepByte);
  const tx = await deployed.callTx.mint_shielded(sep, amount, nonce);
  const coin = tx.private?.result;
  const colorRaw = coin?.color ?? coin?.type;
  if (colorRaw == null) {
    throw new Error(
      `mint_shielded(sep=0x${sepByte.toString(16)}): no color in tx result ` +
        `(keys: ${coin ? Object.keys(coin).join(",") : "no result"})`,
    );
  }
  return normalizeColor(colorRaw);
}

/** Mint an unshielded color to ANY recipient (a bech32m `mn_addr_...` string). */
export async function mintUnshielded(
  deployed: any,
  sepByte: number,
  amount: bigint,
  recipientUnshieldedAddr: string,
): Promise<string> {
  const sep = new Uint8Array(32).fill(sepByte);
  const recipientBytes = unshieldedToUserAddressBytes(recipientUnshieldedAddr);
  const tx = await deployed.callTx.mint_unshielded(sep, amount, { bytes: recipientBytes });
  const res = tx.private?.result;
  return normalizeColor(res ?? sep);
}
