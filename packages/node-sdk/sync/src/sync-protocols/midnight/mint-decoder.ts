import { Buffer } from "node:buffer";
import * as ledger from "@midnightntwrk/ledger-v9";

// Decodes custom token mints out of a raw Midnight transaction. A contract
// call's transcript effects record mints as `domain_sep → amount` maps
// (`shieldedMints` / `unshieldedMints`); the resulting token type ("color")
// is `rawTokenType(domain_sep, contract_address)`. Neither the indexer's
// GraphQL nor the wallet expose this mapping, so the only route is
// deserializing the transaction bytes with ledger-v9 — same approach as
// zswap-decoder.ts for nullifier events.

export class MintTransactionDecodeError extends Error {
  override readonly name = "MintTransactionDecodeError";

  constructor(
    message: string,
    readonly rawHex: string,
    readonly decodeCause?: unknown,
  ) {
    super(message);
  }
}

export interface TokenMintRecord {
  /** Address of the minting contract, hex */
  contractAddress: string;
  /** 32-byte domain separator pre-image, hex */
  domainSep: string;
  /** Derived token type ("color") = rawTokenType(domainSep, contractAddress), hex */
  rawTokenType: string;
  kind: "shielded" | "unshielded";
  /** Total minted for this (call, domainSep, kind), as a decimal string (u64 exceeds MAX_SAFE_INTEGER) */
  amount: string;
  /** Contract entry point that minted, when printable */
  entryPoint?: string;
}

export interface TxResultLike {
  status: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILURE";
  segments?: { id: number; success: boolean }[] | null;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Uint8Array.from(Buffer.from(clean, "hex"));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeHex(value: string): string {
  return value.replace(/^0x/, "").toLowerCase();
}

/**
 * Extract every applied token mint from a raw serialized transaction.
 *
 * Segment semantics (failed segments roll back on chain):
 * - no `result` (system transactions) or status FAILURE → nothing applied;
 * - SUCCESS → guaranteed + all fallible transcripts applied;
 * - PARTIAL_SUCCESS → guaranteed transcripts applied, fallible only where
 *   the intent's segment (the `intents` map key) succeeded.
 */
export function decodeTokenMints(
  rawHex: string,
  result?: TxResultLike | null,
): TokenMintRecord[] {
  if (!result || result.status === "FAILURE") return [];

  let tx: any;
  try {
    tx = ledger.Transaction.deserialize(
      "signature",
      "proof",
      "binding",
      hexToBytes(rawHex),
    );
  } catch (decodeCause) {
    throw new MintTransactionDecodeError(
      `ledger-v9 could not deserialize protocolVersion 2000000 transaction: ${
        (decodeCause as Error)?.message ?? String(decodeCause)
      }`,
      rawHex,
      decodeCause,
    );
  }

  const records: TokenMintRecord[] = [];
  for (const [segmentId, intent] of tx.intents ?? new Map()) {
    const fallibleApplied = result.status === "SUCCESS" ||
      (result.segments?.some((s) => s.id === Number(segmentId) && s.success) ??
        false);
    for (const action of intent.actions ?? []) {
      // Only contract calls carry transcripts; deploys and maintenance
      // updates cannot mint.
      if (!(action instanceof ledger.ContractCall)) continue;
      try {
        records.push(...mintsOfCall(action, fallibleApplied));
      } catch (decodeCause) {
        throw new MintTransactionDecodeError(
          `ledger-v9 failed to read mint transcripts for contract ${
            (action as any)?.address ?? "?"
          }: ${(decodeCause as Error)?.message ?? String(decodeCause)}`,
          rawHex,
          decodeCause,
        );
      }
    }
  }
  return records;
}

function mintsOfCall(
  call: any,
  fallibleApplied: boolean,
): TokenMintRecord[] {
  // Accumulate domainSep|kind → amount across the applied transcripts. The
  // guaranteed transcript applied whenever the transaction wasn't a FAILURE
  // (the caller filters those); the fallible transcript only if its segment
  // succeeded.
  const totals = new Map<string, bigint>();
  const transcripts = [
    call.guaranteedTranscript,
    ...(fallibleApplied ? [call.fallibleTranscript] : []),
  ];
  for (const transcript of transcripts) {
    const effects = transcript?.effects;
    if (!effects) continue;
    for (
      const [kind, mints] of [
        ["shielded", effects.shieldedMints],
        ["unshielded", effects.unshieldedMints],
      ] as const
    ) {
      for (const [sepHex, amount] of mints ?? new Map()) {
        const key = `${normalizeHex(String(sepHex))}|${kind}`;
        totals.set(key, (totals.get(key) ?? 0n) + BigInt(amount));
      }
    }
  }

  const records: TokenMintRecord[] = [];
  for (const [key, amount] of totals) {
    const [domainSep, kind] = key.split("|") as [
      string,
      "shielded" | "unshielded",
    ];
    records.push({
      contractAddress: normalizeHex(String(call.address)),
      domainSep,
      rawTokenType: normalizeHex(
        String(ledger.rawTokenType(hexToBytes(domainSep), call.address)),
      ),
      kind,
      amount: amount.toString(),
      entryPoint: typeof call.entryPoint === "string"
        ? call.entryPoint
        : bytesToHex(call.entryPoint),
    });
  }
  return records;
}
