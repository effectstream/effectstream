import type { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import { Buffer } from "node:buffer";
import { getEnv } from "@effectstream/utils/runtime";

const getEnvValue = (key: string): string | undefined => {
  return getEnv(key);
};

const env = (key: string | string[], fallback?: string): string => {
  if (typeof key === 'string') {
    return getEnvValue(key)?.trim() || fallback || "";
  }
  if (Array.isArray(key)) {
    return key.map((k) => getEnvValue(k)?.trim()).find((value) => !!value) ||
    fallback ||
    "";
  }
  throw new Error('Invalid key type');
}

export type NetworkConfig = {
    indexer: string;
    indexerWS: string;
    node: string;
    proofServer: string;
    networkId: NetworkId.NetworkId;
    genesisWalletSeed: string;
}

const LOCAL_PROOF_SERVER = "http://127.0.0.1:6300";

// Midnight Network default configurations
const undeployedNetworkConfig: NetworkConfig = {
    indexer: "http://127.0.0.1:8088/api/v4/graphql",
    indexerWS: "ws://127.0.0.1:8088/api/v4/graphql/ws",
    node: "http://127.0.0.1:9944",
    networkId: "undeployed" as NetworkId.NetworkId,
    proofServer: LOCAL_PROOF_SERVER,
    // In local mode, the Genesis Wallet Seed determines the initial funded wallet
    genesisWalletSeed: "0000000000000000000000000000000000000000000000000000000000000001",
} as const;

const BLOCKFROST_PROJECT_ID_ENV = "MIDNIGHT_BLOCKFROST_PROJECT_ID";
const BLOCKFROST_NETWORK_IDS: readonly string[] = ["preview", "preprod", "mainnet"];

const URL_OVERRIDE_ENVS = {
  indexer: "MIDNIGHT_INDEXER_HTTP",
  indexerWS: "MIDNIGHT_INDEXER_WS",
  node: "MIDNIGHT_NODE_HTTP",
} as const;
type EndpointKey = keyof typeof URL_OVERRIDE_ENVS;
const ENDPOINT_KEYS = Object.keys(URL_OVERRIDE_ENVS) as EndpointKey[];
const ALL_URL_OVERRIDE_ENVS =
  `${URL_OVERRIDE_ENVS.indexer}, ${URL_OVERRIDE_ENVS.indexerWS} and ${URL_OVERRIDE_ENVS.node}`;

const overrideEnvNames = (keys: readonly EndpointKey[]): string =>
  keys.map((key) => URL_OVERRIDE_ENVS[key]).join(", ");

/**
 * Blockfrost authenticates with a `project_id` query parameter rather than a
 * header, because the indexer client, Polkadot's WsProvider and browser
 * WebSockets only accept plain URLs. The parameter follows the host directly
 * (no slash before `?`), as Blockfrost documents the node URL.
 */
const withProjectId = (url: string, projectId: string): string =>
  `${url}?project_id=${projectId}`;

const blockfrostNetworkConfig = (
  networkId: NetworkId.NetworkId,
  projectId: string,
): NetworkConfig => ({
    indexer: withProjectId(`https://midnight-${networkId}.blockfrost.io/api/v0`, projectId),
    indexerWS: withProjectId(`wss://midnight-${networkId}.blockfrost.io/api/v0/ws`, projectId),
    node: withProjectId(`https://rpc.midnight-${networkId}.blockfrost.io`, projectId),
    proofServer: LOCAL_PROOF_SERVER,
    networkId,
    genesisWalletSeed: '',
});

// Neither error quotes a URL or the project token: both may hold secrets.
const missingProjectIdError = (
  networkId: string,
  defaulted: readonly EndpointKey[],
): Error => {
  const partial = defaulted.length < ENDPOINT_KEYS.length
    ? ` (${overrideEnvNames(defaulted)} not set)`
    : "";
  return new Error(
    `Midnight network "${networkId}" defaults to Blockfrost-hosted endpoints, which require a project token: ` +
      `set ${BLOCKFROST_PROJECT_ID_ENV} (one free project per network at https://blockfrost.io), ` +
      `or set all of ${ALL_URL_OVERRIDE_ENVS} to use other endpoints${partial}.`,
  );
};

const unknownNetworkError = (
  networkId: string,
  missing: readonly EndpointKey[],
): Error =>
  new Error(
    `Midnight network "${networkId}" has no default endpoints ` +
      `(defaults exist for undeployed, ${BLOCKFROST_NETWORK_IDS.join(", ")}): ` +
      `set ${ALL_URL_OVERRIDE_ENVS} (missing: ${overrideEnvNames(missing)}).`,
  );

const networkDefaults = (
  networkId: NetworkId.NetworkId,
  projectId: string,
  defaulted: readonly EndpointKey[],
): NetworkConfig => {
  if (networkId === "undeployed") return undeployedNetworkConfig;
  if (!BLOCKFROST_NETWORK_IDS.includes(networkId)) {
    throw unknownNetworkError(networkId, defaulted);
  }
  if (!projectId) throw missingProjectIdError(networkId, defaulted);
  return blockfrostNetworkConfig(networkId, projectId);
};

/**
 * Resolve the default endpoints for a wallet-SDK network ID.
 *
 * - `undeployed`: loopback services; no token is ever attached.
 * - `preview`, `preprod`, `mainnet`: Blockfrost-hosted indexer
 *   (`https://midnight-<id>.blockfrost.io/api/v0`, WS `…/api/v0/ws`) and node
 *   (`https://rpc.midnight-<id>.blockfrost.io`), each with
 *   `?project_id=<blockfrostProjectId>` appended. The token defaults to
 *   `MIDNIGHT_BLOCKFROST_PROJECT_ID`; without one this throws.
 * - Any other ID throws: there is no trustworthy hosted convention to guess,
 *   so such networks need `MIDNIGHT_INDEXER_HTTP`, `MIDNIGHT_INDEXER_WS` and
 *   `MIDNIGHT_NODE_HTTP`.
 *
 * The proof server is always local. Returned Blockfrost URLs embed the project
 * token: treat them as secrets and print them through
 * {@link redactBlockfrostProjectId}.
 */
export const defaultMidnightNetworkConfig = (
  networkId: NetworkId.NetworkId,
  blockfrostProjectId: string = env(BLOCKFROST_PROJECT_ID_ENV),
): NetworkConfig => networkDefaults(networkId, blockfrostProjectId.trim(), ENDPOINT_KEYS);

/**
 * Replace every `project_id=<token>` value in `text` with
 * `project_id=<redacted>`. Blockfrost endpoint URLs carry the project token in
 * the query string, so pass any endpoint URL, or a message that may contain
 * one, through this before logging it.
 */
export const redactBlockfrostProjectId = (text: string): string =>
  text.replace(/\b(project_id=)[^&#\s"'<>]+/gi, "$1<redacted>");

const networkId = (env("MIDNIGHT_NETWORK_ID") || "undeployed") as NetworkId.NetworkId;
const urlOverrides: Record<EndpointKey, string> = {
  indexer: env(URL_OVERRIDE_ENVS.indexer),
  indexerWS: env(URL_OVERRIDE_ENVS.indexerWS),
  node: env(URL_OVERRIDE_ENVS.node),
};
const defaultedEndpoints = ENDPOINT_KEYS.filter((key) => !urlOverrides[key]);

// Explicit URL overrides win verbatim. Defaults, and therefore the Blockfrost
// token or a known network ID, are only required while at least one of the
// three URLs is left to its default.
const selectedNetworkConfig: NetworkConfig =
  networkId !== "undeployed" && defaultedEndpoints.length === 0
    ? {
        ...urlOverrides,
        proofServer: LOCAL_PROOF_SERVER,
        networkId,
        genesisWalletSeed: '',
      }
    : networkDefaults(networkId, env(BLOCKFROST_PROJECT_ID_ENV), defaultedEndpoints);

let walletSeed: string;
if (env("MIDNIGHT_WALLET_SEED")) {
  walletSeed = env("MIDNIGHT_WALLET_SEED");
} else if (env("MIDNIGHT_WALLET_MNEMONIC")) {
  const { mnemonicToSeed } = await import("@scure/bip39");
  walletSeed = Buffer.from(await mnemonicToSeed(env("MIDNIGHT_WALLET_MNEMONIC"))).toString('hex');
} else {
  walletSeed = selectedNetworkConfig.genesisWalletSeed;
}

export type MidnightNetworkConfig = {
  id: NetworkId.NetworkId;
  indexer: string;
  indexerWS: string;
  node: string;
  proofServer: string;
  walletSeed: string;
};

/**
 * The endpoints selected by `MIDNIGHT_NETWORK_ID` (default `undeployed`),
 * resolved once at import. Each of `MIDNIGHT_INDEXER_HTTP`,
 * `MIDNIGHT_INDEXER_WS` and `MIDNIGHT_NODE_HTTP` replaces its URL verbatim;
 * the remaining URLs come from {@link defaultMidnightNetworkConfig}, so the
 * import throws when a hosted default is needed without
 * `MIDNIGHT_BLOCKFROST_PROJECT_ID`, or when an unknown network ID lacks any
 * override. Blockfrost URLs embed the project token: print them through
 * {@link redactBlockfrostProjectId}.
 */
export const midnightNetworkConfig: MidnightNetworkConfig = {
  id: selectedNetworkConfig.networkId,
  indexer: urlOverrides.indexer || selectedNetworkConfig.indexer,
  indexerWS: urlOverrides.indexerWS || selectedNetworkConfig.indexerWS,
  node: urlOverrides.node || selectedNetworkConfig.node,
  proofServer: env(["MIDNIGHT_PROOF_SERVER_URL", "MIDNIGHT_PROOF_SERVER"], selectedNetworkConfig.proofServer),
  walletSeed,
};

const isLocalProofServer = !!midnightNetworkConfig.proofServer.match(/(localhost|127\.0\.0\.1)/);
export const isExternalProofServerConfigured = !isLocalProofServer;
