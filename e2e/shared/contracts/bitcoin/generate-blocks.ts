import * as bitcoin from 'bitcoinjs-lib';
import * as ecpair from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { createHash } from "node:crypto";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ECPair = ecpair.ECPairFactory(ecc);
const SATS_PER_BTC = 100_000_000;

const DEFAULT_BLOCK_INTERVAL = Deno.args.includes('--block-interval') ? parseInt(Deno.args[Deno.args.indexOf('--block-interval') + 1]) : 5000;
const NETWORK = bitcoin.networks.regtest;
console.log(`Using block interval: ${DEFAULT_BLOCK_INTERVAL}ms`);

// Deterministic seed for the batcher wallet
const mySeedString = 'my-super-secret-regtest-demo-seed-e2e';
const privateKeyBuffer = createHash('sha256').update(mySeedString).digest();
const batcherKeyPair = ECPair.fromPrivateKey(privateKeyBuffer, { network: NETWORK });
const { address: batcherAddress } = bitcoin.payments.p2wpkh({
  pubkey: batcherKeyPair.publicKey,
  network: NETWORK,
});

const target = {
  address: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
  privateKey: "cPNCP9RTgYu6aqw4cTFQgrrTKkz6oJPUnxuYeaDrWR5wAkDqwHjc",
  publicKey: "03a7b23111f236dcd23f6ed0313d0ee1af18dc9cffffb9b09b3f8d8212515e5c11",
}

console.log(`Target Address: ${target.address}`);

// Generate a valid mock address for regtest
function generateMockAddress(): string {
  const mockKeyPair = ECPair.makeRandom({ network: NETWORK });
  const mockPayment = bitcoin.payments.p2wpkh({
    pubkey: mockKeyPair.publicKey,
    network: NETWORK,
  });
  return mockPayment.address!;
}

const MOCK_ADDRESS = generateMockAddress();
console.log(`Generated mock address: ${MOCK_ADDRESS}`);

// Helper function to make Bitcoin RPC calls
const bitcoinRpcCall = async (method: string, params: any[] = [], walletName?: string) => {
  const url = walletName 
    ? `http://127.0.0.1:18443/wallet/${walletName}`
    : 'http://127.0.0.1:18443';
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + btoa('dev:devpassword'),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: method,
      params: params,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RPC call failed: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }
  return data.result;
};

let running = true;

// Handle process signals
if (typeof Deno !== 'undefined') {
  Deno.addSignalListener('SIGINT', () => {
    console.log('\nReceived SIGINT, stopping block generation...');
    running = false;
    Deno.exit(130);
  });

  Deno.addSignalListener('SIGTERM', () => {
    console.log('\nReceived SIGTERM, stopping block generation...');
    running = false;
    Deno.exit(143);
  });
}

async function generateTXHex(address: string, amountSats: number, inputUTXO: { txid: string, vout: number }) {
  const keyPair = ECPair.fromWIF(target.privateKey, NETWORK);
  const payment = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network: NETWORK,
  });
  
  const oldTX = await bitcoinRpcCall('getrawtransaction', [inputUTXO.txid, 1]);
  const utxo = oldTX.vout[inputUTXO.vout];
  if (!utxo) {
    throw new Error(`UTXO not found: ${inputUTXO.txid}:${inputUTXO.vout}`);
  }
  const feeSats = 10_000;
  const utxoValueSats = Math.round(utxo.value * SATS_PER_BTC);
  if (utxoValueSats < amountSats + feeSats) {
    throw new Error(`UTXO value too low: ${utxoValueSats} < ${amountSats + feeSats}`);
  }
  const psbt = new bitcoin.Psbt({ network: NETWORK });
  psbt.addInput({
    hash: inputUTXO.txid,
    index: inputUTXO.vout,
    sequence: 0xFFFFFFFF,
    witnessUtxo: {
      value: utxoValueSats,
      script: payment.output!,
    },
  });
  psbt.addOutput({
    address: address,
    value: amountSats,
  });
  psbt.addOutput({
    address: payment.address!,
    value: utxoValueSats - amountSats - feeSats,
  });
  psbt.signInput(0, keyPair);
  psbt.finalizeAllInputs();
  const txHex = psbt.extractTransaction().toHex();
  return txHex;
}

