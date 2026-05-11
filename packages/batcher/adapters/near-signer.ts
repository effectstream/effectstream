/**
 * NEAR transaction construction and signing utilities.
 *
 * Uses raw JSON-RPC calls to avoid hard dependency on near-api-js in the batcher core.
 * For production use, the batcher operator should provide a signing key.
 */

export interface NearSignerConfig {
  /** JSON-RPC endpoint */
  rpcUrl: string;
  /** NEAR account ID (e.g., "batcher.testnet") */
  accountId: string;
  /** Ed25519 private key in base58 format (e.g., "ed25519:...") */
  privateKey: string;
  /** Network ID: "mainnet", "testnet", or "localnet" */
  networkId: string;
}

export interface NearSignedTransaction {
  hash: string;
  signedTxBase64: string;
}

export interface NearFunctionCallAction {
  methodName: string;
  args: Record<string, unknown>;
  gas: string;
  deposit: string;
}

/**
 * Fetch the current nonce for an access key via JSON-RPC.
 */
export async function fetchAccessKeyNonce(
  rpcUrl: string,
  accountId: string,
  publicKey: string,
): Promise<number> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "view_access_key",
        finality: "final",
        account_id: accountId,
        public_key: publicKey,
      },
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`Failed to fetch access key nonce: ${JSON.stringify(json.error)}`);
  }
  return json.result.nonce;
}

/**
 * Fetch the latest block hash for transaction construction.
 */
export async function fetchLatestBlockHash(
  rpcUrl: string,
): Promise<{ hash: string; height: number }> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "block",
      params: { finality: "final" },
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`Failed to fetch latest block hash: ${JSON.stringify(json.error)}`);
  }
  return {
    hash: json.result.header.hash,
    height: json.result.header.height,
  };
}

/**
 * Submit a signed transaction via JSON-RPC broadcast_tx_commit.
 */
export async function broadcastTransaction(
  rpcUrl: string,
  signedTxBase64: string,
): Promise<{
  hash: string;
  status: { SuccessValue?: string; Failure?: unknown };
  blockHeight: number;
}> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "broadcast_tx_commit",
      params: [signedTxBase64],
    }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`Transaction broadcast failed: ${JSON.stringify(json.error)}`);
  }
  return {
    hash: json.result.transaction.hash,
    status: json.result.status,
    blockHeight: json.result.transaction_outcome.block_height,
  };
}

/**
 * Poll tx status until finalized.
 */
export async function waitForTxFinality(
  rpcUrl: string,
  txHash: string,
  senderAccountId: string,
  timeoutMs: number = 60_000,
): Promise<{
  hash: string;
  blockNumber: bigint;
  status: number;
}> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tx",
          params: { tx_hash: txHash, sender_account_id: senderAccountId, wait_until: "EXECUTED" },
        }),
      });
      const json = await res.json();
      if (json.result && json.result.status) {
        const success = json.result.status.SuccessValue !== undefined ||
          json.result.status.SuccessReceiptId !== undefined;
        return {
          hash: txHash,
          blockNumber: BigInt(json.result.transaction_outcome?.block_height ?? 0),
          status: success ? 1 : 0,
        };
      }
    } catch {
      // Retry on network errors
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for NEAR tx ${txHash}`);
}
