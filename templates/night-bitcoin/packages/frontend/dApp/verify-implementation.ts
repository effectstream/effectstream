
import { getContractState, extractBalances } from "./client/src/contracts/midnight-utils.ts";

const config = {
  indexerUri: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWsUri: "ws://127.0.0.1:8088/api/v3/graphql/ws"
};

const contractAddress = "000610cfd545617148cfb01ea09dd633bd88435f244d382a49142320da1afa52";

console.log("Verifying generic state reading...");

try {
  const publicStates = await getContractState(config.indexerUri, config.indexerWsUri, contractAddress);
  console.log("Public States retrieved successfully.");
  
  const balanceMap = extractBalances(publicStates);
  console.log("Balances extracted successfully. Map size:", balanceMap.size);
  
  if (balanceMap.size > 0) {
    console.log("Sample balances:");
    let count = 0;
    for (const [addr, bal] of balanceMap.entries()) {
      console.log(`Address: ${addr}, Balance: ${bal}`);
      if (++count >= 5) break;
    }
  } else {
    console.log("No balances found (this might be expected if the contract is new or if no mints happened).");
  }
} catch (error) {
  console.error("Verification failed:", error);
  process.exit(1);
}