async function main() {
  await delay(10000);
  console.log('Block generator starting...');
  console.log('Assumes Bitcoin Core is already running at http://127.0.0.1:18443');
  
  // Try to get or create a wallet and address
  let address: string;
  let walletName: string | undefined;

  // Create a mining wallet for generating blocks
  walletName = 'miner';
  try {
    await bitcoinRpcCall('createwallet', [walletName]);
    console.log(`Created mining wallet: ${walletName}`);
  } catch (e: any) {
    // Wallet might already exist, try to load it
    try {
      await bitcoinRpcCall('loadwallet', [walletName]);
      console.log(`Loaded existing mining wallet: ${walletName}`);
    } catch (loadError) {
      console.error('Failed to create or load mining wallet:', e);
      console.log('Attempting to generate blocks without wallet...');
      walletName = undefined;
    }
  }

  // Get a new address from the wallet or default
  try {
    if (walletName) {
      address = await bitcoinRpcCall('getnewaddress', [], walletName);
    } else {
      address = await bitcoinRpcCall('getnewaddress', []);
    }
    console.log(`Using mining wallet address: ${address}`);
  } catch (error) {
    console.error('Failed to get address. Make sure Bitcoin Core is running and accessible.');
    Deno.exit(1);
  }
  

  // Rescan the blockchain for the imported key if necessary (e.g., if we crashed and restarted)
  // But since we are in regtest and likely starting fresh or just need new blocks, mining new ones usually suffices.
  // However, if we see 0 balance after mining, it might be that we are on a chain where previous blocks belonged to this address
  // but the wallet doesn't know.
  
  // Let's force a rescan if we suspect issues, but rescan is slow.
  // Instead, let's check balance *before* mining too.

  // Rescan the blockchain for the imported key if necessary
  // If the balance is 0, it might be because the wallet didn't see the mined blocks as ours?
  // But we imported the descriptor/key BEFORE mining.
  // Let's try to be explicit with rescan if we had to fallback.
  
  // Initialization: Generate funds and set up transactions
  console.log('\n=== Initialization Phase ===');
  
  // Step 1: Generate 105 blocks to mining wallet to get funds
  console.log(`Step 1: Generating 105 blocks to mining wallet...`);

  const initialBlocks = await bitcoinRpcCall('generatetoaddress', [105, address!], walletName);
  console.log(`Generated 105 blocks. Latest block: ${initialBlocks[initialBlocks.length - 1]}`);

  // Check mining wallet balance
  await delay(1000);
  const miningBalance = await bitcoinRpcCall('getbalance', [], walletName);
  console.log(`Mining wallet balance: ${miningBalance} BTC`);

  // Step 2: Send 100 BTC from mining wallet to batcher address
  console.log(`Step 2: Sending 100 BTC from mining wallet to batcher address (${batcherAddress})...`);
  const fundBatcherTxId = await bitcoinRpcCall('sendtoaddress', [batcherAddress!, 100], walletName);
  console.log(`Funding transaction sent to ${batcherAddress}. TXID: ${fundBatcherTxId}`);

  // Step 3: Generate 1 block to confirm the funding transaction
  console.log('Step 3: Generating 1 block to confirm funding...');
  const confirmBlocks = await bitcoinRpcCall('generatetoaddress', [1, address!], walletName);
  console.log(`Confirmation block: ${confirmBlocks[0]}`);

  // Step 4: Send 10 BTC from mining wallet to target.address
  console.log(`Step 4: Sending 10 BTC from mining wallet to ${target.address}...`);

  const sendTxId = await bitcoinRpcCall('sendtoaddress', [target.address, 10], walletName);
  console.log(`Transaction sent. TXID: ${sendTxId}`);

  // Step 5: Generate 1 block to consolidate the transfer
  console.log('Step 5: Generating 1 block to consolidate transfer...');
  const consolidateBlocks = await bitcoinRpcCall('generatetoaddress', [1, address!], walletName);
  console.log(`Consolidation block: ${consolidateBlocks[0]}`);
  
  // Step 6: Find a UTXO from target.address and build transaction to MOCK_ADDRESS
  console.log(`Step 6: Building transaction to send 3 BTC to ${MOCK_ADDRESS}...`);

  // Get the transaction details from step 4 to find the UTXO
  console.log(`Fetching transaction details for ${sendTxId}...`);
  const txDetails = await bitcoinRpcCall('getrawtransaction', [sendTxId, true]);
  
  if (!txDetails || !txDetails.vout) {
    throw new Error(`Could not get transaction details for ${sendTxId}`);
  }
  
  // Find the output that goes to target.address
  let utxoVout = -1;
  let utxoValue = 0;
  console.log(`Transaction details: ${JSON.stringify(txDetails, null, 2)}`);
  for (let i = 0; i < txDetails.vout.length; i++) {
    const vout = txDetails.vout[i];
    // Check if this output goes to target.address
    if (vout.scriptPubKey && vout.scriptPubKey.address) {
      if (vout.scriptPubKey.address === target.address) {
        utxoVout = i;
        utxoValue = Math.round(vout.value * SATS_PER_BTC); // Convert BTC to satoshis
        break;
      }
    }
  }
  
  if (utxoVout === -1) {
    throw new Error(`Could not find output to ${target.address} in transaction ${sendTxId}`);
  }
  
  const requiredAmount = 3 * SATS_PER_BTC;
  const feeSats = 10_000;
  
  if (utxoValue < requiredAmount + feeSats) {
    throw new Error(`UTXO value too low: ${utxoValue} sats < ${requiredAmount + feeSats} sats`);
  }
  
  console.log(`Using UTXO: ${sendTxId}:${utxoVout} (${utxoValue} sats = ${utxoValue / SATS_PER_BTC} BTC)`);
  
  // Build the transaction
  const txHex = await generateTXHex(MOCK_ADDRESS, requiredAmount, {
    txid: sendTxId,
    vout: utxoVout,
  });
  console.log(`Transaction built: ${txHex.substring(0, 64)}...`);
  
  // Step 5: Broadcast the transaction
  console.log('Step 5: Broadcasting transaction...');
  const broadcastTxId = await bitcoinRpcCall('sendrawtransaction', [txHex]);
  console.log(`Transaction broadcasted. TXID: ${broadcastTxId}`);
  
  console.log('=== Initialization Complete ===\n');

  let blockCount = 102;
  
  console.log(`Starting block generation (every ${DEFAULT_BLOCK_INTERVAL}ms)...`);
  console.log('Press Ctrl+C to stop\n');
  
  while (running) {
    try {
      const blocks = await bitcoinRpcCall('generatetoaddress', [1, address!], walletName);
      blockCount++;
      const blockHash = blocks && blocks.length > 0 ? blocks[0] : 'unknown';
      console.log(`[${new Date().toISOString()}] Generated block #${blockCount}: ${blockHash}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error generating block:`, error);
    }

    await delay(DEFAULT_BLOCK_INTERVAL);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  Deno.exit(1);
});

