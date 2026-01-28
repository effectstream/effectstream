
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { getPublicStates } from "@midnight-ntwrk/midnight-js-contracts";

const config = {
  indexerUri: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWsUri: "ws://127.0.0.1:8088/api/v3/graphql/ws"
};

const contractAddress = "e4a6b4e6c8b5374059b093a206c6013cedc17f9fea89d3409cca1a9076a7d3a0";

const publicDataProvider = indexerPublicDataProvider(
  config.indexerUri,
  config.indexerWsUri
);

console.log("Querying contract state for:", contractAddress);

try {
  const publicStates = await getPublicStates(publicDataProvider, contractAddress);
  console.log("Public States:", publicStates);
  
  if (publicStates && (publicStates as any).contractState) {
    const state = (publicStates as any).contractState;
    console.log("Contract State Keys:", Object.keys(state));
    // Try to iterate over balance if it exists
    if (state.balance) {
       console.log("Balance exists, size:", state.balance.size);
       const keys = Array.from(state.balance.keys());
       console.log("Balance keys sample:", keys.slice(0, 2));
    }
  }
} catch (error) {
  console.error("Error querying contract state:", error);
}
