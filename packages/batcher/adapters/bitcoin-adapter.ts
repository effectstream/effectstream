import * as bitcoin from "bitcoinjs-lib";
import * as bitcoinMessage from "bitcoinjs-message";
import { ECPairFactory } from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const ECPair = ECPairFactory(tinysecp);

// Interface for the input payload signed by the user
interface BitcoinRequest {
  toAddress: string;
  amountSats: number;
}

// The shape of data passed from Builder to Submitter
export interface BitcoinBatchPayload {
  recipients: { address: string; value: number }[];
  totalAmountSats: number;
}

export interface BitcoinAdapterConfig {
  rpcUrl: string;
  rpcUser: string;
  rpcPass: string;
  batcherWif: string; // Wallet Import Format private key
  network?: bitcoin.Network; // Defaults to regtest
  maxBatchSize?: number;
}

export class BitcoinAdapter implements BlockchainAdapter<BitcoinBatchPayload> {
  private readonly rpcUrl: string;
  private readonly rpcAuth: string; // "user:password"
  private readonly keyPair: any;
  private readonly network: bitcoin.Network;
  public readonly maxBatchSize: number;
  private readonly batcherAddress: string;

  constructor(config: BitcoinAdapterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.rpcAuth = btoa(`${config.rpcUser}:${config.rpcPass}`);
    this.network = config.network ?? bitcoin.networks.regtest;
    this.keyPair = ECPair.fromWIF(config.batcherWif, this.network);
    this.maxBatchSize = config.maxBatchSize ?? 50;

    const { address } = bitcoin.payments.p2wpkh({ 
      pubkey: this.keyPair.publicKey, 
      network: this.network 
    });
    this.batcherAddress = address!;
  }

  getChainName(): string {
    return "Bitcoin Regtest";
  }

  getAccountAddress(): string {
    return this.batcherAddress;
  }

  isReady(): boolean {
    return !!this.keyPair;
  }

  async getBlockNumber(): Promise<bigint> {
    const count = await this.rpcCall("getblockcount", []);
    return BigInt(count);
  }

  // ----------------------------------------------------------------
  // 1. Validation
  // ----------------------------------------------------------------

  async verifySignature(input: DefaultBatcherInput): Promise<boolean> {
    try {
      // 1. Parse the intent
      const payload: BitcoinRequest = JSON.parse(input.input);
      
      // 2. Reconstruct the message the user should have signed
      // Format: "I authorize sending <amt> to <addr> at <timestamp>"
      // This format must match exactly what your frontend generates
      const message = `Send ${payload.amountSats} sats to ${payload.toAddress} at ${input.timestamp}`;

      // 3. Verify signature using bitcoinjs-message
      // Note: input.address is the User's Bitcoin Address
      return bitcoinMessage.verify(
        message, 
        input.address, 
        input.signature!, 
        undefined, 
        true // checkSegwitAlways
      );
    } catch (e) {
      console.error("Sig verification failed:", e);
      return false;
    }
  }

  async validateInput(input: DefaultBatcherInput): Promise<ValidationResult> {
    try {
      const payload: BitcoinRequest = JSON.parse(input.input);

      // Check Dust Limit (approx 546 sats)
      if (payload.amountSats < 546) {
        return { valid: false, error: "Amount below dust limit (546 sats)" };
      }

      // Basic address validation
      try {
        bitcoin.address.toOutputScript(payload.toAddress, this.network);
      } catch {
        return { valid: false, error: "Invalid Regtest address" };
      }

      return { valid: true };
    } catch (e) {
      return { valid: false, error: "Malformed JSON input" };
    }
  }

  // ----------------------------------------------------------------
  // 2. Batch Building
  // ----------------------------------------------------------------

  buildBatchData(
    inputs: DefaultBatcherInput[],
    options?: BatchBuildingOptions
  ): BatchBuildingResult<BitcoinBatchPayload> | null {
    if (inputs.length === 0) return null;

    const maxSize = options?.maxSize ?? this.maxBatchSize;
    const selectedInputs: DefaultBatcherInput[] = [];
    const recipients: { address: string; value: number }[] = [];
    let totalAmountSats = 0;

    for (const input of inputs) {
      if (selectedInputs.length >= maxSize) break;

      const payload: BitcoinRequest = JSON.parse(input.input);
      
      recipients.push({
        address: payload.toAddress,
        value: payload.amountSats,
      });
      
      totalAmountSats += payload.amountSats;
      selectedInputs.push(input);
    }

    return {
      selectedInputs,
      data: { recipients, totalAmountSats },
    };
  }

  // ----------------------------------------------------------------
  // 3. Fee Estimation
  // ----------------------------------------------------------------

