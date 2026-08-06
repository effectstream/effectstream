// Endpoint + seed resolution for the multi-product stack.
//
// Inside the `app` container docker-compose sets MIDNIGHT_* to compose
// hostnames. On the HOST (workloads, deep test suite) nothing is set, so we
// default to this template's published ports — a SIBLING block to
// templates/midnight-batcher so both stacks can run side by side.

const env = (key: string, fallback: string): string =>
  process.env[key]?.trim() || fallback;

export const NETWORK = {
  id: env("MIDNIGHT_NETWORK_ID", "undeployed"),
  node: env("MIDNIGHT_NODE_HTTP", "http://127.0.0.1:12845"),
  indexer: env("MIDNIGHT_INDEXER_HTTP", "http://127.0.0.1:12889/api/v3/graphql"),
  indexerWS: env("MIDNIGHT_INDEXER_WS", "ws://127.0.0.1:12889/api/v3/graphql/ws"),
  proofServer: env("MIDNIGHT_PROOF_SERVER_URL", "http://127.0.0.1:12864"),
} as const;

/** The ONE batcher serving every product. */
export const BATCHER_URL = env("BATCHER_URL", "http://127.0.0.1:12835");

export const GENESIS_SEED =
  "0000000000000000000000000000000000000000000000000000000000000001";

/**
 * Actor wallets used by the workloads. These belong to the PRODUCTS (they
 * build and submit transactions); the batcher's own fee wallets live in
 * shared-batcher/registry.ts and must never overlap with these.
 */
export const ACTOR_SEEDS = {
  /** product-b transfer sender */
  bMaker: "00000000000000000000000000000000000000000000000000000000000000b1",
  /** product-b transfer recipient (sink — never sends) */
  bSink: "00000000000000000000000000000000000000000000000000000000000000b2",
  /** product-c swap maker */
  cMaker: "00000000000000000000000000000000000000000000000000000000000000c1",
  /** product-c swap sink */
  cSink: "00000000000000000000000000000000000000000000000000000000000000c2",
} as const;

export const FUNDING = {
  /** Fee lanes (NIGHT UTXOs → dust streams) per product batcher wallet. */
  lanesPerProduct: Number(env("LANES_PER_PRODUCT", "10")),
  /** NIGHT (stars) backing each product's lanes. */
  fundStarsPerProduct: BigInt(env("FUND_STARS_PER_PRODUCT", "5000000000000")),
  /**
   * Seed UTXO for dust registration. Only gates the ONE-TIME registration
   * wait (fee must be covered by dust this UTXO already generated; rate ∝
   * NIGHT), so a large seed makes bootstrap near-instant.
   */
  seedStars: BigInt(env("SEED_STARS", "100000000000")),
  /** Shielded coins minted into each actor wallet. */
  actorCoins: Number(env("ACTOR_COINS", "30")),
  actorCoinValue: BigInt(env("ACTOR_COIN_VALUE", "1000")),
} as const;
