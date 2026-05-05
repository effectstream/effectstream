import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

export async function erc721Test(db: Client) {
  const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
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
  const erc721Address = addresses.chain31337["Erc721DevModule#Erc721Dev"] as `0x${string}`;

  const tokenId = 42n;

  await assert("Mint ERC721 token", async () => {
    const hash = await walletClient.writeContract({
      address: erc721Address,
      abi: [{
        name: "mint",
        type: "function",
        inputs: [{ name: "_to", type: "address" }, { name: "_tokenId", type: "uint256" }],
        outputs: [],
        stateMutability: "nonpayable",
      }],
      functionName: "mint",
      args: [account.address, tokenId],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await assertSQL(
    "evm_midnight table contains minted token",
    db,
    `SELECT * FROM evm_midnight WHERE token_id = '${tokenId}'`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.token_id === String(tokenId) && row.owner === account.address.toLowerCase();
    },
  );
}
