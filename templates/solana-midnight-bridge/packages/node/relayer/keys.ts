// The relayer's operator keys (FR-009):
//   local  the local operator Solana keypair (packages/contracts-solana/keypair/
//          local-operator.json, gitignored) and the public dev Midnight seed
//          0x…01; both refused unless the Solana RPC and the Midnight
//          endpoints are local.
//   live   ~/.config/effectstream-00050/solana-operator.json and
//          midnight-operator.seed (dir 700, files 600). Never from the repo.
// The Solana operator must be the one the deployment recorded on both chains
// (the program's config and the contract's sealed operatorKey).
import type { Keypair } from "@solana/web3.js";
import {
  assertLocalRpc,
  liveKeyPaths,
  loadLiveKeypair,
  loadLocalOperator,
} from "@solana-midnight-bridge/contracts-solana/keys";
import { resolveSeed } from "@solana-midnight-bridge/contracts-midnight/wallets";
import type { BridgeNodeSettings } from "../config.ts";

export type RelayerKeys = { solanaOperator: Keypair; midnightSeed: string };

export function loadRelayerKeys(s: BridgeNodeSettings): RelayerKeys {
  let solanaOperator: Keypair;
  let midnightSeed: string;
  if (s.mode === "local") {
    assertLocalRpc(s.solanaRpcUrl, "the relayer");
    solanaOperator = loadLocalOperator();
    midnightSeed = resolveSeed("local", "operator", s.midnightUrls);
  } else {
    solanaOperator = loadLiveKeypair(liveKeyPaths().operator, "operator");
    midnightSeed = resolveSeed("stagenet", "operator", s.midnightUrls);
  }
  const pub = solanaOperator.publicKey.toBase58();
  if (pub !== s.solana.operator) {
    throw new Error(`the relayer's Solana operator ${pub} is not the program's operator ${s.solana.operator}`);
  }
  if (pub !== s.midnight.operator) {
    throw new Error(`the relayer's Solana operator ${pub} is not the key the Midnight contract seals (${s.midnight.operator})`);
  }
  return { solanaOperator, midnightSeed };
}
