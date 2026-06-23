import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeSolanaAccountBalance,
  PrimitiveTypeSolanaProgramLog,
} from "@effectstream/sm/builtin";

/**
 * Deterministic address the AccountBalance primitive watches. Derived from a
 * fixed seed (Keypair.fromSeed(Uint8Array(32).fill(7))) so the e2e can airdrop
 * to it and assert the synced balance. Shared with the test.
 */
export const WATCHED_BALANCE_ADDRESS =
  "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("e2e-solana"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "solanaParallel",
        type: ConfigNetworkType.SOLANA,
        rpcUrl: "http://localhost:8899",
        networkId: "localnet",
      })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 500,
        }),
      )
      .addParallel(
        (networks) => (networks as any).solanaParallel,
        (network, deployments) => ({
          name: "parallelSolanaRPC",
          type: ConfigSyncProtocolType.SOLANA_RPC_PARALLEL,
          startBlockHeight: 0,
          pollingInterval: 2000,
          delayMs: 2400,
          confirmationDepth: 32,
          stepSize: 10,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelSolanaRPC,
        (network, deployments, syncProtocol) => ({
          name: "SolanaProgramLog",
          type: PrimitiveTypeSolanaProgramLog,
          startBlockHeight: 0,
          programId: "11111111111111111111111111111111",
          stateMachinePrefix: "solana-program-log",
        }),
      )
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelSolanaRPC,
        (network, deployments, syncProtocol) => ({
          name: "SolanaAccountBalance",
          type: PrimitiveTypeSolanaAccountBalance,
          startBlockHeight: 0,
          address: WATCHED_BALANCE_ADDRESS,
          stateMachinePrefix: "solana-account-balance",
        }),
      )
      // Watch the SPL Memo program so the sync captures txs the fee-payer
      // batcher sponsors (the batcher writes a Memo; same solana_log_events table).
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelSolanaRPC,
        (network, deployments, syncProtocol) => ({
          name: "SolanaMemoLog",
          type: PrimitiveTypeSolanaProgramLog,
          startBlockHeight: 0,
          programId: "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
          stateMachinePrefix: "solana-program-log",
        }),
      )
  )
  .build();
