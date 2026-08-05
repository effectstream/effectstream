import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import {
  PrimitiveTypeSolanaAccountBalance,
  PrimitiveTypeSolanaProgramLog,
  PrimitiveTypeSolanaTokenAccount,
} from "@effectstream/sm/builtin";
import {
  EVENT_PREFIX,
  TEST_EVENT_PROGRAM_ID,
} from "@e2e/solana-contracts/program-id";

/**
 * Deterministic address the AccountBalance primitive watches. Derived from a
 * fixed seed (Keypair.fromSeed(Uint8Array(32).fill(7))) so the e2e can airdrop
 * to it and assert the synced balance. Shared with the test.
 */
export const WATCHED_BALANCE_ADDRESS =
  "GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB";

/**
 * The SPL mint the TokenAccount primitive watches, and the wallet that holds it.
 *
 * A static config cannot name a mint generated at runtime, so both are derived from
 * fixed seeds the same way WATCHED_BALANCE_ADDRESS is:
 *   mint  = Keypair.fromSeed(Uint8Array(32).fill(8))
 *   owner = Keypair.fromSeed(Uint8Array(32).fill(9))
 * `token-account.test.ts` recreates the same keypairs and asserts these match, so a
 * changed seed fails loudly instead of silently watching the wrong mint.
 *
 * Localnet only, and they hold nothing but worthless test SOL — but the seeds are
 * public, so never reuse them anywhere real.
 */
export const WATCHED_MINT = "2KW2XRd9kwqet15Aha2oK3tYvd3nWbTFH1MBiRAv1BE1";
export const WATCHED_TOKEN_OWNER =
  "J2xccRtuG43drESLYznHhLhQkLTdfepcKYbiQ9BsJVaf";
/** Associated token account for (WATCHED_TOKEN_OWNER, WATCHED_MINT). */
export const WATCHED_TOKEN_ACCOUNT =
  "8taZEqZDH5zq6hbgwFdBhbNpHNVvCzgKJi4LtnrRDNhR";
/** Decimals the mint is created with, and the amount minted to the owner. */
export const WATCHED_MINT_DECIMALS = 6;
export const MINTED_AMOUNT = "2500000";

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
      // Watch the shared e2e test program (e2e/shared/contracts/solana), loaded
      // into the validator's genesis by its chain:start. This is the only
      // primitive pointed at a real custom program rather than a built-in one,
      // which is what lets program-events.test.ts assert both that genuine
      // invocations are captured and that another program emitting the same
      // marker string is NOT attributed here.
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelSolanaRPC,
        (network, deployments, syncProtocol) => ({
          name: "SolanaTestEventLog",
          type: PrimitiveTypeSolanaProgramLog,
          startBlockHeight: 0,
          programId: TEST_EVENT_PROGRAM_ID,
          eventType: EVENT_PREFIX,
          stateMachinePrefix: "solana-program-log",
        }),
      )
      // Watch the SPL token balance of one wallet's ATA for one mint. Narrowed by
      // both mint and owner so an unrelated token account for the same mint (the
      // mint authority's own, say) does not land in the same table.
      .addPrimitive(
        (syncProtocols) => (syncProtocols as any).parallelSolanaRPC,
        (network, deployments, syncProtocol) => ({
          name: "SolanaTokenAccount",
          type: PrimitiveTypeSolanaTokenAccount,
          startBlockHeight: 0,
          mint: WATCHED_MINT,
          owner: WATCHED_TOKEN_OWNER,
          stateMachinePrefix: "solana-token-account",
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
