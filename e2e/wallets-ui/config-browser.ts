/**
 * Browser-safe placeholder for @e2e/data-types/config-localhost.
 *
 * The real Node-side config.ts does filesystem reads (readMidnightContract,
 * contractAddressesEvmMain, readAvailApplication) and a DB connection at
 * module load, which crash in a browser context. The wallets-UI only reads
 * three shape fields off `config`:
 *   - config.primitives
 *   - config.syncProtocols.parallel[syncProtocol].network
 *   - config.allNetworks.networks[network].type
 *
 * Anything downstream of those (contract addresses, DB state, etc.) is the
 * job of the running backend, not this UI.
 */

type Primitive = {
  syncProtocol: string;
  primitive: { type: string };
};

type ParallelSyncProtocol = { network: string };
type NetworkDef = { type: string };

export const config = {
  primitives: {
    // EVM primitives — contract addresses come from the batcher at connect time.
    "evm-rpc-effectstream-l2": {
      syncProtocol: "parallelEvmRPC_fast",
      primitive: { type: "evm-rpc-effectstream-l2" },
    },
    "counter-stm": {
      syncProtocol: "parallelEvmRPC_fast",
      primitive: { type: "evm-rpc-generic" },
    },
    "transfer-assets": {
      syncProtocol: "parallelEvmRPC_fast",
      primitive: { type: "evm-rpc-erc721" },
    },
    "transfer-erc20": {
      syncProtocol: "parallelEvmRPC_fast",
      primitive: { type: "evm-rpc-erc20" },
    },
    "transfer-erc1155": {
      syncProtocol: "parallelEvmRPC_fast",
      primitive: { type: "evm-rpc-erc1155" },
    },
    // Midnight
    "midnightContractState": {
      syncProtocol: "parallelMidnight",
      primitive: { type: "midnight-generic" },
    },
    "eip20ContractState": {
      syncProtocol: "parallelMidnight",
      primitive: { type: "midnight-generic" },
    },
    // Cross-chain
    "avail-app-state": {
      syncProtocol: "parallelAvail",
      primitive: { type: "avail-generic" },
    },
    "bitcoin-transaction": {
      syncProtocol: "parallelBitcoin",
      primitive: { type: "bitcoin-address" },
    },
    "cardano-utxo-rpc-generic": {
      syncProtocol: "parallelCardano",
      primitive: { type: "cardano-utxorpc-generic" },
    },
    "celestia-blob": {
      syncProtocol: "parallelCelestia",
      primitive: { type: "celestia-generic" },
    },
  } as Record<string, Primitive>,

  syncProtocols: {
    parallel: {
      parallelEvmRPC_fast: { network: "hardhat" },
      parallelMidnight: { network: "midnight" },
      parallelAvail: { network: "avail" },
      parallelBitcoin: { network: "bitcoin" },
      parallelCardano: { network: "cardano" },
      parallelCelestia: { network: "celestia" },
    } as Record<string, ParallelSyncProtocol>,
  },

  allNetworks: {
    networks: {
      hardhat: { type: "evm" },
      midnight: { type: "midnight" },
      avail: { type: "avail" },
      bitcoin: { type: "bitcoin" },
      cardano: { type: "cardano" },
      celestia: { type: "celestia" },
    } as Record<string, NetworkDef>,
  },
};
