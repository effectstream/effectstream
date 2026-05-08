import { assert, assertSQL, getDeployedAddresses } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const ERC20_ABI = parseAbi([
  "function mint(address to, uint256 amount)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const LAUNCHPAD_ABI = parseAbi([
  "function buyItemsErc20(address paymentToken, uint256 paymentAmount, address receiver, address referrer, uint256[] itemsIds, uint256[] itemsQuantities)",
]);

export async function buyItemsErc20Test(db: Client) {
  const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
  const walletClient = createWalletClient({
    account,
    chain: foundry,
    transport: http("http://localhost:8545"),
  });
  const publicClient = createPublicClient({
    chain: foundry,
    transport: http("http://localhost:8545"),
  });

  const addresses = getDeployedAddresses();
  if (!addresses) {
    console.log("Warning: Missing contract addresses, skipping ERC20 test");
    return;
  }
  const launchpadAddress = addresses.launchpadProxy;
  const mockErc20Address = addresses.mockErc20;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  const mintAmount = 100000000000000000000n; // 100 tokens
  const purchaseAmount = 3400000000000000000n; // price for item 1

  await assert("Mint MockERC20 tokens", async () => {
    const hash = await walletClient.writeContract({
      address: mockErc20Address!,
      abi: ERC20_ABI,
      functionName: "mint",
      args: [account.address, mintAmount],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await assert("Approve launchpad for ERC20 spending", async () => {
    const hash = await walletClient.writeContract({
      address: mockErc20Address!,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [launchpadAddress!, mintAmount],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await assert("Buy items with ERC20", async () => {
    const hash = await walletClient.writeContract({
      address: launchpadAddress!,
      abi: LAUNCHPAD_ABI,
      functionName: "buyItemsErc20",
      args: [
        mockErc20Address!,
        purchaseAmount,
        account.address,
        ZERO_ADDRESS,
        [1n],
        [1n],
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  const wallet = account.address.toLowerCase();

  await assertSQL(
    "ERC20 participation recorded",
    db,
    `SELECT * FROM launchpad_participations WHERE wallet = '${wallet}' AND payment_token = '${mockErc20Address!.toLowerCase()}'`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.participation_valid === true;
    },
  );
}
