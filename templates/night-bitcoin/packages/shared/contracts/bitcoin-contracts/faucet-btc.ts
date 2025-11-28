/**
 *  This script sends BTC to a specified address.
 *  Usage:
 *  deno run -A faucet-btc.ts bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03
 * 
 *  Arguments:
 *  - 1. Target address
 */

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

