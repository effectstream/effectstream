import { assert, assertSQL, getDeployedAddresses, mineBlock } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const LAUNCHPAD_ABI = parseAbi([
  "function buyItemsNative(address receiver, address referrer, uint256[] itemsIds, uint256[] itemsQuantities) payable",
]);

export async function validationTest(db: Client) {
  const account = privateKeyToAccount("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a");
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
    console.log("Warning: No launchpad address, skipping validation tests");
    return;
  }
  const launchpadAddress = addresses.launchpadProxy;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
  const wallet = account.address.toLowerCase();

  // Test: Buy supply-limited item (id=4, supply=5) multiple times to exhaust supply
  // First, buy 5 units (max supply)
  await assert("Buy supply-limited item (within supply)", async () => {
    const hash = await walletClient.writeContract({
      address: launchpadAddress!,
      abi: LAUNCHPAD_ABI,
      functionName: "buyItemsNative",
      args: [
        account.address,
        ZERO_ADDRESS,
        [4n],
        [5n], // buy all 5
      ],
      value: 100000000000000000n, // 5 * 0.02 ETH (item 4: Mithril Chainmail)
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await mineBlock();

  await assertSQL(
    "Supply-limited purchase recorded as valid",
    db,
    `SELECT * FROM launchpad_participations WHERE wallet = '${wallet}' AND item_ids LIKE '%4%' AND participation_valid = true`,
    (rows) => rows.length > 0,
    (rows) => rows.length > 0,
  );

  // Test: Underpayment (send less than item costs)
  // Use account 3 for underpayment test
  const account3 = privateKeyToAccount("0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6");
  const walletClient3 = createWalletClient({
    account: account3,
    chain: foundry,
    transport: http("http://localhost:8545"),
  });

  await assert("Underpayment transaction succeeds on-chain (validation in backend)", async () => {
    const hash = await walletClient3.writeContract({
      address: launchpadAddress!,
      abi: LAUNCHPAD_ABI,
      functionName: "buyItemsNative",
      args: [
        account3.address,
        ZERO_ADDRESS,
        [3n], // Enchanted Shield: 0.01 ETH
        [1n],
      ],
      value: 1n, // deliberate underpayment (1 wei)
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  await mineBlock();

  const wallet3 = account3.address.toLowerCase();

  await assertSQL(
    "Underpayment recorded as invalid participation",
    db,
    `SELECT * FROM launchpad_participations WHERE wallet = '${wallet3}' AND participation_valid = false`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.preconditions_met === true && row.participation_valid === false;
    },
  );
}
