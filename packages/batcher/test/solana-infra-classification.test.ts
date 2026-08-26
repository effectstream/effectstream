// What a totally failed Solana batch tells the processor about WHY it failed.
//
// `BatchProcessor` decides whether a batch-wide throw is the environment's
// fault or the inputs' fault by reading the thrown message
// (`BatchProcessor.isInfraFailure`). An INFRASTRUCTURE verdict parks the target
// with every retry budget untouched; anything else charges each input a retry,
// and after `maxRetries` the rows are deleted and the requests are published
// `failed/RETRIES_EXHAUSTED`.
//
// So the adapter's thrown message is not cosmetic — it is the whole input to
// that decision. If `submitBatch` swallows the per-transaction rejection texts
// and throws only a constant, an RPC outage of OUR OWN endpoint is read as a
// verdict about the users' transactions and destroys them.
//
// These tests pin both directions, and they assert against
// `BatchProcessor.isInfraFailure` itself rather than a copy of its regex — a
// copy would keep passing after the real classifier drifted away from it.
//
// No network is touched: `connection.sendRawTransaction` is stubbed on the
// constructed adapter, so the configured RPC URL is never contacted.

import { test, expect } from "bun:test";
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";

import { SolanaAdapter } from "../adapters/solana-adapter.ts";
import { BatchProcessor } from "../core/batch-processor.ts";

// Deterministic sponsor (fee payer), so the payloads below are reproducible.
const sponsorKeypair = Keypair.fromSeed(new Uint8Array(32).fill(7));
const TARGET_PROGRAM_ID = Keypair.fromSeed(new Uint8Array(32).fill(5))
  .publicKey.toBase58();

// Port 1 is unroutable on purpose: if a stub ever fails to take effect, the
// test fails loudly instead of quietly reaching a real endpoint.
const TEST_CONFIG = {
  rpcUrl: "http://127.0.0.1:1",
  batcherSecretKey: bs58.encode(sponsorKeypair.secretKey),
  targetProgramId: TARGET_PROGRAM_ID,
} as const;

// Stand-in recent blockhash (any 32-byte base58 value); nothing validates it
// here because the submission never leaves the process.
const RECENT_BLOCKHASH = Keypair.generate().publicKey.toBase58();

/** A base64, user-partially-signed tx whose fee payer is the sponsor. */
function sponsoredTx(): string {
  const user = Keypair.generate();
  const tx = new Transaction();
  tx.feePayer = sponsorKeypair.publicKey;
  tx.recentBlockhash = RECENT_BLOCKHASH;
  tx.add(
    new TransactionInstruction({
      keys: [{ pubkey: user.publicKey, isSigner: true, isWritable: false }],
      programId: new PublicKey(TARGET_PROGRAM_ID),
      data: Buffer.from("memo", "utf8"),
    }),
  );
  tx.partialSign(user);
  return tx.serialize({ requireAllSignatures: false }).toString("base64");
}

/**
 * Build an adapter whose `sendRawTransaction` is driven by `respond`, called
 * once per transaction in submission order. `connection` is private, which is
 * exactly why it has to be reached through a cast: the point of the test is to
 * exercise the real `submitBatch` against a controlled RPC.
 */
function adapterWithSendStub(
  respond: (call: number) => Promise<string>,
): SolanaAdapter {
  const adapter = new SolanaAdapter(TEST_CONFIG);
  let call = 0;
  // deno-lint-ignore no-explicit-any
  (adapter as any).connection.sendRawTransaction = () => respond(call++);
  return adapter;
}

/** Run `submitBatch` expecting a throw, and hand back what was thrown. */
async function thrownBy(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  throw new Error("expected submitBatch to throw, but it resolved");
}

const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e);

// ── User Story 1: an RPC outage must park, not charge ────────────────────────

test("a batch where every send fails on transport is classified as INFRASTRUCTURE", async () => {
  const adapter = adapterWithSendStub(() =>
    Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:8899"))
  );

  const error = await thrownBy(() =>
    adapter.submitBatch({ transactions: [sponsoredTx(), sponsoredTx()] }, 0n)
  );

  // The whole defect in one assertion: our own RPC being down must not be
  // charged to the users' retry budgets.
  expect(BatchProcessor.isInfraFailure(error)).toBe(true);

  // And the operator reading the parking log must still see both the
  // batch-level context and the underlying transport text.
  const message = messageOf(error);
  expect(message).toContain("[Solana]");
  expect(message).toContain("no transaction in the batch could be submitted");
  expect(message).toContain("ECONNREFUSED");
});

test("a non-Error rejection value still reaches the classifier", async () => {
  // Node/undici and older RPC clients reject with bare strings often enough
  // that `String(e)` semantics are part of the contract, not an accident.
  const adapter = adapterWithSendStub(() =>
    Promise.reject("socket hang up") as Promise<string>
  );

  const error = await thrownBy(() =>
    adapter.submitBatch({ transactions: [sponsoredTx()] }, 0n)
  );

  expect(BatchProcessor.isInfraFailure(error)).toBe(true);
  expect(messageOf(error)).toContain("socket hang up");
});

// ── User Story 2: a genuine chain verdict must still charge ──────────────────

test("a batch rejected by the chain itself is NOT classified as INFRASTRUCTURE", async () => {
  const adapter = adapterWithSendStub(() =>
    Promise.reject(
      new Error(
        "Transaction simulation failed: Error processing Instruction 0: custom program error: 0x1",
      ),
    )
  );

  const error = await thrownBy(() =>
    adapter.submitBatch({ transactions: [sponsoredTx(), sponsoredTx()] }, 0n)
  );

  // Making outages park must not make doomed inputs park too — that trades
  // silent input loss for a silent hang.
  expect(BatchProcessor.isInfraFailure(error)).toBe(false);
  expect(messageOf(error)).toContain("custom program error: 0x1");
});

// ── User Story 3: partial success is unchanged ───────────────────────────────

test("one failed send does not sink a batch that also submitted successfully", async () => {
  const adapter = adapterWithSendStub((call) =>
    call === 0
      ? Promise.reject(new Error("connect ECONNREFUSED 127.0.0.1:8899"))
      : Promise.resolve("SIGNATURE_THAT_LANDED")
  );

  // Never abort mid-batch: these are independent transactions, and throwing
  // would discard the signature of one that is already on chain.
  const signature = await adapter.submitBatch(
    { transactions: [sponsoredTx(), sponsoredTx()] },
    0n,
  );

  expect(signature).toBe("SIGNATURE_THAT_LANDED");
});

// ── Edge case: nothing to report ─────────────────────────────────────────────

test("an all-empty payload throws the bare batch-level error, with no dangling separator", async () => {
  // Empty slots are skipped before any send is attempted, so there are no
  // per-transaction texts to append — and the message must not advertise a
  // list it does not have.
  const adapter = adapterWithSendStub(() =>
    Promise.reject(new Error("should never be called"))
  );

  const error = await thrownBy(() =>
    adapter.submitBatch({ transactions: ["", ""] }, 0n)
  );

  const message = messageOf(error);
  expect(message).toContain("no transaction in the batch could be submitted");
  expect(/[:;,-]\s*$/.test(message)).toBe(false);
});
