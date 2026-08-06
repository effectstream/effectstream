// Shared config for the multi-product batcher e2e suite.
//
// Infrastructure comes from the orchestrator (launcher.cli.ts) as native
// binaries on the standard Midnight ports, matching every other e2e suite —
// the runner executes suites serially, so they never overlap. Every value is
// env-overridable if you want to point the suite at a stack of your own.

const env = (key: string, fallback: string): string =>
  process.env[key]?.trim() || fallback;

export const NETWORK = {
  id: env("MIDNIGHT_NETWORK_ID", "undeployed"),
  node: env("MIDNIGHT_NODE_HTTP", "http://127.0.0.1:9944"),
  indexer: env("MIDNIGHT_INDEXER_HTTP", "http://127.0.0.1:8088/api/v3/graphql"),
  indexerWS: env("MIDNIGHT_INDEXER_WS", "ws://127.0.0.1:8088/api/v3/graphql/ws"),
  proofServer: env("MIDNIGHT_PROOF_SERVER_URL", "http://127.0.0.1:6300"),
} as const;

export const BATCHER_URL = env("BATCHER_URL", "http://127.0.0.1:3334");

export const GENESIS_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

/**
 * Fee wallets — one per product, never shared (the SDK throws if two adapters
 * claim the same seed). Seeds must be valid hex.
 */
export const PRODUCT_SEEDS = {
  "product-a": "00000000000000000000000000000000000000000000000000000000000e2a00",
  "product-b": "00000000000000000000000000000000000000000000000000000000000e2b00",
  "product-c": "00000000000000000000000000000000000000000000000000000000000e2c00",
} as const;

/** Actor wallets — build the transactions the products submit. */
export const ACTOR_SEEDS = {
  maker: "00000000000000000000000000000000000000000000000000000000000e2d10",
  sink: "00000000000000000000000000000000000000000000000000000000000e2e10",
} as const;

/**
 * Deliberately small: this suite proves WIRING, not throughput. Two fee lanes
 * per product match the batcher's 2 worker slots and are enough for the couple
 * of transactions each product submits here. Lane-count/capacity behaviour is
 * the deep suite's job (templates/multi-batcher, 10 lanes per product).
 */
export const FUNDING = {
  lanesPerProduct: Number(env("E2E_LANES_PER_PRODUCT", "2")),
  fundStarsPerProduct: BigInt(env("E2E_FUND_STARS", "3000000000000")),
  seedStars: BigInt(env("E2E_SEED_STARS", "100000000000")),
  actorCoins: Number(env("E2E_ACTOR_COINS", "10")),
  actorCoinValue: BigInt(env("E2E_ACTOR_COIN_VALUE", "1000")),
} as const;
