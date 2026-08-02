/**
 * NEAR batcher adapter test.
 *
 * STATUS: PARTIAL — offline adapter logic only
 *
 * Constructs `NearAdapter` and `NearIntentAdapter` through the public
 * `@effectstream/batcher-sdk` package root (guarding against the exports
 * regressing) and validates their offline batch-building logic:
 * batch payload construction, max-batch-size capping, fee estimation,
 * and adapter metadata.
 *
 * Full service integration is still TODO and should verify:
 * 1. Start the batcher service with a NearAdapter targeting the sandbox
 * 2. Submit a signed input to the batcher HTTP API
 * 3. Verify the batcher submits a FunctionCall transaction to the sandbox
 * 4. Verify the transaction is confirmed on-chain
 * 5. Verify the sync protocol picks up the resulting event/state change
 *
 * For the intent adapter variant:
 * 6. Submit an intent request to the batcher
 * 7. Verify the intent adapter interacts with the Solver Bus (mock required)
 * 8. Verify settlement is monitored
 *
 * Requires (for the full integration):
 * - Batcher service running with NearAdapter configured
 * - A game contract on sandbox that accepts batched inputs
 * - For intents: a mock Solver Bus or test Solver Bus endpoint
 */
import { assert } from "@e2e/engine";
import {
  NearAdapter,
  NearIntentAdapter,
  type DefaultBatcherInput,
} from "@effectstream/batcher-sdk";
import { AddressType } from "@effectstream/utils";

const DEFAULT_GAS = "300000000000000"; // 300 TGas, adapter default

function makeInputs(count: number): DefaultBatcherInput[] {
  return Array.from({ length: count }, (_, i) => ({
    addressType: AddressType.NEAR,
    address: `player-${i}.test.near`,
    input: JSON.stringify({ action: "move", x: i, y: i + 1 }),
    signature: `sig-${i}`,
    timestamp: new Date(0).toISOString(),
    target: "near",
  }));
}

export async function runBatcherTest(): Promise<void> {
  const adapter = new NearAdapter({
    rpcUrl: "http://127.0.0.1:3030",
    networkId: "sandbox",
    batcherAccountId: "batcher.test.near",
    batcherPrivateKey: "ed25519:unused-offline",
    contractAccountId: "game.test.near",
    contractMethod: "submitGameInputs",
    syncProtocolName: "parallelNearRPC",
    maxBatchSize: 2,
  });

  await assert("NEAR Batcher — adapter metadata", async () => {
    return (
      adapter.getChainName() === "near-sandbox" &&
      adapter.getAccountAddress() === "batcher.test.near" &&
      adapter.getSyncProtocolName() === "parallelNearRPC" &&
      adapter.isReady()
    );
  });

  await assert("NEAR Batcher — buildBatchData builds FunctionCall payload", async () => {
    const result = adapter.buildBatchData(makeInputs(1));
    if (result == null) return false;
    const { data, selectedInputs } = result;
    const batch = data.args["batch"] as Array<Record<string, unknown>>;
    return (
      selectedInputs.length === 1 &&
      data.contractAccountId === "game.test.near" &&
      data.methodName === "submitGameInputs" &&
      data.gas === DEFAULT_GAS &&
      data.deposit === "0" &&
      batch.length === 1 &&
      batch[0]!["address"] === "player-0.test.near"
    );
  });

  await assert("NEAR Batcher — buildBatchData caps at maxBatchSize", async () => {
    const result = adapter.buildBatchData(makeInputs(5));
    return result != null && result.selectedInputs.length === 2;
  });

  await assert("NEAR Batcher — buildBatchData returns null for empty input", async () => {
    return adapter.buildBatchData([]) == null;
  });

  await assert("NEAR Batcher — estimateBatchFee returns attached gas", async () => {
    const result = adapter.buildBatchData(makeInputs(1));
    return result != null && adapter.estimateBatchFee(result.data) === DEFAULT_GAS;
  });

  const intentAdapter = new NearIntentAdapter({
    rpcUrl: "http://127.0.0.1:3030",
    networkId: "sandbox",
    batcherAccountId: "solver.test.near",
    batcherPrivateKey: "ed25519:unused-offline",
    syncProtocolName: "parallelNearRPC",
  });

  await assert("NEAR Intent Batcher — adapter metadata", async () => {
    return (
      intentAdapter.getChainName() === "near-intents-sandbox" &&
      intentAdapter.getAccountAddress() === "solver.test.near" &&
      intentAdapter.estimateBatchFee({ intents: [], signerAccountId: "" }) === "0"
    );
  });

  await assert("NEAR Intent Batcher — buildBatchData builds intent messages", async () => {
    const inputs: DefaultBatcherInput[] = [
      {
        addressType: AddressType.NEAR,
        address: "player.test.near",
        input: JSON.stringify({
          send: [{ tokenId: "usdc.test.near", amount: "100" }],
          receive: [{ tokenId: "wnear.test.near", minAmount: "1" }],
        }),
        timestamp: new Date(0).toISOString(),
        target: "near",
      },
    ];
    const result = intentAdapter.buildBatchData(inputs);
    if (result == null) return false;
    const intent = result.data.intents[0]!;
    return (
      result.data.signerAccountId === "solver.test.near" &&
      intent.signerId === "player.test.near" &&
      intent.send.length === 1 &&
      intent.receive.length === 1 &&
      BigInt(intent.expirationNs) > 0n
    );
  });

  // TODO: full integration — start batcher service with NearAdapter, submit a
  // signed input via HTTP POST, and verify the transaction lands on the sandbox.
}
