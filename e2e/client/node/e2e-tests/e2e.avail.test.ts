import type { Client } from "pg";
import { Account, Pallets, SDK } from "avail-js-sdk";
import { BuiltinEvents, PaimaEventManager } from "@paima/event-client";
import { assertSQL, blockWatcher, type SharedState } from "@e2e/engine";
import { readAvailApplication } from "@e2e/avail-contracts";

const AVAIL_NODE_URL = "ws://localhost:9955/ws";
const AVAIL_SEED: string = "//Alice";
const account = Account.new(AVAIL_SEED);

export async function submitData(appId: number, data: string) {
  const sdk = await SDK.New(AVAIL_NODE_URL);
  console.log(`Submitting data to App Id: ${appId}`);

  // Create data submission transaction
  const tx = sdk.tx.dataAvailability.submitData(data);
  console.log("Submitting transaction with data...");

  // Execute and wait for inclusion with app_id
  const res = await tx.executeWaitForInclusion(account, { app_id: appId });

  // Check if transaction was successful
  const isOk = res.isSuccessful();
  if (isOk === undefined) {
    throw new Error("Cannot check if transaction was successful");
  } else if (!isOk) {
    throw new Error("Transaction failed");
  }

  // Extract event data
  if (res.events === undefined) throw new Error("No events found");

  // Transaction Details
  console.log(
    `Block Hash: ${res.blockHash}, Block Number: ${res.blockNumber}, Tx Hash: ${res.txHash}, Tx Index: ${res.txIndex}`,
  );

  // Find DataSubmitted event
  const event = res.events.findFirst(
    Pallets.DataAvailabilityEvents.DataSubmitted,
  );
  if (event === undefined) throw new Error("DataSubmitted event not found");

  console.log(`Data submitted successfully:`);
  console.log(`Who: ${event.who}`);
  console.log(`DataHash: ${event.dataHash}`);

  console.log("Data submission completed successfully");
  return { txHash: res.txHash, blockHash: res.blockHash };
}

export async function submitDataWithMessageAvailTest(
  db: Client,
  sharedState: SharedState,
) {
  const latestBlock: Record<string, number> = {};
  const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  await PaimaEventManager.Instance.subscribe(
    {
      topic: BuiltinEvents.RollupBlock,
      filter: { block: undefined },
    },
    (event) => {
      latestBlock["__main__"] = Math.max(
        Number(event.block),
        isNaN(latestBlock["__main__"]) ? 0 : latestBlock["__main__"],
      );
    },
  );
  const appId = readAvailApplication().appId;
  console.log(`Submitting data to App Id: ${appId}`);
  const data = '{ "message": "Batata" }';
  await blockWatcher.waitForBlock();
  const txHash = await submitData(appId, data);
  console.log(`Transaction Hash: ${txHash.txHash.toString()}`);
  const currentAvailBlock = blockWatcher.getLatestBlock("parallelAvail");
  await blockWatcher.waitForBlock("parallelAvail", currentAvailBlock + 2);
  // Avail Tx should have inserted new primitive accounting entry
  sharedState.primitive_accounting_counter += 1;
  await assertSQL<{ primitive_name: string }>(
    "Check Avail Tx",
    db,
    `SELECT * FROM avail_messages;`,
    (res: any) => res.rows.length === 1,
    (res: any) => res.rows[0].message === JSON.parse(data).message,
  );
}
