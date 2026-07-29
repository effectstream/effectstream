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
      throw new Error(
        `[Solana] RPC error [${method}]: ${json.error.message ?? JSON.stringify(json.error)}`,
      );
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
      // Slot was skipped (no block produced) — return null
      if (
        e instanceof Error &&
        e.message.includes("was skipped")
      ) {
        return null;
      }
      throw e;
    }
  }

  async getBlocks(
    startSlot: number,
    endSlot: number,
  ): Promise<(number | null)[]> {
    return this.rpc<(number | null)[]>("getBlocks", [
      startSlot,
      endSlot,
      { commitment: "confirmed" },
    ]);
  }

  async getAccountInfo(
    address: string,
  ): Promise<{ lamports: number } | null> {
    return this.rpc<{ lamports: number } | null>(
      "getAccountInfo",
      [
        address,
        { commitment: "confirmed", encoding: "base64" },
      ],
    );
  }

  async getBalance(
    address: string,
  ): Promise<number> {
    return this.rpc<number>("getBalance", [
      address,
      { commitment: "confirmed" },
    ]);
  }
}
