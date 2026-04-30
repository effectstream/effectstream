import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { getContractAddress } from "../infra/midnight-utils.ts";

const API_PORT = parseInt(process.env["EFFECTSTREAM_API_PORT"] || "9999", 10);

export async function crossChainTest(db: Client) {
  const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );
  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http("http://localhost:8545"),
  });
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http("http://localhost:8545"),
  });

  const mod = await import("@evm-midnight/contracts-evm");
  const addresses = (mod as any).contractAddressesEvmMain();
  const erc721Address = addresses.chain31337[
    "Erc721DevModule#Erc721Dev"
  ] as `0x${string}`;

  const tokenId = 100n;

  // Step 1: Mint a new ERC721 token on EVM
  await assert("Cross-chain: mint ERC721 token #100", async () => {
    const hash = await walletClient.writeContract({
      address: erc721Address,
      abi: [
        {
          name: "mint",
          type: "function",
          inputs: [
            { name: "_to", type: "address" },
            { name: "_tokenId", type: "uint256" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "mint",
      args: [account.address, tokenId],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  // Step 2: Verify token appears in DB via sync node
  await assertSQL(
    "Cross-chain: token #100 synced to evm_midnight table",
    db,
    `SELECT * FROM evm_midnight WHERE token_id = '100'`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return (
        row.token_id === "100" &&
        row.owner === account.address.toLowerCase()
      );
    },
  );

  // Step 3: Verify token appears in API
  await assert("Cross-chain: /api/erc721 includes token #100", async () => {
    const res = await fetch(`http://localhost:${API_PORT}/api/erc721`);
    const data = (await res.json()) as any[];
    return data.some((row: any) => row.token_id === "100");
  });

  // Step 4: Verify Midnight contract is deployed and reachable
  await assert(
    "Cross-chain: Midnight contract address is available",
    async () => {
      const addr = getContractAddress();
      return addr !== null && addr.length > 0;
    },
  );

  // Step 5: Verify the properties table schema is ready for cross-chain data
  await assertSQL(
    "Cross-chain: evm_midnight_properties table is ready",
    db,
    `SELECT COUNT(*) as cnt FROM information_schema.tables
     WHERE table_name = 'evm_midnight_properties'`,
    (rows) => rows.length > 0,
    (rows) => {
      return (rows[0] as any).cnt === "1";
    },
  );

  // Step 6: Transfer token to another address on EVM
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
  await assert("Cross-chain: transfer token #100 to account #2", async () => {
    const hash = await walletClient.writeContract({
      address: erc721Address,
      abi: [
        {
          name: "transferFrom",
          type: "function",
          inputs: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "tokenId", type: "uint256" },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
      ],
      functionName: "transferFrom",
      args: [account.address, recipient, tokenId],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  // Step 7: Verify ownership updated in DB
  await assertSQL(
    "Cross-chain: token #100 owner updated after transfer",
    db,
    `SELECT * FROM evm_midnight WHERE token_id = '100'`,
    (rows) => {
      if (rows.length === 0) return false;
      return (rows[0] as any).owner === recipient.toLowerCase();
    },
    (rows) => {
      const row = rows[0] as any;
      return row.owner === recipient.toLowerCase();
    },
  );

  // Step 8: Verify API reflects the updated owner
  await assert(
    "Cross-chain: /api/erc721 shows updated owner for token #100",
    async () => {
      const res = await fetch(`http://localhost:${API_PORT}/api/erc721`);
      const data = (await res.json()) as any[];
      const token = data.find((row: any) => row.token_id === "100");
      return token?.owner === recipient.toLowerCase();
    },
  );
}
