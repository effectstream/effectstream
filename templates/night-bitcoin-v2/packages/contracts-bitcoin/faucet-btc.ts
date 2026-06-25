/**
 *  This script sends BTC to a specified address.
 *  Usage:
 *  BTC_ADDRESS=bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03 bun run faucet-btc.ts
 *
 *  Environment variables:
 *  - BTC_ADDRESS: Target address
 */

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

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, stopping...');
  running = false;
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, stopping...');
  running = false;
  process.exit(143);
});

export async function faucetBtc(target: { address: string }, amount: number = 10): Promise<void> {
  let address: string;
  let walletName: string | undefined;

  try {
    const wallets = await bitcoinRpcCall('listwallets', []);
    if (wallets && wallets.length > 0) {
      walletName = wallets[0];
      console.log(`Using existing wallet: ${walletName}`);
    } else {
      walletName = 'default';
      try {
        await bitcoinRpcCall('createwallet', [walletName]);
        console.log(`Created wallet: ${walletName}`);
      } catch (e) {
        walletName = undefined;
      }
    }

    if (walletName) {
      address = await bitcoinRpcCall('getnewaddress', [], walletName);
    } else {
      address = await bitcoinRpcCall('getnewaddress', []);
    }
    console.log(`Using address: ${address}`);
  } catch (error) {
    console.error('Error setting up wallet/address:', error);
    console.log('Attempting to generate blocks without wallet...');
    try {
      address = await bitcoinRpcCall('getnewaddress', []);
    } catch (e) {
      console.error('Failed to get address. Make sure Bitcoin Core is running and accessible.');
      process.exit(1);
    }
  }

  console.log(`Sending ${amount} BTC from default wallet to ${target.address}...`);
  const sendTxId = await bitcoinRpcCall('sendtoaddress', [target.address, amount], walletName);
  console.log(`Transaction sent. TXID: ${sendTxId}`);
}

if (import.meta.main) {
  const address = process.env.BTC_ADDRESS;
  if (!address) {
    console.error('BTC_ADDRESS is not set');
    process.exit(1);
  }

  const target = {
    address: address,
  };

  faucetBtc(target, 10).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
