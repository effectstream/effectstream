/**
 * A fake Solana JSON-RPC for the program-mode tests (AA 00064). Not a test
 * file itself. It serves an in-memory chain through a replaced `fetch`, so
 * every call goes through the real `SolanaClient` (counters, version handling,
 * 429 parsing), with the semantics measured on devnet in R2:
 *
 *  - `getSignaturesForAddress`: newest first by (slot, transactionIndex);
 *    `limit` 1..1000 (else -32602); `before` exclusive, unknown → -32020;
 *    `until` exclusive, unknown → `[]` with NO error; `minContextSlot` above
 *    the node's view → -32016; failed transactions listed with `err`;
 *  - `getBlockTime`: skipped → -32007, past the tip → -32004;
 *  - `getTransaction`: unknown → `result: null`; a v1 transaction asked with
 *    version 0 → -32015 naming version 1;
 *  - `getBlock`: the slot's transactions in index order, skipped → -32007.
 */

export type FakeTx = {
  signature: string;
  slot: number;
  index: number;
  /** Programs the transaction lists as accounts (`getSignaturesForAddress` indexes these). */
  accounts: string[];
  /** Programs it invokes, with their own `Program log:` lines. */
  logs: string[];
  err?: unknown;
  version?: number | "legacy";
  /** Override the slot's blockTime on getTransaction (e.g. null). */
  blockTimeOverride?: number | null;
};

export type RpcRequest = { method: string; params: any[] };

export type Injected = {
  method: string;
  /**
   * Which call of `method` (1-based, counted from when this was injected) to
   * answer with this. Default: the next call not already claimed by another
   * injection, so injecting twice answers the next two calls.
   */
  times?: number;
  status?: number;
  headers?: Record<string, string>;
  error?: { code: number; message: string; data?: unknown };
  /** A transport failure (fetch rejects), e.g. a timeout. */
  throws?: Error;
  /** Answer `result` instead (e.g. null for getTransaction). */
  result?: unknown;
};

export class FakeSolanaChain {
  /** The node's view: `finalized` tip, and how far `getSignaturesForAddress` has indexed. */
  finalized = 100;
  /** `getSlot(confirmed)` answers this (block mode). Defaults to `finalized`. */
  confirmed: number | null = null;
  /** Slots the finalized tip advances after each `getSlot(finalized)` (a live chain). */
  tipStepPerGetSlot = 0;
  readonly txs: FakeTx[] = [];
  readonly skipped = new Set<number>();
  readonly nullBlockTime = new Set<number>();
  /** blockTime of slot s, unless overridden (non-decreasing in slot). */
  baseTime = 1_700_000_000;
  blockTimeOf = (slot: number) => this.baseTime + Math.floor(slot / 4);
  /** Omit `transactionIndex` from getSignaturesForAddress / getTransaction (Helius may). */
  omitIndexInList = false;
  omitIndexInTx = false;
  /** Every request received, in order. */
  readonly requests: RpcRequest[] = [];
  /** Pending injections, each with the absolute call number of its method it answers. */
  private readonly injected: { at: number; i: Injected }[] = [];

  add(tx: FakeTx): FakeTx {
    this.txs.push(tx);
    return tx;
  }

  /** A transaction that invokes `program` and logs `line`. */
  invoke(program: string, signature: string, slot: number, index: number, line: string, extra: Partial<FakeTx> = {}): FakeTx {
    return this.add({
      signature,
      slot,
      index,
      accounts: ["payer111", program],
      logs: [`Program ${program} invoke [1]`, `Program log: ${line}`, `Program ${program} success`],
      ...extra,
    });
  }

  inject(i: Injected): void {
    const base = this.count(i.method);
    const claimed = this.injected.filter((p) => p.i.method === i.method).map((p) => p.at);
    const at = i.times != null ? base + i.times : Math.max(base, ...claimed) + 1;
    this.injected.push({ at, i });
  }

  calls(method?: string): RpcRequest[] {
    return method ? this.requests.filter((r) => r.method === method) : this.requests;
  }

  count(method: string): number {
    return this.calls(method).length;
  }

