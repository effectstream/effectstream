import { assert, assertSQL, getDeployedAddresses } from "../helpers.ts";
import type { Client } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const LAUNCHPAD_ABI = parseAbi([
  "function buyItemsNative(address receiver, address referrer, uint256[] itemsIds, uint256[] itemsQuantities) payable",
]);

export async function buyItemsNativeTest(db: Client) {
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

  const addresses = getDeployedAddresses();
  if (!addresses) {
    console.log("Warning: No deployed addresses, skipping native purchase test");
    return;
  }
  const launchpadAddress = addresses.launchpadProxy;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;

  await assert("Buy items with native ETH", async () => {
    const hash = await walletClient.writeContract({
      address: launchpadAddress!,
      abi: LAUNCHPAD_ABI,
      functionName: "buyItemsNative",
      args: [
        account.address,
        ZERO_ADDRESS,
        [1n, 2n],
        [1n, 1n],
      ],
      value: 2000000000000000n, // 0.002 ETH (item 1 + item 2)
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.status === "success";
  });

  const wallet = account.address.toLowerCase();

  await assertSQL(
    "Participation recorded in DB",
    db,
    `SELECT * FROM launchpad_participations WHERE wallet = '${wallet}' AND participation_valid = true`,
    (rows) => rows.length > 0,
    (rows) => {
      const row = rows[0] as any;
      return row.preconditions_met === true && row.participation_valid === true;
    },
  );

  await assertSQL(
    "User items created in DB",
    db,
    `SELECT * FROM launchpad_user_items WHERE wallet = '${wallet}' ORDER BY item_id`,
    (rows) => rows.length >= 2,
    (rows) => {
      const items = rows as any[];
      return items.some((r) => r.item_id === 1) && items.some((r) => r.item_id === 2);
    },
  );

  await assertSQL(
    "User record upserted in DB",
    db,
    `SELECT * FROM launchpad_users WHERE wallet = '${wallet}'`,
    (rows) => rows.length > 0,
    (rows) => {
      const user = rows[0] as any;
      return user.last_participation_valid === true;
    },
  );
}
