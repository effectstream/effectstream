import seedProfileJson from "./undeployed-genesis-seeds.json" with { type: "json" };

/**
 * Public development keys for the isolated `undeployed` network only.
 *
 * The first four entries are Midnight Node 1.0.0's standard local identities.
 * The final three are the Night-Bitcoin filler roots that the template already
 * used before genesis prefunding was introduced. Keeping those roots preserves
 * generated addresses while avoiding live-process wallet sharing.
 */
export const GENESIS_PROFILE_ID = "night-bitcoin-v2-node-1.0.0-prefunded-v1";
export const GENESIS_NETWORK = "undeployed" as const;
export const GENESIS_NODE_VERSION = "1.0.0";
export const GENESIS_NONCE_SEED =
  "0000000000000000000000000000000000000000000000000000000000000037";

/** Digest-pinned build provenance for the checked-in genesis snapshot. */
export const GENESIS_SOURCE_NODE_IMAGE =
  "midnightntwrk/midnight-node@sha256:ede01da35e982b6a4b85461ad8492ae2753ef14246fba33c8039b782aa8e39fb";
/** Digest-pinned build provenance for the checked-in genesis snapshot. */
export const GENESIS_SOURCE_TOOLKIT_IMAGE =
  "midnightntwrk/midnight-node-toolkit@sha256:9f709cf86503047ae014f4a2a5fcd2a945aeefefdeadc3660af6b41c921859e6";

/** Reviewed hashes are the trust root; the adjacent manifest is not. */
export const BUNDLED_GENESIS_PROFILE_HASH =
  "deb5507da7e57536dba24e07f751cd4bddba61fc1142e868d894279e294f8e5c";
export const BUNDLED_GENESIS_STATE_SHA256 =
  "559d19c4c41ed0aed20b395dfdded371dcbb49e2e034b87a105ed27dc33cf6a6";
export const BUNDLED_GENESIS_BLOCK_SHA256 =
  "1549a52858503ca6d6371ad0234cb3d2bb9654e0a7bd65725e02cb5c6bccbaff";
export const BUNDLED_GENESIS_CHAIN_SPEC_SHA256 =
  "c6701c6796c5336e82823899163bee2c1bc91c38e929b5139439d7f8f877fa2d";

export const EXPECTED_NIGHT_UTXOS = 5;
export const EXPECTED_NIGHT_PER_UTXO = 50_000_000_000_000n;
export const EXPECTED_NIGHT_BALANCE =
  BigInt(EXPECTED_NIGHT_UTXOS) * EXPECTED_NIGHT_PER_UTXO;

export const REQUIRED_WALLET_IDS = [
  "genesis-deployer",
  "balancing-batcher-0",
  "balancing-batcher-1",
  "lace-test-wallet",
  "filler-0",
  "filler-1",
  "filler-2",
] as const;

export const FILLER_WALLET_IDS = ["filler-0", "filler-1", "filler-2"] as const;

export type GenesisWalletId = (typeof REQUIRED_WALLET_IDS)[number];
export type FillerWalletId = (typeof FILLER_WALLET_IDS)[number];
export type GenesisSeedMap = Readonly<Record<GenesisWalletId, string>>;

const SEED_PATTERN = /^(?:[0-9a-f]{64}|[0-9a-f]{128})$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parse a seed map strictly enough that a typo cannot launch an empty wallet. */
export function parseGenesisSeedMap(value: unknown): GenesisSeedMap {
  if (!isPlainObject(value)) {
    throw new Error("Midnight genesis seed profile must be a JSON object");
  }

  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...REQUIRED_WALLET_IDS].sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new Error(
      `Midnight genesis seed profile must contain exactly: ${expectedKeys.join(", ")}`,
    );
  }

  const parsed = {} as Record<GenesisWalletId, string>;
  const seenSeeds = new Set<string>();
  for (const id of REQUIRED_WALLET_IDS) {
    const seed = value[id];
    if (typeof seed !== "string" || !SEED_PATTERN.test(seed)) {
      throw new Error(
        `Midnight genesis seed "${id}" must be 32 or 64 bytes of lowercase hex`,
      );
    }
    if (seenSeeds.has(seed)) {
      throw new Error(`Midnight genesis seed "${id}" duplicates another wallet`);
    }
    seenSeeds.add(seed);
    parsed[id] = seed;
  }

  return Object.freeze(parsed);
}

export const GENESIS_SEEDS = parseGenesisSeedMap(seedProfileJson);

export const FILLER_WALLETS = FILLER_WALLET_IDS.map((id, index) => ({
  id,
  index,
  seed: GENESIS_SEEDS[id],
})) as ReadonlyArray<{
  readonly id: FillerWalletId;
  readonly index: number;
  readonly seed: string;
}>;

export interface NightUtxoObservation {
  readonly amount: bigint;
  readonly registeredForDustGeneration: boolean;
}

export interface PrefundingObservation {
  readonly walletId: string;
  readonly nightBalance: bigint;
  readonly nightUtxos: readonly NightUtxoObservation[];
  readonly dustBalance: bigint;
}

/**
 * Pure fail-closed validation shared by runtime verification and unit tests.
 * It intentionally has no transaction/faucet API and can only inspect data.
 */
export function assertPrefundingObservation(
  observation: PrefundingObservation,
): void {
  const context = `Prefunded wallet ${observation.walletId}`;
  if (observation.nightUtxos.length !== EXPECTED_NIGHT_UTXOS) {
    throw new Error(
      `${context}: expected ${EXPECTED_NIGHT_UTXOS} NIGHT UTXOs, observed ${observation.nightUtxos.length}`,
    );
  }
  if (
    observation.nightUtxos.some(
      (utxo) => utxo.amount !== EXPECTED_NIGHT_PER_UTXO,
    )
  ) {
    throw new Error(
      `${context}: every NIGHT UTXO must contain ${EXPECTED_NIGHT_PER_UTXO}`,
    );
  }
  if (
    observation.nightUtxos.some(
      (utxo) => utxo.registeredForDustGeneration !== true,
    )
  ) {
    throw new Error(`${context}: every NIGHT UTXO must be registered for DUST`);
  }
  if (observation.nightBalance !== EXPECTED_NIGHT_BALANCE) {
    throw new Error(
      `${context}: expected NIGHT balance ${EXPECTED_NIGHT_BALANCE}, observed ${observation.nightBalance}`,
    );
  }
  if (observation.dustBalance <= 0n) {
    throw new Error(`${context}: expected a positive DUST balance`);
  }
}

export function assertUndeployedProfile(networkId: string | undefined): void {
  const resolved = networkId?.trim() || GENESIS_NETWORK;
  if (resolved !== GENESIS_NETWORK) {
    throw new Error(
      `${GENESIS_PROFILE_ID} contains public development keys and is valid only on "${GENESIS_NETWORK}" (received "${resolved}")`,
    );
  }
}