  /** Install as `globalThis.fetch`; returns the restore function. */
  install(): () => void {
    const original = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => this.serve(JSON.parse(String(init?.body)))) as typeof fetch;
    return () => {
      globalThis.fetch = original;
    };
  }

  private json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  }

  private async serve(req: { id: number; method: string; params: any[] }): Promise<Response> {
    this.requests.push({ method: req.method, params: req.params });
    const callNo = this.count(req.method);
    const hit = this.injected.find((p) => p.i.method === req.method && p.at === callNo);
    if (hit != null) {
      this.injected.splice(this.injected.indexOf(hit), 1);
      const i = hit.i;
      if (i.throws) throw i.throws;
      if (i.status != null && i.status !== 200) return this.json({ jsonrpc: "2.0", id: req.id, error: { code: i.status, message: "Too many requests" } }, i.status, i.headers);
      if (i.error) return this.json({ jsonrpc: "2.0", id: req.id, error: i.error });
      return this.json({ jsonrpc: "2.0", id: req.id, result: i.result ?? null });
    }
    try {
      return this.json({ jsonrpc: "2.0", id: req.id, result: this.answer(req.method, req.params) });
    } catch (e) {
      const err = e as { code: number; message: string; data?: unknown };
      return this.json({ jsonrpc: "2.0", id: req.id, error: { code: err.code, message: err.message, data: err.data } });
    }
  }

  private blockTimeAt(slot: number): number | null {
    if (this.nullBlockTime.has(slot)) return null;
    return this.blockTimeOf(slot);
  }

  private answer(method: string, params: any[]): unknown {
    switch (method) {
      case "getSlot": {
        const commitment = params?.[0]?.commitment;
        if (commitment !== "finalized") return this.confirmed ?? this.finalized;
        const tip = this.finalized;
        this.finalized += this.tipStepPerGetSlot;
        return tip;
      }
      case "getBlockTime": {
        const slot = params[0] as number;
        if (slot > Math.max(this.finalized, this.confirmed ?? 0)) throw { code: -32004, message: `Block not available for slot ${slot}` };
        if (this.skipped.has(slot)) throw { code: -32007, message: `Slot ${slot} was skipped, or missing due to ledger jump to recent snapshot` };
        return this.blockTimeAt(slot);
      }
      case "getSignaturesForAddress": {
        const [address, cfg] = params as [string, { limit?: number; before?: string; until?: string; commitment?: string; minContextSlot?: number }];
        if (cfg.commitment === "processed") throw { code: -32602, message: "Method does not support commitment below `confirmed`" };
        const limit = cfg.limit ?? 1000;
        if (limit < 1 || limit > 1000) throw { code: -32602, message: "Invalid limit; max 1000" };
        if (cfg.minContextSlot != null && cfg.minContextSlot > this.finalized) {
          throw { code: -32016, message: "Minimum context slot has not been reached", data: { contextSlot: this.finalized } };
        }
        let list = this.txs
          .filter((t) => t.accounts.includes(address))
          .sort((a, b) => b.slot - a.slot || b.index - a.index);
        if (cfg.before != null) {
          const i = list.findIndex((t) => t.signature === cfg.before);
          if (i === -1) throw { code: -32020, message: `Transaction ${cfg.before} not found` };
          list = list.slice(i + 1);
        }
        if (cfg.until != null) {
          const i = list.findIndex((t) => t.signature === cfg.until);
          if (i === -1) return [];
          list = list.slice(0, i);
        }
        return list.slice(0, limit).map((t) => ({
          signature: t.signature,
          slot: t.slot,
          err: t.err ?? null,
          memo: null,
          blockTime: this.blockTimeAt(t.slot),
          confirmationStatus: "finalized",
          ...(this.omitIndexInList ? {} : { transactionIndex: t.index }),
        }));
      }
      case "getTransaction": {
        const [signature, cfg] = params as [string, { maxSupportedTransactionVersion?: number }];
        const t = this.txs.find((x) => x.signature === signature);
        if (!t) return null;
        const v = t.version ?? "legacy";
        if (typeof v === "number" && (cfg.maxSupportedTransactionVersion ?? -1) < v) {
          throw { code: -32015, message: `Transaction version (${v}) is not supported by the requesting client. Please try the request again with the following configuration parameter: "maxSupportedTransactionVersion": ${v}` };
        }
        return {
          slot: t.slot,
          blockTime: t.blockTimeOverride !== undefined ? t.blockTimeOverride : this.blockTimeAt(t.slot),
          version: v,
          ...(this.omitIndexInTx ? {} : { transactionIndex: t.index }),
          ...this.txBody(t),
        };
      }
      case "getBlock": {
        const [slot, cfg] = params as [number, { maxSupportedTransactionVersion?: number }];
        if (slot > (this.confirmed ?? this.finalized)) throw { code: -32004, message: `Block not available for slot ${slot}` };
        if (this.skipped.has(slot)) throw { code: -32007, message: `Slot ${slot} was skipped, or missing due to ledger jump to recent snapshot` };
        const inSlot = this.txs.filter((t) => t.slot === slot).sort((a, b) => a.index - b.index);
        const maxV = Math.max(-1, ...inSlot.map((t) => (typeof t.version === "number" ? t.version : -1)));
        if ((cfg.maxSupportedTransactionVersion ?? -1) < maxV) {
          throw { code: -32015, message: `Transaction version (${maxV}) is not supported by the requesting client. Please try the request again with the following configuration parameter: "maxSupportedTransactionVersion": ${maxV}` };
        }
        // Fill the index gaps with unrelated transactions, as a real block has.
        const width = inSlot.length === 0 ? 0 : inSlot[inSlot.length - 1].index + 1;
        const transactions = Array.from({ length: width }, (_, i) => {
          const t = inSlot.find((x) => x.index === i);
          return t
            ? { version: t.version ?? "legacy", ...this.txBody(t) }
            : this.txBody({ signature: `filler-${slot}-${i}`, slot, index: i, accounts: ["vote111"], logs: ["Program Vote111 invoke [1]", "Program Vote111 success"] });
        });
        return {
          blockhash: `hash-${slot}`,
          blockTime: this.blockTimeAt(slot),
          blockHeight: slot,
          parentSlot: slot - 1,
          previousBlockhash: `hash-${slot - 1}`,
          transactions,
        };
      }
      default:
        throw { code: -32601, message: `Method not found: ${method}` };
    }
  }

  private txBody(t: FakeTx) {
    return {
      transaction: { signatures: [t.signature], message: { accountKeys: t.accounts, instructions: [], recentBlockhash: "x" } },
      meta: {
        err: t.err ?? null,
        logMessages: t.logs,
        preBalances: t.accounts.map(() => 1),
        postBalances: t.accounts.map(() => 1),
        loadedAddresses: { writable: [], readonly: [] },
      },
    };
  }
}
