export type MidnightNetworkProfile<NetworkId extends string = string> =
  Readonly<{
    networkId: NetworkId;
    nodeUrl: string;
    indexerHttpUrl: string;
    indexerWsUrl: string;
    /** Informational metadata only. Resolving a profile performs no I/O. */
    faucetUrl?: string;
  }>;

const UNDEPLOYED_ENDPOINTS = Object.freeze({
  nodeUrl: "http://127.0.0.1:9944",
  indexerHttpUrl: "http://127.0.0.1:8088/api/v4/graphql",
  indexerWsUrl: "ws://127.0.0.1:8088/api/v4/graphql/ws",
});

const STAGENET_ENDPOINTS = Object.freeze({
  nodeUrl: "wss://rpc.stagenet.shielded.tools",
  indexerHttpUrl:
    "https://indexer.stagenet.shielded.tools/api/v4/graphql",
  indexerWsUrl:
    "wss://indexer.stagenet.shielded.tools/api/v4/graphql/ws",
  faucetUrl: "https://faucet.stagenet.shielded.tools/api/drips",
});

/**
 * Resolve service metadata for a Midnight network without reading process
 * state, loading wallet code, or performing network I/O.
 *
 * `undeployed` keeps the local development endpoints, `stagenet` uses its
 * explicit node-2.x profile, and every other non-empty ID retains the hosted
 * Midnight endpoint convention. Callers may override individual endpoints
 * after resolution.
 */
export function resolveMidnightNetworkProfile<const NetworkId extends string>(
  networkId: NetworkId,
): MidnightNetworkProfile<NetworkId> {
  if (networkId.trim().length === 0) {
    throw new Error(
      "Cannot resolve a Midnight network profile without a non-empty networkId",
    );
  }

  if (networkId === "undeployed") {
    return { networkId, ...UNDEPLOYED_ENDPOINTS };
  }
  if (networkId === "stagenet") {
    return { networkId, ...STAGENET_ENDPOINTS };
  }

  return {
    networkId,
    nodeUrl: `https://rpc.${networkId}.midnight.network`,
    indexerHttpUrl:
      `https://indexer.${networkId}.midnight.network/api/v4/graphql`,
    indexerWsUrl:
      `wss://indexer.${networkId}.midnight.network/api/v4/graphql/ws`,
  };
}
