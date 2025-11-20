import * as bitcoin from "bitcoinjs-lib";
import * as bitcoinMessage from "bitcoinjs-message";
import * as ecpair from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import { createHash } from "node:crypto";
import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const ECPair = ecpair.ECPairFactory(tinysecp);

// Interface for the input payload signed by the user
interface BitcoinRequest {
  toAddress: string;
  amountSats: number;
}

/*
The shape of data passed from Builder to Submitter
*/
export interface BitcoinBatchPayload {
  recipients: { address: string; value: number }[];
  totalAmountSats: number;
}

export interface BitcoinAdapterConfig {
  rpcUrl: string;
  rpcUser: string;
  rpcPass: string;
  batcherWif?: string; // Wallet Import Format private key (optional if seed provided)
  seed?: string; // Seed string to generate private key
  network?: bitcoin.Network; // Defaults to regtest
  maxBatchSize?: number;
}

export function buildBitcoinSignatureMessage(payload: BitcoinRequest, timestamp: string) {
  return `send ${payload.amountSats} sats to ${payload.toAddress} at ${timestamp}`
}

export class BitcoinAdapter implements BlockchainAdapter<BitcoinBatchPayload> {
  private readonly rpcUrl: string;
  private readonly rpcAuth: string; // "user:password"
  private readonly keyPair: any;
  private readonly network: bitcoin.Network;
  public readonly maxBatchSize: number;
  private readonly batcherAddress: string;
  private reservedSatFunds: number = 0;
  private addressChecked = false;

