// Endpoint resolution for scripts.
//
// Inside the `app` container docker-compose sets MIDNIGHT_* to the compose
// hostnames. On the HOST (workload generators, adversarial harness) nothing is
// set, so we default to the published 18400-block ports.

const env = (key: string, fallback: string): string =>
  process.env[key]?.trim() || fallback;

export const NETWORK = {
  id: env("MIDNIGHT_NETWORK_ID", "undeployed"),
  node: env("MIDNIGHT_NODE_HTTP", "http://127.0.0.1:18444"),
  indexer: env("MIDNIGHT_INDEXER_HTTP", "http://127.0.0.1:18488/api/v3/graphql"),
  indexerWS: env("MIDNIGHT_INDEXER_WS", "ws://127.0.0.1:18488/api/v3/graphql/ws"),
  proofServer: env("MIDNIGHT_PROOF_SERVER_URL", "http://127.0.0.1:18463"),
} as const;

export const BATCHER_URL = env("BATCHER_URL", "http://127.0.0.1:18434");
export const BALANCER_TARGET = env("BATCHER_TARGET", "midnight-balancer");

export const SEEDS = {
  genesis: "0000000000000000000000000000000000000000000000000000000000000001",
  batcher: env(
    "BATCHER_WALLET_SEED",
    "0000000000000000000000000000000000000000000000000000000000000042",
  ),
  zswapMaker: "0000000000000000000000000000000000000000000000000000000000000043",
  callCaller: "0000000000000000000000000000000000000000000000000000000000000044",
  zswapSink: "0000000000000000000000000000000000000000000000000000000000000045",
} as const;

export const FUNDING = {
  targetUtxos: Number(env("TARGET_UTXOS", "20")),
  /** Total NIGHT (in stars) moved from genesis into the batcher wallet. */
  fundTotalStars: BigInt(env("FUND_TOTAL_STARS", "10000000000000")), // 10M NIGHT
  /** Seed UTXO used to register the batcher address for dust before the big
   * transfer. Size only gates the ONE-TIME registration wait (the registration
   * fee must be covered by dust this UTXO has generated; rate ∝ NIGHT value),
   * so a large seed makes bootstrap near-instant. */
  seedStars: BigInt(env("SEED_STARS", "100000000000")), // 100k NIGHT
  /** Shielded coins minted into the zswap maker wallet. */
  makerCoins: Number(env("MAKER_COINS", "40")),
  makerCoinValue: BigInt(env("MAKER_COIN_VALUE", "1000")),
} as const;
