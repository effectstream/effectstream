import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http, type Address } from "viem";
import { hardhat } from "viem/chains";
import { createMessageForBatcher } from "@paimaexample/concise";
import { World } from "@paimaexample/coroutine";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";

// Batcher configuration
const BATCHER_PORT = Deno.env.get("BATCHER_PORT") || "3334";
const BATCHER_ENDPOINT = `http://localhost:${BATCHER_PORT}/send-input`;
const WALLET_PRIVATE_KEY = (Deno.env.get("WALLET_PRIVATE_KEY") || 
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`; // Hardhat default account #0

const AddressType = {
  EVM: 0,
  MIDNIGHT: 5,
};

function convertMidnightAddress(address: string): { coinPublicKey: string, encryptionPublicKey: string } {
  const midnightAddress = MidnightBech32m.parse(address);
  const [coinPublicKey, encryptionPublicKey] = [
    Uint8Array.prototype.slice.call(midnightAddress.data, 0, 32),
    Uint8Array.prototype.slice.call(midnightAddress.data, 32),
  ];
  return {
    coinPublicKey: `${coinPublicKey.toHex()}`,
    encryptionPublicKey: `${encryptionPublicKey.toHex()}`,
  };
}

// Create viem account and wallet client
const account = privateKeyToAccount(WALLET_PRIVATE_KEY);
const walletClient = createWalletClient({
  account,
  chain: hardhat,
  transport: http(),
});

// Helper: Convert string to hex
function stringToHex(str: string): string {
  return Array.from(new TextEncoder().encode(str))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Helper: Create the input payload for the ERC1155 mint function
function createMintPayload(targetAddress: string, amount: bigint): string {
  const payload = {
    function: "mint",
    args: [targetAddress, amount.toString()]
  };
  
  const jsonString = JSON.stringify(payload);
  const hexEncoded = "0x" + stringToHex(jsonString);
  
  return hexEncoded;
}

// Helper: Create signed input for the batcher
async function createSignedInput(
  input: string,
  batcherTarget: string,
  timestamp: string
): Promise<{
  addressType: number;
  address: Address;
  signature: string;
  timestamp: string;
  input: string;
  target: string;
}> {
  const userAddress = account.address;
  const addressType = AddressType.EVM;

  // Create message using the same logic as the batcher expects
  const message = createMessageForBatcher(
    null, // namespace
    timestamp,
    userAddress,
    addressType,
    input,
    batcherTarget,
  );

  const signature = await walletClient.signMessage({
    message,
  });

  return {
    addressType,
    address: userAddress,
    signature,
    input,
    timestamp,
    target: batcherTarget,
  };
}

/**
 * Coroutine operation: Mint tokens via batcher
 * 
 * This function creates a signed batcher input to mint ERC1155 tokens
 * and sends it to the batcher endpoint. It uses viem for signing and
 * Paima's World.promise for async operations within the coroutine system.
 * 
 * @param target - The EVM address to mint tokens to
 * @param value - The amount of tokens to mint
 * @returns The batcher response
 */
export function* mintInEvm(target: string, value: bigint) {
  console.log("🎯 Minting ERC1155 tokens via batcher...");
  console.log(`   Target address: ${target}`);
  console.log(`   Amount: ${value}`);
  console.log(`   Wallet address: ${account.address}`);
  
  // Create the mint payload
  const input = createMintPayload(target, value);
  console.log(`   Payload: ${input}`);
  
  // Create batcher input
  const timestamp = Date.now().toString();
  const batcherTarget = "evm"; // Use the ERC1155 adapter
  
  const batcherInput = yield* World.promise(
    createSignedInput(input, batcherTarget, timestamp)
  );
  
  console.log("\n📤 Sending to batcher...");
  console.log(`   Endpoint: ${BATCHER_ENDPOINT}`);
  
  try {
    const response: Response = yield* World.promise(
      fetch(BATCHER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: batcherInput,
          confirmationLevel: "no-wait",
        }),
      })
    );
    
    if (!response.ok) {
      const errorText: string = yield* World.promise(response.text());
      throw new Error(`Batcher request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }
    
    const result = yield* World.promise(response.json());
    console.log("\n✅ Success!");
    console.log("   Response:", JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error("\n❌ Error calling batcher:", error);
    throw error;
  }
}

// Helper: Create Midnight account structure
function createMidnightAccount(accountHex: string): {
  is_left: boolean;
  left: { bytes: string };
  right: { bytes: string };
} {
  const zeroBytes32 = "0x" + "00".repeat(32);
  
  return {
    is_left: true,
    left: {
      bytes: accountHex.startsWith('0x') ? accountHex : `0x${accountHex}`,
    },
    right: {
      bytes: zeroBytes32,
    },
  };
}

// Helper: Create the input payload for Midnight mint circuit
function createMidnightMintPayload(accountHex: string, amount: bigint): string {
  let parsedAccount = accountHex.startsWith("mn_") ? convertMidnightAddress(accountHex).coinPublicKey : accountHex;
  if (!parsedAccount.startsWith('0x')) parsedAccount = `0x${parsedAccount}`;
  if (parsedAccount.length !== 64 + 2) {
    throw new Error(`Invalid account hex: ${parsedAccount}. Must be a bech32m address or a hex value of 64 bytes.`);
  }
  const account = createMidnightAccount(parsedAccount);
  
  const payload = {
    circuit: "mint",
    args: [account, Number(amount)],
  };
  
  return JSON.stringify(payload);
}

/**
 * Coroutine operation: Mint tokens in Midnight via batcher
 * 
 * This function creates a batcher input to mint tokens in the Midnight network
 * and sends it to the batcher endpoint. The Midnight adapter handles the
 * circuit execution.
 * 
 * @param accountHex - The Midnight account hex string (32 bytes)
 * @param value - The amount of tokens to mint
 * @returns The batcher response
 */
export function* mintInMidnight(accountHex: string, value: bigint) {
  console.log("🌙 Minting tokens in Midnight via batcher...");
  console.log(`   Account: ${accountHex}`);
  console.log(`   Amount: ${value}`);
  
  // Create the mint payload for Midnight
  const input = createMidnightMintPayload(accountHex, value);
  // Create batcher input for Midnight
  const timestamp = Date.now().toString();
  const placeholderAddress = "a".repeat(64); // Midnight uses placeholder address
  
  const batcherInput = {
    address: placeholderAddress,
    addressType: AddressType.MIDNIGHT,
    signature: "", // Midnight doesn't require signature for minting
    timestamp,
    input,
    target: "midnight",
  };
  
  console.log("\n📤 Sending to batcher...");
  console.log(`   Endpoint: ${BATCHER_ENDPOINT}`);
  
  try {
    const response: Response = yield* World.promise(
      fetch(BATCHER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: batcherInput,
          confirmationLevel: "no-wait",
        }),
      })
    );
    
    if (!response.ok) {
      const errorText: string = yield* World.promise(response.text());
      throw new Error(`Batcher request failed: ${response.status} ${response.statusText}\n${errorText}`);
    }
    
    const result = yield* World.promise(response.json());
    console.log("\n✅ Success!");
    console.log("   Response:", JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error("\n❌ Error calling batcher:", error);
    throw error;
  }
}