  constructor(config: BitcoinAdapterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.rpcAuth = btoa(`${config.rpcUser}:${config.rpcPass}`);
    this.network = config.network ?? bitcoin.networks.regtest;

    if (config.seed) {
      const privateKeyBuffer = createHash("sha256")
        .update(config.seed)
        .digest();
      this.keyPair = ECPair.fromPrivateKey(privateKeyBuffer, {
        network: this.network,
      });
    } else if (config.batcherWif) {
      this.keyPair = ECPair.fromWIF(config.batcherWif, this.network);
    } else {
      throw new Error("BitcoinAdapter: Must provide either seed or batcherWif");
    }

    this.maxBatchSize = config.maxBatchSize ?? 50;

    const { address } = bitcoin.payments.p2wpkh({ 
      pubkey: this.keyPair.publicKey, 
      network: this.network 
    });
    console.log("BitcoinAdapter: Batcher address:", address);
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

  async verifySignature(input: DefaultBatcherInput): Promise<boolean> {
    try {
      // 1. Parse the intent
      const payload: BitcoinRequest = JSON.parse(input.input);
      
      // 2. Reconstruct the message the user should have signed
      // Format: "I authorize sending <amt> to <addr> at <timestamp>"
      // This format must match exactly what your frontend generates
      const message = buildBitcoinSignatureMessage(payload, input.timestamp);

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

      // Check if batcher has sufficient funds
      const balance = await this.getBatcherBalance();
      const availableFunds = balance - this.reservedSatFunds;
      const estimatedFee = await this.estimateSingleTransactionFee(payload.amountSats);

      if (availableFunds < payload.amountSats + Number(estimatedFee)) {
        return {
          valid: false,
          error: `Insufficient batcher funds.
          Available funds: ${availableFunds} sats:
          - wallet balance: ${balance} sats,
          - reserved funds: ${this.reservedSatFunds} sats,
          Required funds: ${payload.amountSats + Number(estimatedFee)} sats`
        };
      }
      // Reserve funds for the transaction
      this.reservedSatFunds += payload.amountSats;
      return { valid: true };
    } catch (e) {
      return { valid: false, error: "Malformed JSON input" };
    }
  }

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

  async submitBatch(data: BitcoinBatchPayload, fee: string | bigint): Promise<BlockchainHash> {
    await this.ensureAddressWatched();

    const feeSats = Number(fee);
    const totalRequired = data.totalAmountSats + feeSats;

    // 1. Select UTXOs (Coin Selection)
    const unspent = await this.fetchBatcherUtxos(1);

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
      throw new Error(`Insufficient Batcher funds. Need ${totalRequired}, have ${inputSum} in address ${this.batcherAddress}`);
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
    let liberatedSatFunds = 0;
    // Add Recipient Outputs
    for (const recipient of data.recipients) {
      psbt.addOutput({
        address: recipient.address,
        value: recipient.value,
      });
      liberatedSatFunds += recipient.value;
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
    this.reservedSatFunds -= liberatedSatFunds;
    console.log(`🚀 Submitted Bitcoin Batch: ${txId}
    - liberated funds: ${liberatedSatFunds} sats
    - reserved funds: ${this.reservedSatFunds} sats`);
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

      await new Promise(r => setTimeout(r, 2000));
    }

    throw new Error("Transaction confirmation timed out");
  }

  // ----------------------------------------------------------------
  // Utils
  // ----------------------------------------------------------------

  private async ensureAddressWatched(): Promise<void> {
    if (this.addressChecked) return;

    try {
      const info = await this.rpcCall("getaddressinfo", [this.batcherAddress]);
      
      // If address is not mine and not watchonly, we need to import it
      if (!info.ismine && !info.iswatchonly) {
        console.log(`BitcoinAdapter: Address ${this.batcherAddress} not tracked. Importing...`);
        
        try {
          // Try legacy importaddress first
          await this.rpcCall("importaddress", [this.batcherAddress, "batcher", true]);
        } catch (e: any) {
          const errorString = e.toString();
          console.warn(`BitcoinAdapter: importaddress failed (${errorString}). Attempting importdescriptors fallback...`);

          // Fallback for descriptor wallets (default in newer Bitcoin Core)
          // 1. Get public key hex
          const pubKeyHex = this.keyPair.publicKey.toString("hex");
          
          // 2. Construct descriptor (wpkh for P2WPKH)
          const descBase = `wpkh(${pubKeyHex})`;
          
          // 3. Get descriptor with checksum
          const descInfo = await this.rpcCall("getdescriptorinfo", [descBase]);
          const descriptor = descInfo.descriptor;
          
          // 4. Import descriptor (timestamp: 0 to rescan from genesis)
          await this.rpcCall("importdescriptors", [[{
            desc: descriptor,
            timestamp: 0,
            active: true,
            label: "batcher"
          }]]);
        }
        console.log("BitcoinAdapter: Address imported and rescanned.");
      }
      this.addressChecked = true;
    } catch (e) {
      console.error("BitcoinAdapter: Error ensuring address is watched:", e);
      // Don't set addressChecked to true if it failed, so we retry next time
      // But we shouldn't block everything forever if it's a different issue
    }
  }

  private async fetchBatcherUtxos(minConf = 1): Promise<Array<{ txid: string; vout: number; amount: number }>> {
    try {
      const utxos = await this.rpcCall("listunspent", [minConf, 9999999, [this.batcherAddress]]);
      if (utxos.length > 0) {
        return utxos;
      }
      console.warn("BitcoinAdapter: listunspent returned no UTXOs for batcher address, attempting scantxoutset fallback.");
    } catch (error) {
      console.warn("BitcoinAdapter: listunspent failed, attempting scantxoutset fallback.", error);
    }

    const scanResult = await this.rpcCall("scantxoutset", ["start", [`addr(${this.batcherAddress})`]]);
    const unspents = scanResult?.unspents;
    if (!scanResult?.success || !Array.isArray(unspents) || unspents.length === 0) {
      console.warn("BitcoinAdapter: scantxoutset did not return any spendable outputs for the batcher address.");
      return [];
    }

    console.log(`BitcoinAdapter: scantxoutset found ${unspents.length} outputs totaling ${scanResult.total_amount ?? 0} BTC for the batcher.`);

    return unspents.map((entry: any) => ({
      txid: entry.txid,
      vout: entry.vout,
      amount: entry.amount,
    }));
  }

  private async getBatcherBalance(): Promise<number> {
    try {
      await this.ensureAddressWatched();
      const utxos = await this.rpcCall("listunspent", [1, 9999999, [this.batcherAddress]]);
      if (utxos.length > 0) {
        return Math.round(utxos.reduce((sum: number, utxo: any) => sum + (utxo.amount * 100_000_000), 0));
      }
    } catch (error) {
      console.warn("BitcoinAdapter: listunspent failed for balance check, trying getbalance", error);
    }

    try {
      const balance = await this.rpcCall("getbalance", ["*", 1, false, this.batcherAddress]);
      return Math.round(balance * 100_000_000);
    } catch (error) {
      console.warn("BitcoinAdapter: getbalance fallback failed", error);
      return 0;
    }
  }

  private async estimateSingleTransactionFee(amountSats: number): Promise<bigint> {
    // Estimate fee for a single-output transaction
    // Conservative estimate: overhead (10) + 1 input (148) + 2 outputs (34*2) = ~256 vbytes
    const estVBytes = 10 + 148 + (2 * 34); // 1 recipient + 1 change output

    try {
      const feeRateResult = await this.rpcCall("estimatesmartfee", [6]);

      // Fallback fee rate (0.00001 BTC/kB = 1 sat/vbyte) if regtest has no history
      const feeRateBtcPerKvB = feeRateResult.feerate || 0.00001;
      const feeRateSatsPerByte = (feeRateBtcPerKvB * 100_000_000) / 1000;

      // Round up and add some buffer for safety
      const feeSats = Math.ceil(estVBytes * feeRateSatsPerByte * 1.2); // 20% buffer
      return BigInt(Math.max(feeSats, 1000)); // Minimum 1000 sats fee
    } catch (error) {
      console.warn("BitcoinAdapter: Fee estimation failed, using conservative default", error);
      // Conservative default: 1000 sats for regtest
      return BigInt(1000);
    }
  }

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
      const text = await response.text();
      throw new Error(`Bitcoin RPC HTTP Error: ${response.status} ${response.statusText} - ${text}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(`Bitcoin RPC Error: ${JSON.stringify(json.error)}`);
    }

    return json.result;
  }
}