// 06-midnight-config.ts — Fetch the public Midnight contract config from the node.
// Gives you the contract address, indexer URI, and proof server URI.
// bun run api-examples/06-midnight-config.ts

import { get, print, header } from "./config.ts";

header("Midnight Config");

const cfg = await get("/api/midnight/config");
print("GET /api/midnight/config", cfg);

const c = cfg as any;
console.log("\nQuick-copy values:");
console.log(`  contractAddress : ${c.contractAddress}`);
console.log(`  indexerUri      : ${c.indexerUri}`);
console.log(`  indexerWsUri    : ${c.indexerWsUri}`);
console.log(`  proofServerUri  : ${c.proofServerUri}`);
console.log(`  networkId       : ${c.networkId}`);
