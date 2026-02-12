import type { ZswapSecretKeys, DustSecretKey } from "@midnight-ntwrk/ledger-v7";
import type { WalletFacade } from "@midnight-ntwrk/wallet-sdk-facade";
import type { UnshieldedKeystore } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";

// ============================================================================
// Types
// ============================================================================


/**
 * Configuration for deploying a Midnight contract
 */
export interface DeployConfig {
    /** Name of the contract directory (e.g., "contract-counter", "contract-eip-20") */
    contractName: string;
    /** Base filename for contract address (e.g., "contract-counter.json"); a network suffix is appended */
    contractFileName: string;
    /** The Contract class to deploy */
    // deno-lint-ignore no-explicit-any
    contractClass: any;
    /** Witness definitions */
    // deno-lint-ignore no-explicit-any
    witnesses: any;
    /** On-chain private state ID */
    privateStateId: string;
    /** Initial private state object */
    // deno-lint-ignore no-explicit-any
    initialPrivateState: any;
    /** Optional deployment arguments array */
    // deno-lint-ignore no-explicit-any
    deployArgs?: any[];
    /** Optional private state store name (defaults to contractName-based value) */
    privateStateStoreName?: string;
    /** Optional base directory override for finding contracts */
    baseDir?: string;
    /** Optional flag to extract wallet address info (for contracts that need initialOwner) */
    extractWalletAddress?: boolean;
}

/**
 * Network endpoint URLs for connecting to Midnight infrastructure
 */
export interface NetworkUrls {
  /** Optional network ID override */
  id?: string;
  /** GraphQL indexer HTTP endpoint (default: http://127.0.0.1:8088/api/v3/graphql)*/
  indexer?: string;
  /** GraphQL indexer WebSocket endpoint (default: ws://127.0.0.1:8088/api/v3/graphql/ws)*/
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