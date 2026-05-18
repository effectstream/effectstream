// ============================
// NEAR JSON-RPC type responses
// ============================

export type NearBlockHeader = {
  height: number;
  hash: string;
  /** Nanosecond timestamp */
  timestamp: number;
  /** Nanosecond timestamp as string in some APIs */
  timestamp_nanosec: string;
  chunks_included: number;
};

export type NearBlockChunkHeader = {
  chunk_hash: string;
  shard_id: number;
  height_included: number;
  tx_root: string;
};

export type NearBlock = {
  header: NearBlockHeader;
  chunks: NearBlockChunkHeader[];
};

export type NearChunkTransaction = {
  hash: string;
  signer_id: string;
  receiver_id: string;
  actions: NearAction[];
};

export type NearAction = {
  FunctionCall?: {
    method_name: string;
    args: string; // base64-encoded
    gas: number;
    deposit: string;
  };
  Transfer?: {
    deposit: string;
  };
  [key: string]: unknown;
};

export type NearChunk = {
  header: {
    chunk_hash: string;
    shard_id: number;
    height_included: number;
  };
  transactions: NearChunkTransaction[];
};

export type NearExecutionOutcome = {
  receipt_ids: string[];
  status: { SuccessValue?: string; SuccessReceiptId?: string; Failure?: unknown };
  logs: string[];
  executor_id: string;
};

export type NearExecutionOutcomeWithId = {
  id: string;
  outcome: NearExecutionOutcome;
  block_hash: string;
};

export type NearTxStatusResult = {
  transaction: {
    hash: string;
    signer_id: string;
    receiver_id: string;
    actions: NearAction[];
  };
  transaction_outcome: NearExecutionOutcomeWithId;
  receipts_outcome: NearExecutionOutcomeWithId[];
};

// ==============
// NEP-297 events
// ==============

export type Nep297Event = {
  standard: string;
  version: string;
  event: string;
  data: unknown[];
};

/**
 * Parse a NEP-297 event from a NEAR execution log line.
 * NEP-297 events have the format: `EVENT_JSON:{...}`
 */
export function parseNep297Log(log: string): Nep297Event | null {
  if (!log.startsWith("EVENT_JSON:")) return null;
  try {
    return JSON.parse(log.slice("EVENT_JSON:".length));
  } catch {
    return null;
  }
}

// ===========
// RPC client
// ===========

export class NearClient {
  private readonly rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });

    const json = await res.json();
    if (json.error) {
      throw new Error(
        `[NEAR] RPC error [${method}]: ${json.error.cause?.name ?? json.error.message ?? JSON.stringify(json.error)}`,
      );
    }
    return json.result as T;
  }

  async getBlock(
    params: { finality: "final" | "optimistic" } | { block_id: number },
  ): Promise<NearBlock> {
    return this.rpc<NearBlock>("block", params);
  }

  async getChunk(chunkHash: string): Promise<NearChunk> {
    return this.rpc<NearChunk>("chunk", { chunk_id: chunkHash });
  }

  async getTxStatus(
    txHash: string,
    senderAccountId: string,
  ): Promise<NearTxStatusResult> {
    return this.rpc<NearTxStatusResult>("EXPERIMENTAL_tx_status", {
      tx_hash: txHash,
      sender_account_id: senderAccountId,
      wait_until: "EXECUTED",
    });
  }

  async getLatestBlockHeight(): Promise<number> {
    const block = await this.getBlock({ finality: "final" });
    return block.header.height;
  }

  async viewFunction(
    accountId: string,
    methodName: string,
    argsBase64: string = "",
  ): Promise<unknown> {
    const result = await this.rpc<{
      result: number[];
      logs: string[];
      block_height: number;
      block_hash: string;
    }>("query", {
      request_type: "call_function",
      finality: "final",
      account_id: accountId,
      method_name: methodName,
      args_base64: argsBase64,
    });
    const bytes = new Uint8Array(result.result);
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  }
}
