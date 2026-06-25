import { assert, assertSQL, getDeployedAddresses, mineBlock } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const LAUNCHPAD_ABI = parseAbi([
  "function buyItemsNative(address receiver, address referrer, uint256[] itemsIds, uint256[] itemsQuantities) payable",
  "function buyItemsErc20(address paymentToken, uint256 paymentAmount, address receiver, address referrer, uint256[] itemsIds, uint256[] itemsQuantities)",
]);

const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export async function evmNegativeTest(db: Client) {
  // Hardhat account #2.
  const account = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
  const walletClient = createWalletClient({ account, chain: foundry, transport: http("http://localhost:8545") });
  const publicClient = createPublicClient({ chain: foundry, transport: http("http://localhost:8545") });

  const addresses = getDeployedAddresses();
  if (!addresses) {
    console.log("Warning: No deployed addresses, skipping EVM negative tests");
    return;
  }
  const lp = addresses.launchpadProxy;
  const receiver = addresses.admin; // campaign routing key
  const referrerAddr = "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" as `0x${string}`; // account #5

  // ── Contract-level revert paths ─────────────────────────────────────────
  const expectRevert = (name: string, fn: () => Promise<`0x${string}`>) =>
    assert(name, async () => {
      try {
        const hash = await fn();
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return receipt.status === "reverted";
      } catch {
        return true; // gas estimation / send rejected the reverting tx
      }
    });

  await expectRevert("buyItemsNative reverts when receiver == referrer (InvalidReferral)", () =>
    walletClient.writeContract({
      address: lp, abi: LAUNCHPAD_ABI, functionName: "buyItemsNative",
      args: [referrerAddr, referrerAddr, [1n], [1n]], value: 2000000000000000n,
    }));

  await expectRevert("buyItemsNative reverts when receiver == address(0) (InvalidReceiver)", () =>
    walletClient.writeContract({
      address: lp, abi: LAUNCHPAD_ABI, functionName: "buyItemsNative",
      args: [ZERO, referrerAddr, [1n], [1n]], value: 2000000000000000n,
    }));

  const fakeToken = "0x00000000000000000000000000000000000000ff" as `0x${string}`;
  await expectRevert("buyItemsErc20 reverts with unsupported payment token (UnsupportedPaymentToken)", () =>
    walletClient.writeContract({
      address: lp, abi: LAUNCHPAD_ABI, functionName: "buyItemsErc20",
      args: [fakeToken, 1000000n, receiver, ZERO, [1n], [1n]],
    }));

  // ── STM-level invalid paths (contract emits; backend marks payment invalid) ──
  // Duplicate item ids in one purchase.
  await assert("Submit purchase with duplicate item ids", async () => {
    const hash = await walletClient.writeContract({
      address: lp, abi: LAUNCHPAD_ABI, functionName: "buyItemsNative",
      args: [receiver, ZERO, [1n, 1n], [1n, 1n]], value: 4000000000000000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });
  await mineBlock();

  await assertSQL(
    "Duplicate-item purchase recorded invalid in payments",
    db,
    `SELECT * FROM payments WHERE chain = 'evm' AND status = 'invalid' AND reason = 'duplicate-items'`,
    (rows) => rows.length > 0,
    (rows) => rows.length > 0,
  );

  // Unknown item id.
  await assert("Submit purchase with unknown item id", async () => {
    const hash = await walletClient.writeContract({
      address: lp, abi: LAUNCHPAD_ABI, functionName: "buyItemsNative",
      args: [receiver, ZERO, [9999n], [1n]], value: 2000000000000000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });
  await mineBlock();

  await assertSQL(
    "Unknown-item purchase recorded invalid in payments",
    db,
    `SELECT * FROM payments WHERE chain = 'evm' AND status = 'invalid' AND reason LIKE 'unknown-item%'`,
    (rows) => rows.length > 0,
    (rows) => rows.length > 0,
  );
}
