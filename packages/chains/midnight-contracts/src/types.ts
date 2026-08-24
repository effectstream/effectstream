import type { ZswapSecretKeys, DustSecretKey } from "@midnightntwrk/ledger-v9";
import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import type { UnshieldedKeystore } from "@midnightntwrk/wallet-sdk-unshielded-wallet";

// ============================================================================
// Types
// ============================================================================


/**
 * Configuration for deploying a Midnight contract
 */
export interface DeployConfig {
    /** Name of the contract directory containing `src/managed` (e.g., "contract-counter", "contract-eip-20"). Required. */
    contractName: string;
    /** The compiled Contract class to deploy (e.g. `Foo.Contract`). Required. */
    // deno-lint-ignore no-explicit-any
    contractClass: any;
    /** Base filename the deployed address is written to; a network suffix is appended. Defaults to `${contractName}.json`. */
    contractFileName?: string;
    /** Witness definitions. Defaults to `{}` (no witnesses). */
    // deno-lint-ignore no-explicit-any
    witnesses?: any;
    /** On-chain private state ID. Defaults to `"privateState"`. */
    privateStateId?: string;
    /** Initial private state object. Defaults to `{}` (for contracts with no private state). */
    // deno-lint-ignore no-explicit-any
    initialPrivateState?: any;
    /** Optional deployment arguments array */
    // deno-lint-ignore no-explicit-any
    deployArgs?: any[];
    /** Optional private state store name (defaults to contractName-based value) */
    privateStateStoreName?: string;
    /** Optional base directory override for finding contracts */
    baseDir?: string;
    /** Optional flag to extract wallet address info (for contracts that need initialOwner) */
    extractWalletAddress?: boolean;
    /**
     * Deploy in phases instead of a single transaction.
     *
     * When `true`, the contract is first deployed with NO verifier keys, then each
     * circuit's verifier key is inserted in its own transaction. Use this for
     * contracts with many circuits whose combined verifier keys would otherwise
     * exceed the node's per-block transaction limits ("Transaction would exhaust
     * block limits"). Defaults to `false` (single-transaction deploy).
     */
    phasedVerifierKeys?: boolean;
    /** Per-circuit retry count when inserting verifier keys in phased mode (default 3). */
    vkInsertRetries?: number;
    /**
     * Path to the resume-state file used by phased mode to track progress so an
     * interrupted deployment can be resumed. Defaults to `deployment-state.json`
     * in the current working directory. This file is removed once the phased
     * deployment completes successfully.
     */
    phasedStateFile?: string;
}

/**
 * Network endpoint URLs for connecting to Midnight infrastructure
 */
export interface NetworkUrls {
  /** Optional network ID override */
  id?: NetworkId.NetworkId;
  /** GraphQL indexer HTTP endpoint (default: http://127.0.0.1:8088/api/v4/graphql)*/
  indexer?: string;
  /** GraphQL indexer WebSocket endpoint (default: ws://127.0.0.1:8088/api/v4/graphql/ws)*/
  indexerWS?: string;
  /** Midnight node RPC endpoint (default: http://127.0.0.1:9944)*/
  node?: string;
  /** Proof server HTTP endpoint (default: http://127.0.0.1:6300)*/
  proofServer?: string;
}

// WalletResult is now imported from get-wallet-info.ts

/** Initial owner structure for contracts that need wallet address */
export interface InitialOwner {
  is_left: boolean;
  left: { bytes: Uint8Array };
  right: { bytes: Uint8Array };
}


export interface WalletResult {
  wallet: WalletFacade;
  zswapSecretKeys: ZswapSecretKeys;
  walletZswapSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  walletDustSecretKey: DustSecretKey;
  dustAddress: string;
  unshieldedAddress: string;
  unshieldedKeystore: UnshieldedKeystore;
}
