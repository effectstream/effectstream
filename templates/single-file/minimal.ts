/**
 * One file, one dependency. Run: `bun install && bun start`, then open
 * http://localhost:9999.
 *
 * The SDK version is pinned in package.json rather than in the import
 * specifier. Bun's auto-install cache cannot resolve packages that import
 * themselves by name (`@noble/hashes/crypto`, reached transitively via viem),
 * because that resolution needs a node_modules anchor the cache never creates.
 * `bun install` materializes one, so the import below stays a plain bare
 * specifier.
 */
import {
  midnightContract,
  pglite,
  runNode,
  type MidnightNetwork,
} from "@effectstream/node-sdk";

const NETWORK: MidnightNetwork = "preview"; // Change to "preprod" for the mirror.
const CONTRACTS = {
  preview: "c1a9ec7c4d2566f59456fd915a0438bf4dc9b8671d4c2308d30af796c51ad20f",
  preprod: "39f865f1b9b649731c24fb40d5d06d9c6d44acf68372dfbb22e4a2ea47209a2c",
} as const;
let round = "waiting for the next contract update";

await runNode({
  appName: "single-file",
  database: pglite(),
  sources: {
    counter: midnightContract({
      network: NETWORK,
      address: CONTRACTS[NETWORK],
      startBlockHeight: "latest",
      ledger: { round: "uint128" },
    }),
  },
  transitions: {
    counter: ({ state, blockHeight }) => {
      round = state.round;
      console.log(`round ${round} at block ${blockHeight}`);
    },
  },
  api: async (server) => {
    server.get("/", async (_request, reply) =>
      reply.type("text/html").send(`<!doctype html>
        <title>Effectstream + Midnight</title>
        <h1>Effectstream + Midnight</h1>
        <p>Network: ${NETWORK}</p>
        <p>Contract: ${CONTRACTS[NETWORK]}</p>
        <p>Round: ${round}</p>`));
  },
});
