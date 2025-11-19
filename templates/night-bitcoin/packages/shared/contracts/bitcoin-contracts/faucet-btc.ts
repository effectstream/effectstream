import * as bitcoin from 'npm:bitcoinjs-lib';
import * as ecpair from 'npm:ecpair';
import * as ecc from 'npm:tiny-secp256k1';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ECPair = ecpair.ECPairFactory(ecc);
const SATS_PER_BTC = 100_000_000;

const DEFAULT_BLOCK_INTERVAL = Deno.args.includes('--block-interval') ? parseInt(Deno.args[Deno.args.indexOf('--block-interval') + 1]) : 5000;
const NETWORK = bitcoin.networks.regtest;
console.log(`Using block interval: ${DEFAULT_BLOCK_INTERVAL}ms`);



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

export async function faucetBtc(target: { address: string }, amount: number = 10): Promise<void> {
  
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
      Deno.exit(1);
    }
  }
  
  console.log(`Sending ${amount} BTC from default wallet to ${target.address}...`);
  const sendTxId = await bitcoinRpcCall('sendtoaddress', [target.address, amount], walletName);
  console.log(`Transaction sent. TXID: ${sendTxId}`);
}

if (import.meta.main) {
  const address = Deno.env.get('BTC_ADDRESS');
  if (!address) {
    console.error('BTC_ADDRESS is not set');
    Deno.exit(1);
  }

  const target = {
    address: address,
  }

  faucetBtc(target, 10).catch((error) => {
    console.error('Fatal error:', error);
    Deno.exit(1);
  });
}

