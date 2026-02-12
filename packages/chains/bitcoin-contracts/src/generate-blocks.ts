import * as bitcoin from 'bitcoinjs-lib';
import * as ecpair from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ECPair = ecpair.ECPairFactory(ecc);
const SATS_PER_BTC = 100_000_000;

const argv = typeof process !== "undefined" ? process.argv.slice(2) : (typeof Deno !== "undefined" ? (Deno as any).args : []);
const DEFAULT_BLOCK_INTERVAL = argv.includes('--block-interval') ? parseInt(argv[argv.indexOf('--block-interval') + 1]) : 5000;
const NETWORK = bitcoin.networks.regtest;
console.log(`Using block interval: ${DEFAULT_BLOCK_INTERVAL}ms`);

const target = {
  address: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
  privateKey: "cPNCP9RTgYu6aqw4cTFQgrrTKkz6oJPUnxuYeaDrWR5wAkDqwHjc",
  publicKey: "03a7b23111f236dcd23f6ed0313d0ee1af18dc9cffffb9b09b3f8d8212515e5c11",
}

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
const onSignal = (sig: string, code: number) => () => {
  console.log(`\nReceived ${sig}, stopping block generation...`);
  running = false;
  (typeof process !== "undefined" ? process : (Deno as any)).exit(code);
};
if (typeof process !== "undefined") {
  process.on("SIGINT", onSignal("SIGINT", 130));
  process.on("SIGTERM", onSignal("SIGTERM", 143));
} else if (typeof Deno !== "undefined") {
  (Deno as any).addSignalListener("SIGINT", onSignal("SIGINT", 130));
  (Deno as any).addSignalListener("SIGTERM", onSignal("SIGTERM", 143));
}

async function main() {
  await delay(10000);
  console.log('Block generator starting...');
  console.log('Assumes Bitcoin Core is already running at http://127.0.0.1:18443');
  
  // Try to get or create a wallet and address
  let address: string;
  let walletName: string | undefined;
  
  try {
    // Try to list wallets first
    const wallets = await bitcoinRpcCall('listwallets', []);
    if (wallets && wallets.length > 0) {
      walletName = wallets[0];
      console.log(`Using existing wallet: ${walletName}`);
    } else {
      // Create a default wallet
      walletName = 'default';
      try {
        await bitcoinRpcCall('createwallet', [walletName]);
        console.log(`Created wallet: ${walletName}`);
      } catch (e) {
        // Wallet might already exist, try to use it
        walletName = undefined;
      }
    }
    
    // Get a new address from the wallet or default
    if (walletName) {
      address = await bitcoinRpcCall('getnewaddress', [], walletName);
    } else {
      address = await bitcoinRpcCall('getnewaddress', []);
    }
    console.log(`Using address: ${address}`);
  } catch (error) {
    console.error('Error setting up wallet/address:', error);
    console.log('Attempting to generate blocks without wallet...');
    // Try to get an address without wallet
    try {
      address = await bitcoinRpcCall('getnewaddress', []);
    } catch (e) {
      console.error('Failed to get address. Make sure Bitcoin Core is running and accessible.');
      (typeof process !== "undefined" ? process : (Deno as any)).exit(1);
    }
  }
  
  // Initialization: Generate funds and set up transactions
  console.log('\n=== Initialization Phase ===');
  
  // Step 1: Generate 101 blocks to default wallet address to get funds
  console.log('Step 1: Generating 101 blocks to default wallet address...');
  const defaultWalletAddress = walletName 
    ? await bitcoinRpcCall('getnewaddress', [], walletName)
    : address;
  
  const initialBlocks = await bitcoinRpcCall('generatetoaddress', [101, defaultWalletAddress], walletName);
  console.log(`Generated 101 blocks. Latest block: ${initialBlocks[initialBlocks.length - 1]}`);
  
  console.log('=== Initialization Complete ===\n');

  let blockCount = 102;
  
  console.log(`Starting block generation (every ${DEFAULT_BLOCK_INTERVAL}ms)...`);
  console.log('Press Ctrl+C to stop\n');
  
  while (running) {
    try {
      const blocks = await bitcoinRpcCall('generatetoaddress', [1, address], walletName);
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
  (typeof process !== "undefined" ? process : (Deno as any)).exit(1);
});

