import { assertSQL, type SharedState } from "@e2e/engine";
import type { Client } from "pg";
import { sendBitcoin } from "@e2e/batcher/calls";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const target = {
  address: "bcrt1qfv6m6l5s6cgda09yr5nd8rnufkaz59d3aquq03",
  privateKey: "cPNCP9RTgYu6aqw4cTFQgrrTKkz6oJPUnxuYeaDrWR5wAkDqwHjc",
  privateKeyWIF: "cPNCP9RTgYu6aqw4cTFQgrrTKkz6oJPUnxuYeaDrWR5wAkDqwHjc",
};

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

/**
* Waits for Bitcoin Core RPC to be ready by polling until a connection succeeds.
*/
export async function waitForBitcoinCoreRpc(maxWaitMs: number = 30000): Promise<void> {
  console.log('Waiting for Bitcoin Core RPC to be ready...');
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Try a simple RPC call to check if Bitcoin Core is ready
      await bitcoinRpcCall('getblockchaininfo', []);
      console.log('Bitcoin Core RPC is ready');
      return;
    } catch (error) {
      // Connection refused or other error - Bitcoin Core not ready yet
      await delay(500);
    }
  }
  
  throw new Error(`Bitcoin Core RPC did not become ready within ${maxWaitMs}ms`);
}

/**
* Test function to verify Bitcoin transactions are being tracked in the database.
*/
export async function bitcoinTest(db: Client, sharedState: SharedState) {
  // Wait a bit for transactions to be processed
  await delay(5000);
  
  await assertSQL<{
    id: number;
    block_height: number;
    direction: string;
    address: string;
    transaction_id: string;
    index: number;
    value_sats: string;
    utxo_txid: string;
    utxo_vout: number;
    label: string | null;
  }>(
    "Check Bitcoin transactions are inserted",
    db,
    `SELECT * FROM bitcoin_transactions ORDER BY block_height ASC, id ASC`,
    (res) => res.rows.length > 0,
    (res) => {
      // Verify we have at least some transactions
      if (res.rows.length === 0) {
        console.error('No Bitcoin transactions found in database');
        return false;
      }
      
      // Verify transaction structure
      const firstTx = res.rows[0];
      const hasRequiredFields = 
      firstTx.direction !== undefined &&
      firstTx.address !== undefined &&
      firstTx.transaction_id !== undefined &&
      firstTx.index !== undefined &&
      firstTx.value_sats !== undefined &&
      firstTx.utxo_txid !== undefined &&
      firstTx.utxo_vout !== undefined;
      
      if (!hasRequiredFields) {
        console.error('Transaction missing required fields:', firstTx);
        return false;
      }
      
      // Verify we have transactions for the target address
      const targetAddressTxs = res.rows.filter(
        (tx) => tx.address === target.address
      );
      
      if (targetAddressTxs.length === 0) {
        console.error('No transactions found for target address:', target.address);
        return false;
      }
      
      console.log(`Found ${res.rows.length} Bitcoin transactions in database`);
      console.log(`Found ${targetAddressTxs.length} transactions for target address`);
      
      return true;
    },
  );
}

export async function bitcoinBatcherTest(db: Client, sharedState: SharedState) {
  console.log("Running Bitcoin Batcher Test...");
  
  // We use the target's private key to sign a message authorizing sending 
  // funds from target.address (though in regtest via batcher, this is a mock 
  // 'authorization' - the batcher uses its own wallet, but checks the signature against the intent).
  
  const payload = {
    toAddress: "bcrt1qa94dntprzqdkk8aygc9takzsn8shn5fzu5vqh7", // Some random recipient
    amountSats: 10000
  };
  
  try {
    const result = await sendBitcoin(
      target.privateKeyWIF,
      payload,
      "wait-effectstream-processed"
    );
    
    console.log("Batcher result:", result);
    
    if (!result.success) {
      throw new Error(`Batcher submission failed: ${result.message}`);
    }
    
    if (result.inputsProcessed !== 1) {
      throw new Error(`Expected 1 input processed, got ${result.inputsProcessed}`);
    }
    sharedState.primitive_accounting_counter += 1;
    console.log("Bitcoin batcher submission successful!");
  } catch (e) {
    console.error("Bitcoin batcher test failed:", e);
    throw e;
  }
}

