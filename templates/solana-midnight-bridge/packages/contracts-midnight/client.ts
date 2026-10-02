// Calling the bridge contract from a wallet with midnight-js (no batcher):
// the CLI's `bridge:to-solana` burn and the devnet contract tests use it.
//
// Providers come from the engine's `configureMidnightNodeProviders`: the
// midnight-js `proofProvider` proves the contract circuit on the rc.8 prover
// (`contractProofServer`, engine E2) while the wallet facade (built with the
// DUST prover) balances and proves DUST/zswap. The facade balances every token
// kind here (Q12 A), which is what lets `lockForSolana` take a fresh coin
// `{nonce, color, value}` and return the wallet's change.
import { randomBytes } from "node:crypto";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { submitCallTx } from "@midnight-ntwrk/midnight-js-contracts";
import { configureMidnightNodeProviders, type WalletResult } from "@effectstream/midnight-contracts";
import { BridgeContract, CONTRACT_NAME, MANAGED_DIR, bridgeLedger } from "./contract.ts";
import type { BridgeMidnightUrls } from "./network.ts";
import type { Ed25519SignatureArg, MintRecipient } from "./signing.ts";

/** The bridge as a midnight-js compiled contract (no witnesses). */
export function compiledBridgeContract() {
  return CompiledContract.make(CONTRACT_NAME, BridgeContract as never).pipe(
    CompiledContract.withWitnesses({} as never),
    CompiledContract.withCompiledFileAssets(MANAGED_DIR),
  );
}

/** midnight-js providers for `wallet`: contract proofs on rc.8, DUST on the wallet's prover. */
export async function bridgeProviders(
  w: WalletResult,
  urls: BridgeMidnightUrls,
  privateStateStoreName: string,
): Promise<any> {
  return configureMidnightNodeProviders(
    w.wallet,
    w.zswapSecretKeys,
    w.walletZswapSecretKeys,
    w.dustSecretKey,
    w.walletDustSecretKey,
    {
      indexer: urls.indexer,
      indexerWS: urls.indexerWS,
      node: urls.node,
      proofServer: urls.proofServer,
      contractProofServer: urls.contractProofServer,
    },
    privateStateStoreName,
    MANAGED_DIR,
    w.unshieldedKeystore,
  );
}

export type CallOutcome<R> = {
  txId?: string;
  txHash?: string;
  blockHeight?: number;
  result: R;
};

function outcome<R>(r: any): CallOutcome<R> {
  return {
    txId: r?.public?.txId,
    txHash: r?.public?.txHash,
    blockHeight: r?.public?.blockHeight,
    result: r?.private?.result as R,
  };
}

/**
 * Burns `amount` of the bridge colour from the caller's wallet for a Solana
 * recipient: the coin argument is a FRESH `{nonce, color, value}` and wallet
 * balancing funds it, returning any change (proven in P0 S1).
 */
export async function lockForSolana(
  providers: any,
  contractAddress: string,
  args: { color: Uint8Array; amount: bigint; solanaRecipient: Uint8Array },
): Promise<CallOutcome<bigint>> {
  if (args.amount <= 0n) throw new Error("amount must be positive");
  if (args.solanaRecipient.length !== 32) throw new Error("solanaRecipient must be 32 bytes");
  const coin = { nonce: new Uint8Array(randomBytes(32)), color: args.color, value: args.amount };
  const r = await submitCallTx(providers, {
    compiledContract: compiledBridgeContract(),
    contractAddress,
    circuitId: "lockForSolana",
    args: [coin, args.solanaRecipient],
  } as never);
  return outcome<bigint>(r);
}

/**
 * A direct `mintFromSolana` (tests; the relayer goes through the batcher).
 * `mapping` is the recipient's `[coinPublicKeyHex, encryptionPublicKeyHex]`.
 */
export async function mintFromSolana(
  providers: any,
  contractAddress: string,
  args: {
    lockNonce: bigint;
    recipient: MintRecipient;
    amount: bigint;
    sig: Ed25519SignatureArg;
    mapping: [string, string];
    mintNonce?: Uint8Array;
  },
): Promise<CallOutcome<{ nonce: Uint8Array; color: Uint8Array; value: bigint }>> {
  const r = await submitCallTx(providers, {
    compiledContract: compiledBridgeContract(),
    contractAddress,
    circuitId: "mintFromSolana",
    args: [args.lockNonce, args.recipient, args.amount, args.mintNonce ?? new Uint8Array(randomBytes(32)), args.sig],
    additionalCoinEncPublicKeyMappings: new Map([args.mapping]),
  } as never);
  return outcome(r);
}

/** The contract's ledger as midnight-js reads it from the indexer, or null. */
export async function readBridgeLedger(providers: any, contractAddress: string) {
  const st = await providers.publicDataProvider.queryContractState(contractAddress);
  return st ? bridgeLedger(st.data) : null;
}
