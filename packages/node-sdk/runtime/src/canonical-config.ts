import {
  ConfigNetworkType,
  type StartBlockHeightPolicy,
  type SyncProtocolWithNetwork,
} from "@effectstream/config";

const START_BLOCK_HEIGHT_PROVENANCE = Symbol.for(
  "@effectstream/config/start-block-height-provenance",
);

function ownsLocalStartPolicy(protocol: SyncProtocolWithNetwork): boolean {
  return protocol.networkType === ConfigNetworkType.NTP ||
    protocol.networkType === ConfigNetworkType.MIDNIGHT;
}

/**
 * Build the runtime-owned descriptor graph without mutating ConfigBuilder output.
 * Function-valued primitive fields are intentionally retained by reference;
 * only the mutable configuration containers are copied.
 */
export function cloneRuntimeSyncInfo(
  syncInfo: readonly SyncProtocolWithNetwork[],
): SyncProtocolWithNetwork[] {
  return syncInfo.map((source) => {
    const protocol = {
      ...source,
      network: { ...source.network },
      syncProtocol: { ...source.syncProtocol },
      primitives: source.primitives.map((entry) => ({
        ...entry,
        primitive: { ...entry.primitive },
      })),
    } as SyncProtocolWithNetwork;

    if (ownsLocalStartPolicy(protocol)) {
      const requested = (protocol.syncProtocol as {
        startBlockHeight: StartBlockHeightPolicy;
      }).startBlockHeight;
      (protocol as SyncProtocolWithNetwork & {
        [START_BLOCK_HEIGHT_PROVENANCE]?: "latest" | "explicit";
      })[START_BLOCK_HEIGHT_PROVENANCE] = requested === "latest"
        ? "latest"
        : "explicit";
    }

    return protocol;
  });
}

/** Apply owning-protocol defaults before a primitive constructor can observe them. */
export function inheritPrimitiveConfig(
  owner: SyncProtocolWithNetwork,
  primitive: Record<string, unknown>,
): Record<string, unknown> {
  const inherited: Record<string, unknown> = { ...primitive };
  if (inherited.startBlockHeight === undefined) {
    const ownerStart = (owner.syncProtocol as {
      startBlockHeight?: number;
    }).startBlockHeight;
    if (!Number.isSafeInteger(ownerStart) || (ownerStart as number) < 0) {
      throw new Error(
        `Primitive "${String(primitive.name ?? primitive.type)}" requires an explicit startBlockHeight because its owning protocol has no resolved numeric start`,
      );
    }
    inherited.startBlockHeight = ownerStart;
  }
  if (
    owner.networkType === ConfigNetworkType.MIDNIGHT &&
    inherited.networkId === undefined
  ) {
    inherited.networkId = (owner.network as { networkId: string }).networkId;
  }
  return inherited;
}
