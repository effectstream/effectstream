import * as bitcoin from "bitcoinjs-lib";
import * as ecpair from "ecpair";
import * as tinysecp from "tiny-secp256k1";
import * as secp from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import { hmac } from "@noble/hashes/hmac.js";
import { createHash } from "node:crypto";

// bitcoinjs-message pulls in the native `secp256k1` addon which segfaults on
// dlopen under bun (missing node::Buffer::HasInstance — see bun#4290). We
// reimplement sign/verify with pure-JS @noble/secp256k1. This must stay
// wire-compatible with bitcoinjs-message so Node-side clients keep working.
secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

function bitcoinMagicHash(message: string): Uint8Array {
  const prefix = Buffer.from("\x18Bitcoin Signed Message:\n", "utf8");
  const msg = Buffer.from(message, "utf8");
  const len = msg.length;
  let varint: Buffer;
  if (len < 0xfd) varint = Buffer.from([len]);
  else if (len <= 0xffff) { varint = Buffer.alloc(3); varint[0] = 0xfd; varint.writeUInt16LE(len, 1); }
  else { varint = Buffer.alloc(5); varint[0] = 0xfe; varint.writeUInt32LE(len, 1); }
  const buf = Buffer.concat([prefix, varint, msg]);
  return sha256(sha256(buf));
}

function hash160(buf: Uint8Array): Buffer {
  return createHash("ripemd160").update(createHash("sha256").update(buf).digest()).digest();
}

function segwitRedeemHash(publicKeyHash: Uint8Array): Buffer {
  return hash160(Buffer.concat([Buffer.from([0x00, 0x14]), publicKeyHash]));
}

