import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
} from "../common/http.ts";

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
    /**
     * SPL token balances after the transaction, one record per (token account,
     * mint) pair it touched. Returned by `getBlock` with
     * `transactionDetails: "full"`; absent on transactions that touched no token
     * account, and on validators old enough not to report them.
     *
     * `accountIndex` indexes the SAME resolved list as `pre`/`postBalances` — see
     * {@link resolveAccountKeys} — so a token account reached through a lookup
     * table is only findable after resolution.
     */
    postTokenBalances?: SolanaTokenBalance[] | null;
    /** Pre-state counterpart of {@link postTokenBalances}. */
    preTokenBalances?: SolanaTokenBalance[] | null;
  } | null;
};

export type SolanaTokenBalance = {
  /** Index into the resolved account list, NOT into `message.accountKeys` alone. */
  accountIndex: number;
  mint: string;
  /** Optional: older validators omit it. */
  owner?: string;
  /** The owning token program, i.e. SPL Token or Token-2022. Optional for the same reason. */
  programId?: string;
  uiTokenAmount: {
    /** Raw u64 in base units, as a string. */
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString?: string;
  };
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

/**
 * The highest transaction version a block is requested with by default.
 * Devnet blocks have carried version-1 transactions since solana-core 4.x; a
 * request below a block's highest version fails with -32015 for the WHOLE
 * block. The `json` encoding of a v1 transaction keeps `message.accountKeys`,
 * `instructions` and `meta.logMessages`, which is all this reader uses; older
 * validators (Agave 3.x) accept the value and simply return what they have.
 */
export const DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION = 1;
/** Never ask for a version above this when following a -32015 hint. */
const MAX_TRANSACTION_VERSION_HINT = 8;

/** HTTP 429 (or a JSON-RPC "too many requests"): the provider rate-limited us. */
export class SolanaRateLimitError extends Error {
  override name = "SolanaRateLimitError";
  constructor(
    readonly method: string,
    readonly httpStatus: number,
    /** From `Retry-After`, when the provider sent one. */
    readonly retryAfterMs: number | null,
  ) {
    super(`[Solana] RPC ${method} rate-limited (HTTP ${httpStatus}${retryAfterMs != null ? `, retry after ${retryAfterMs} ms` : ""})`);
  }
}

/** `Retry-After` as milliseconds: seconds or an HTTP date; null when absent or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (value == null || value.trim() === "") return null;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

/**
 * An RPC URL as it may appear in a log: the origin only. Provider URLs carry
 * the API key in the path or the query (`/?api-key=…`), and must never reach a
 * log line or an error message.
 */
export function redactRpcUrl(rpcUrl: string): string {
  try {
    return new URL(rpcUrl).origin;
  } catch {
    return "<unparseable RPC URL>";
  }
}

export type SolanaClientOptions = {
  /** See {@link DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION}. */
  maxSupportedTransactionVersion?: number;
};

export class SolanaClient {
  private readonly rpcUrl: string;
  /** Per-request deadline; see `sync-protocols/common/http.ts`. */
  private readonly requestTimeoutMs: number;
  /**
   * The transaction version `getBlock` asks for. Raised (once, and never above
   * {@link MAX_TRANSACTION_VERSION_HINT}) when a block answers -32015 naming a
   * higher one; lowered to 0 if the RPC rejects the parameter itself.
   */
  private maxTxVersion: number;

  constructor(
    rpcUrl: string,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    options: SolanaClientOptions = {},
  ) {
    this.rpcUrl = rpcUrl;
    this.requestTimeoutMs = requestTimeoutMs;
    this.maxTxVersion = options.maxSupportedTransactionVersion ?? DEFAULT_MAX_SUPPORTED_TRANSACTION_VERSION;
  }

  /** The transaction version the next `getBlock` asks for (tests, logs). */
  get maxSupportedTransactionVersion(): number {
    return this.maxTxVersion;
  }

  /** Removes the RPC URL (which may hold an API key) from an error's message. */
  private scrub(e: unknown): unknown {
    if (!(e instanceof Error) || !e.message.includes(this.rpcUrl)) return e;
    const clean = new Error(e.message.split(this.rpcUrl).join(redactRpcUrl(this.rpcUrl)));
    clean.name = e.name;
    return clean;
  }

  private async rpc<T>(
    method: string,
    params: unknown[] = [],
  ): Promise<T> {
    // Bounded: a blackholed endpoint would otherwise hang readData forever,
    // freezing block production with every health counter clean (sync
    // CLAUDE.md finding #4).
    let res: Response;
    try {
      res = await fetchWithTimeout(
        this.rpcUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params,
          }),
        },
        `Solana ${method}`,
        this.requestTimeoutMs,
      );
    } catch (e) {
      throw this.scrub(e);
    }

    if (res.status === 429) {
      throw new SolanaRateLimitError(method, 429, parseRetryAfter(res.headers.get("retry-after")));
    }
    let json: any;
    try {
      json = await res.json();
    } catch {
      throw new Error(`[Solana] RPC ${method}: HTTP ${res.status} with a body that is not JSON`);
    }
    if (json.error) {
      // Some providers answer 200 with a JSON-RPC rate-limit error instead of 429.
      if (json.error.code === 429 || json.error.code === -32429) {
        throw new SolanaRateLimitError(method, res.status, parseRetryAfter(res.headers.get("retry-after")));
      }
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
    // At most one change of the requested version per call (a -32015 hint, or
    // an RPC that rejects the parameter), then the outcome stands.
    for (let attempt = 0; ; attempt++) {
      const version = this.maxTxVersion;
      try {
        return await this.rpc<SolanaBlock | null>("getBlock", [
          slot,
          {
            encoding: "json",
            transactionDetails: "full",
            rewards: false,
            maxSupportedTransactionVersion: version,
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
        if (attempt === 0 && e instanceof Error) {
          // -32015: the block holds a transaction newer than `version`; the RPC
          // names the version to ask for. Follow it (once), and keep it.
          if (code === -32015) {
            const hint = /maxSupportedTransactionVersion"?\s*:?\s*(\d+)/.exec(e.message);
            const wanted = hint ? Number(hint[1]) : NaN;
            if (Number.isInteger(wanted) && wanted > version && wanted <= MAX_TRANSACTION_VERSION_HINT) {
              console.warn(`[Solana] blocks hold version-${wanted} transactions; asking for maxSupportedTransactionVersion ${wanted} from now on.`);
              this.maxTxVersion = wanted;
              continue;
            }
          }
          // An RPC too old to know the parameter value: fall back to 0.
          if (code === -32602 && version > 0 && /maxSupportedTransactionVersion|transaction version/i.test(e.message)) {
            console.warn(`[Solana] the RPC rejected maxSupportedTransactionVersion ${version}; asking for 0 from now on.`);
            this.maxTxVersion = 0;
            continue;
          }
        }
        throw e;
      }
    }
  }

}
