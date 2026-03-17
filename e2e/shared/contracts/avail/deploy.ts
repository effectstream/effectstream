import { Account, Pallets, SDK } from "avail-js-sdk";
import { getEnv } from "@effectstream/utils/runtime";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const sdk = await SDK.New("ws://localhost:9955/ws");
const seed: string = getEnv("SEED") ?? "//Alice";
if (!seed) {
  throw new Error("SEED environment variable is not set");
}
const account = Account.new(seed);
const genesisHash = await sdk.client.api.rpc.chain.getBlockHash(0);
console.log("Account Address: ", account.address);
// Use a fixed key string
const ApplicationKey = "app_key_" + Date.now();

export async function createApplicationKey() {
  // Create application key transaction
  const tx = sdk.tx.dataAvailability.createApplicationKey(ApplicationKey);
  console.log("Submitting transaction to create application key...");

  // Execute and wait for inclusion
  const res = await tx.executeWaitForInclusion(account, {});

  // Check if transaction was successful
  const isOk = res.isSuccessful();
  if (isOk === undefined) {
    throw new Error("Cannot check if transaction was successful");
  } else if (!isOk) {
    console.log("Transaction failed", res);
    throw new Error("Transaction failed");
  }

  // Extract event data
  if (res.events === undefined) throw new Error("No events found");

  const event = res.events.findFirst(
    Pallets.DataAvailabilityEvents.ApplicationKeyCreated,
  );
  if (event === undefined) {
    throw new Error("ApplicationKeyCreated event not found");
  }

  const appId = event.id;
  console.log(`Application created successfully:`);
  console.log(`Owner: ${event.owner}`);
  console.log(`Key: ${event.keyToString()}`);
  console.log(`App Id: ${appId}`);
  console.log(`Transaction Hash: ${res.txHash}`);
  return { appId, txHash: res.txHash };
}

const { appId, txHash } = await createApplicationKey();
console.log("Transaction Hash: ", txHash.toString());
const data = JSON.stringify({ appId, txHash, ApplicationKey, genesisHash });
const fileName = process.cwd() + "/avail_app.json";
console.log("Writing to file: ", fileName);
await writeFile(fileName, data, "utf-8");

const child = spawn("bun", ["run", "--filter", "@e2e/avail-contracts", "avail-light-client:start"], {
  env: { ...process.env, AVAIL_APP_ID: appId.toString() },
  stdio: "inherit",
});

console.log("Light Client Started");

await new Promise<void>((resolve, reject) => {
  child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`Process exited with code ${code}`)));
  child.on("error", reject);
});
