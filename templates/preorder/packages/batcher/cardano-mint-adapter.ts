// Cardano mint adapter for the batcher.
//
// There is no built-in Cardano adapter in the batcher SDK, so this implements the minimal
// BlockchainAdapter surface for minting an item NFT to a buyer: a native-policy mint that
// delivers to the buyer's address (derived from their payment-key-hash), via the server-side
// Lucid wallet (funded from the YACI faucet). One input per batch (buildBatchData takes the
// first), and submitBatch already awaits the tx, so confirmation is immediate.

import type {
  BlockchainAdapter,
  BatchBuildingOptions,
  BatchBuildingResult,
  BlockchainHash,
  BlockchainTransactionReceipt,
  DefaultBatcherInput,
} from "@effectstream/batcher-sdk";
import { initLucid, mintItemNftToAddress } from "@preorder/contracts-cardano/helpers";

type CardanoMintData = { to: string; assetName: string } | null;

export class CardanoMintAdapter implements BlockchainAdapter<CardanoMintData> {
  buildBatchData(
    inputs: DefaultBatcherInput[],
    _options?: BatchBuildingOptions,
  ): BatchBuildingResult<CardanoMintData> | null {
    if (inputs.length === 0) return null;
    const input = inputs[0]; // one mint per batch
    try {
      const payload = JSON.parse(input.input) as { to: string; assetName: string };
      return { selectedInputs: [input], data: { to: String(payload.to), assetName: String(payload.assetName) } };
    } catch {
      return { selectedInputs: [input], data: null };
    }
  }

  async submitBatch(data: CardanoMintData, _fee?: string | bigint): Promise<BlockchainHash> {
    if (!data) throw new Error("cardano mint: empty/invalid payload");
    const lucid = await initLucid();
    const { txHash } = await mintItemNftToAddress(lucid, data.assetName, data.to);
    return txHash;
  }

  // submitBatch already awaits the tx (lucid.awaitTx), so the receipt is immediate.
  async waitForTransactionReceipt(hash: BlockchainHash): Promise<BlockchainTransactionReceipt> {
    return { hash, blockNumber: 0n, status: 1 };
  }

  estimateBatchFee(): string | bigint {
    return 0n;
  }

  getAccountAddress(): string {
    return "cardano-batcher";
  }

  getChainName(): string {
    return "Cardano (YACI)";
  }

  isReady(): boolean {
    return true;
  }

  async getBlockNumber(): Promise<bigint> {
    return 0n;
  }

  getSyncProtocolName(): string {
    return "parallelUtxoRpc";
  }

  // Internal node jobs carry no per-user signature (the channel is trusted/local).
  verifySignature(): boolean {
    return true;
  }

  validateInput(): { valid: boolean } {
    return { valid: true };
  }
}