  async estimateBatchFee(data: BitcoinBatchPayload): Promise<bigint> {
    // Estimate VBytes:
    // Overhead (10) + Input (148 * 1 assumption) + Outputs (34 * N)
    // We assume 1 UTXO input is enough (optimistic), actual submit might use more
    const estVBytes = 10 + 148 + (data.recipients.length + 1) * 34; // +1 for change

    // Get fee rate from node (conservative estimate, 6 blocks)
    const feeRateResult = await this.rpcCall("estimatesmartfee", [6]);
    
    // Fallback fee rate (0.00001 BTC/kB = 1 sat/vbyte) if regtest has no history
    const feeRateBtcPerKvB = feeRateResult.feerate || 0.00001;
    const feeRateSatsPerByte = (feeRateBtcPerKvB * 100_000_000) / 1000;

    // Round up
    const feeSats = Math.ceil(estVBytes * feeRateSatsPerByte);
    return BigInt(feeSats);
  }

  // ----------------------------------------------------------------
  // 4. Submission
  // ----------------------------------------------------------------

  async submitBatch(data: BitcoinBatchPayload, fee: string | bigint): Promise<BlockchainHash> {
    const feeSats = Number(fee);
    const totalRequired = data.totalAmountSats + feeSats;

    // 1. Select UTXOs (Coin Selection)
    const unspent = await this.rpcCall("listunspent", [
      1, 9999999, [this.batcherAddress]
    ]);

    let inputSum = 0;
    const selectedUtxos: any[] = [];
    
    // Simple Accumulation Strategy
    for (const utxo of unspent) {
      const amountSats = Math.round(utxo.amount * 100_000_000);
      selectedUtxos.push(utxo);
      inputSum += amountSats;
      if (inputSum >= totalRequired) break;
    }

    if (inputSum < totalRequired) {
      throw new Error(`Insufficient Batcher funds. Need ${totalRequired}, have ${inputSum}`);
    }

    // 2. Build Transaction
    const psbt = new bitcoin.Psbt({ network: this.network });

    // Add Inputs
    for (const utxo of selectedUtxos) {
      // Fetch raw hex for input signing (required for non-segwit or mixed)
      // Since we use p2wpkh (Segwit), passing the value is critical
      const amountSats = Math.round(utxo.amount * 100_000_000);
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        witnessUtxo: {
          script: bitcoin.payments.p2wpkh({ 
            pubkey: this.keyPair.publicKey, 
            network: this.network 
          }).output!,
          value: amountSats,
        },
      });
    }

    // Add Recipient Outputs
    for (const recipient of data.recipients) {
      psbt.addOutput({
        address: recipient.address,
        value: recipient.value,
      });
    }

    // Add Change Output
    const change = inputSum - totalRequired;
    // Dust protection for change
    if (change > 546) {
      psbt.addOutput({
        address: this.batcherAddress,
        value: change,
      });
    } else {
      // If change is dust, add it to fee (miners take it)
      console.log(`Dust change (${change} sats) added to fee`);
    }

    // 3. Sign
    psbt.signAllInputs(this.keyPair);
    psbt.finalizeAllInputs();

    // 4. Broadcast
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txId = await this.rpcCall("sendrawtransaction", [txHex]);

    console.log(`🚀 Submitted Bitcoin Batch: ${txId}`);
    return txId;
  }

  // ----------------------------------------------------------------
  // 5. Confirmation
  // ----------------------------------------------------------------

  async waitForTransactionReceipt(
    hash: BlockchainHash,
    timeout: number = 60000
  ): Promise<BlockchainTransactionReceipt> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        // Get TX status
        // verbose=true to see confirmations
        const tx = await this.rpcCall("getrawtransaction", [hash, true]);
        
        if (tx && tx.confirmations && tx.confirmations > 0) {
          return {
            hash: hash,
            blockNumber: BigInt(0), // RPC might not give easy block height in this call
            status: 1,
            confirmations: tx.confirmations
          };
        }
      } catch (e) {
        // TX might not be in mempool/block yet
      }

      // Wait 2 seconds
      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error("Transaction confirmation timed out");
  }

  // ----------------------------------------------------------------
  // Utils
  // ----------------------------------------------------------------

  private async rpcCall(method: string, params: any[]): Promise<any> {
    const response = await fetch(this.rpcUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${this.rpcAuth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "1.0",
        id: "batcher",
        method,
        params
      })
    });

    if (!response.ok) {
      throw new Error(`Bitcoin RPC HTTP Error: ${response.status}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`Bitcoin RPC Error: ${JSON.stringify(json.error)}`);
    }

    return json.result;
  }
}