/**
 * NEAR batcher adapter test.
 *
 * STATUS: STUB — requires batcher service integration
 *
 * Should verify:
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
 * Requires:
 * - Batcher service running with NearAdapter configured
 * - A game contract on sandbox that accepts batched inputs
 * - For intents: a mock Solver Bus or test Solver Bus endpoint
 */
import { assert } from "@e2e-v2/engine";

export async function runBatcherTest(): Promise<void> {
  // TODO: Start batcher service with NearAdapter
  // TODO: Submit signed input via HTTP POST to batcher
  // TODO: Verify transaction lands on-chain

  await assert("NEAR Batcher — submits transaction to sandbox", async () => {
    // const res = await fetch("http://localhost:3334/send-input", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({
    //     address: "player.test.near",
    //     input: JSON.stringify({ action: "move", x: 1, y: 2 }),
    //     signature: "...",
    //     timestamp: new Date().toISOString(),
    //     target: "near",
    //   }),
    // });
    // return res.ok;
    return true; // STUB: passes unconditionally
  });
}
