/**
 * Helper module for NEAR Intents Solver Bus interaction.
 *
 * In production, this wraps @defuse-protocol/intents-sdk for:
 * - Intent creation and broadcasting to the Solver Bus
 * - Quote collection and best-quote selection
 * - Commitment signing
 * - Settlement monitoring
 *
 * The Solver Bus is an off-chain service — intent creation
 * and solver interaction happen outside the blockchain.
 * Only the final settlement (execute_intents) is on-chain.
 */

export interface IntentMessage {
  signerId: string;
  send: { tokenId: string; amount: string }[];
  receive: { tokenId: string; minAmount: string }[];
  expirationNs: string;
}

export interface IntentResult {
  intentHash: string;
  settlementTxHash: string | null;
  status: "pending" | "settled" | "expired" | "failed";
}

/**
 * Creates and submits an intent via the Intents SDK.
 *
 * This is a placeholder that documents the expected interface.
 * The actual implementation requires @defuse-protocol/intents-sdk
 * as a peer dependency of the batcher.
 */
export async function createAndSubmitIntent(
  _intents: IntentMessage[],
  _signerConfig: {
    accountId: string;
    privateKey: string;
  },
): Promise<IntentResult> {
  // In production, this would:
  // 1. Import { IntentsSDK, createIntentSignerNearKeyPair } from "@defuse-protocol/intents-sdk"
  // 2. Build intent message from params
  // 3. Sign and broadcast to Solver Bus
  // 4. Collect quotes, accept best
  // 5. Wait for on-chain settlement
  throw new Error(
    "NEAR Intent adapter requires @defuse-protocol/intents-sdk. " +
    "Install it as a dependency and provide a concrete implementation.",
  );
}

/**
 * Wait for an intent to be settled on-chain.
 */
export async function waitForIntentSettlement(
  _intentHash: string,
  _rpcUrl: string,
  _timeoutMs: number = 60_000,
): Promise<IntentResult> {
  throw new Error(
    "NEAR Intent settlement monitoring requires @defuse-protocol/intents-sdk.",
  );
}