// Reimplementation of bitcoinjs-message.verify(msg, addr, sig, undefined, true).
function verifyBitcoinMessage(message: string, address: string, signature: string | Buffer): boolean {
  const sig = typeof signature === "string" ? Buffer.from(signature, "base64") : signature;
  if (sig.length !== 65) return false;

  const flagByte = sig[0]! - 27;
  if (flagByte < 0 || flagByte > 15) return false;
  const compressed = !!(flagByte & 12);
  // checkSegwitAlways requires a compressed flag — matches bitcoinjs-message behavior.
  if (!compressed) return false;
  const segwitType: "p2sh-p2wpkh" | "p2wpkh" | null =
    !(flagByte & 8) ? null : !(flagByte & 4) ? "p2sh-p2wpkh" : "p2wpkh";
  const recovery = flagByte & 3;
  const rs = sig.subarray(1);

  const hash = bitcoinMagicHash(message);
  const recoveredSig = Buffer.concat([Buffer.from([recovery]), rs]);
  let pubkey: Uint8Array;
  try {
    pubkey = secp.recoverPublicKey(recoveredSig, hash, { prehash: false });
  } catch {
    return false;
  }
  const pubkeyHash = hash160(pubkey);

  const tryBech32 = () => {
    try { return Buffer.from(bitcoin.address.fromBech32(address).data); } catch { return null; }
  };
  const tryBase58 = () => {
    try { return bitcoin.address.fromBase58Check(address).hash; } catch { return null; }
  };

  if (segwitType === "p2wpkh") {
    const expected = tryBech32();
    return !!expected && pubkeyHash.equals(expected);
  }
  if (segwitType === "p2sh-p2wpkh") {
    const expected = tryBase58();
    return !!expected && segwitRedeemHash(pubkeyHash).equals(expected);
  }
  // No segwit flag — checkSegwitAlways=true path: accept bech32 P2WPKH, or
  // base58 P2PKH / P2SH-P2WPKH.
  const bech = tryBech32();
  if (bech) return pubkeyHash.equals(bech);
  const b58 = tryBase58();
  if (!b58) return false;
  return pubkeyHash.equals(b58) || segwitRedeemHash(pubkeyHash).equals(b58);
}
import type {
  BlockchainAdapter,
  BlockchainHash,
  BlockchainTransactionReceipt,
  ValidationResult,
  BatchBuildingOptions,
  BatchBuildingResult,
} from "./adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";
import { AdapterLogger } from "./adapter-logger.ts";

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
  syncProtocolName?: string;
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
  private addressChecked = false;
  private readonly syncProtocolName: string;
  private readonly log = new AdapterLogger("bitcoin");

  constructor(config: BitcoinAdapterConfig) {
    this.rpcUrl = config.rpcUrl;
    this.rpcAuth = btoa(`${config.rpcUser}:${config.rpcPass}`);
    this.network = config.network ?? bitcoin.networks.regtest;
    this.syncProtocolName = config.syncProtocolName ?? "parallelBitcoin";
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
    this.log.log(" Batcher address:", address);
    this.batcherAddress = address!;
  }
  getSyncProtocolName(): string {
    return this.syncProtocolName;
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

      // 3. Verify signature (pure-JS; wire-compatible with bitcoinjs-message
      //    invoked as verify(msg, addr, sig, undefined, /* checkSegwitAlways */ true)).
      return verifyBitcoinMessage(message, input.address, input.signature!);
    } catch (e) {
      this.log.error(`Sig verification failed: ${e}`);
      return false;
    }
  }

  async recoverState(pendingInputs: DefaultBatcherInput[]): Promise<void> {
    this.log.log(`Recovered state - ${pendingInputs.length} pending inputs carried over`);
  }

  // Only pure, local checks run on the parallel HTTP accept path. Any RPC work
  // (balance, fee, UTXO scan) must live on the serial batch-processing path in
  // submitBatch — Bitcoin Core's scantxoutset is a node-wide singleton and
  // concurrent calls fail with error -8. Funds sufficiency is re-checked in
  // submitBatch, which runs one batch at a time per target.
  async validateInput(input: DefaultBatcherInput): Promise<ValidationResult> {
    let payload: BitcoinRequest;
    try {
      payload = JSON.parse(input.input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { valid: false, error: `Malformed JSON input: ${msg}` };
    }

    if (typeof payload.amountSats !== "number" || !Number.isFinite(payload.amountSats)) {
      return { valid: false, error: "amountSats must be a finite number" };
    }
    if (payload.amountSats < 546) {
      return { valid: false, error: "Amount below dust limit (546 sats)" };
    }

    try {
      bitcoin.address.toOutputScript(payload.toAddress, this.network);
    } catch {
      return { valid: false, error: "Invalid address for configured network" };
    }

    return { valid: true };
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
      this.log.log(`Dust change (${change} sats) added to fee`);
    }

    // 3. Sign
    psbt.signAllInputs(this.keyPair);
    psbt.finalizeAllInputs();

    // 4. Broadcast
    const tx = psbt.extractTransaction();
    const txHex = tx.toHex();
    const txId = await this.rpcCall("sendrawtransaction", [txHex]);
    this.log.log(`Submitted Bitcoin Batch: ${txId} - liberated funds: ${liberatedSatFunds} sats`);
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
        this.log.log(`Address ${this.batcherAddress} not tracked. Importing...`);
        
        try {
          // Try legacy importaddress first
          await this.rpcCall("importaddress", [this.batcherAddress, "batcher", true]);
        } catch (e: any) {
          const errorString = e.toString();
          this.log.warn(`importaddress failed (${errorString}). Attempting importdescriptors fallback...`);

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
        this.log.log(" Address imported and rescanned.");
      }
      this.addressChecked = true;
    } catch (e) {
      this.log.error(" Error ensuring address is watched:", e);
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
      this.log.warn(" listunspent returned no UTXOs for batcher address, attempting scantxoutset fallback.");
    } catch (error) {
      this.log.warn(" listunspent failed, attempting scantxoutset fallback.", error);
    }

    const scanResult = await this.rpcCall("scantxoutset", ["start", [`addr(${this.batcherAddress})`]]);
    const unspents = scanResult?.unspents;
    if (!scanResult?.success || !Array.isArray(unspents) || unspents.length === 0) {
      this.log.warn(" scantxoutset did not return any spendable outputs for the batcher address.");
      return [];
    }

    this.log.log(`scantxoutset found ${unspents.length} outputs totaling ${scanResult.total_amount ?? 0} BTC for the batcher.`);

    return unspents.map((entry: any) => ({
      txid: entry.txid,
      vout: entry.vout,
      amount: entry.amount,
    }));
  }

  private async getBatcherBalance(): Promise<number> {
    await this.ensureAddressWatched();
    const utxos = await this.fetchBatcherUtxos(1);
    return Math.round(utxos.reduce((sum, utxo) => sum + (utxo.amount * 100_000_000), 0));
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
      this.log.warn(" Fee estimation failed, using conservative default", error);
      // Conservative default: 1000 sats for regtest
      return BigInt(1000);
    }
  }

  // TODO: wallet scoping. All RPCs target the root URL instead of
  // `${rpcUrl}/wallet/<name>`, so `listunspent` and `importdescriptors` land on
  // whichever wallet Bitcoin Core auto-routes to — not one this adapter owns.
  // Consequence: `listunspent` returns empty for the batcher address and
  // `fetchBatcherUtxos` falls back to `scantxoutset` on every submitBatch call,
  // which is an expensive node-wide scan. Fix: create/load a dedicated
  // descriptor wallet on startup, import the batcher descriptor once, and
  // route every RPC through `/wallet/<batcher>`. That removes `scantxoutset`
  // from the hot path entirely.
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