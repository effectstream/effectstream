// ==========================
// Solana JSON-RPC type defs
// ==========================

export type SolanaBlock = {
  blockhash: string;
  blockTime: number | null;
  blockHeight: number | null;
  parentSlot: number;
  previousBlockhash: string;
  transactions: SolanaTransaction[];
};

export type SolanaTransaction = {
  transaction: {
    message: {
      accountKeys: string[];
      instructions: SolanaInstruction[];
    };
    signatures: string[];
  };
  /**
   * Null when the RPC could not decode the transaction (e.g. a version newer
   * than `maxSupportedTransactionVersion`). Callers must null-check.
   */
  meta: {
    err: unknown | null;
    logMessages: string[] | null;
    preBalances: number[];
    postBalances: number[];
    /**
     * Addresses a versioned (v0) transaction pulled in through an address
     * lookup table. These are NOT in `message.accountKeys`, which carries only
     * static keys — but `pre`/`postBalances` are indexed over the full list.
     * See {@link resolveAccountKeys} for the ordering.
     */
    loadedAddresses?: {
      writable: string[];
      readonly: string[];
    } | null;
  } | null;
};

/**
 * The account list `pre`/`postBalances` are indexed against: static message
 * keys first, then lookup-table writable addresses, then lookup-table readonly
 * ones. Legacy transactions have no `loadedAddresses`, so this is just the
 * static keys.
 */
export function resolveAccountKeys(
  accountKeys: string[],
  loadedAddresses?: { writable: string[]; readonly: string[] } | null,
): string[] {
  if (!loadedAddresses) return accountKeys;
  return [
    ...accountKeys,
    ...(loadedAddresses.writable ?? []),
    ...(loadedAddresses.readonly ?? []),
  ];
}

export type SolanaInstruction = {
  programId: string;
  accounts: string[];
  data: string;
};

// ===========
// RPC Client
// ===========

export class SolanaClient {
  private readonly rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  private async rpc<T>(
    method: string,
    params: unknown[] = [],
  ): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
    });

    const json = await res.json();
    if (json.error) {
      const err = new Error(
        `[Solana] RPC error [${method}]: ${json.error.message ?? JSON.stringify(json.error)}`,
      ) as Error & { rpcCode?: number };
      // Preserve the JSON-RPC code so callers can branch on it instead of
      // pattern-matching human-readable messages.
      err.rpcCode = typeof json.error.code === "number" ? json.error.code : undefined;
      throw err;
    }
    return json.result as T;
  }

  async getSlot(): Promise<number> {
    return this.rpc<number>("getSlot", [
      { commitment: "confirmed" },
    ]);
  }

  async getBlock(
    slot: number,
  ): Promise<SolanaBlock | null> {
    try {
      return await this.rpc<SolanaBlock | null>("getBlock", [
        slot,
        {
          encoding: "json",
          transactionDetails: "full",
          rewards: false,
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        },
      ]);
    } catch (e) {
      // A skipped slot is normal on Solana: no block was produced. Branch on the
      // JSON-RPC code rather than the message text —
      //   -32007 SLOT_SKIPPED, -32009 LONG_TERM_STORAGE_SLOT_SKIPPED.
      // Deliberately NOT -32004 (block not available yet): that is a transient
      // "ask again" and must keep throwing so the fetcher retries rather than
      // treating the slot as permanently empty.
      const code = (e as { rpcCode?: number }).rpcCode;
      if (code === -32007 || code === -32009) return null;
      // Fall back to the message for RPCs that omit or remap the code.
      if (e instanceof Error && e.message.includes("was skipped")) return null;
      throw e;
    }
  }

}
