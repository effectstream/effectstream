import { assert, assertSQL } from "../helpers.ts";
import type { Client } from "pg";
import {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

const EVM_RPC = "http://localhost:8545";
const DEV_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

export async function evmNftTest(db: Client) {
  const account = privateKeyToAccount(DEV_KEY);
  const wallet = createWalletClient({ account, chain: hardhat, transport: http(EVM_RPC) });
  const pub = createPublicClient({ chain: hardhat, transport: http(EVM_RPC) });

  const contractRes = await fetch("http://localhost:9999/api/contract-address");
  const { address: contractAddress } = await contractRes.json();

  await assert("Mint NFT via EVM", async () => {
    const abi = parseAbi(["function mint(address to, uint256 tokenId) external"]);
    const hash = await wallet.writeContract({
      address: contractAddress as `0x${string}`,
      abi,
      functionName: "mint",
      args: [account.address, 1001n],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await assertSQL(
    "NFT mint event indexed in DB",
    db,
    `SELECT * FROM events WHERE chain = 'evm' AND event_type = 'nft_mint'`,
    (rows) => rows.length > 0,
    (rows) => rows.some((r: any) => r.to_address?.toLowerCase() === account.address.toLowerCase()),
  );
}
