import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { getMidnightTip } from "./tip.ts";
import type {
  ResolvedStart,
  StartPolicyProjection,
  StartPolicySnapshotFields,
  SyncProtocolStartPolicy,
} from "../start-policy.ts";

// Only types are imported from `../start-policy.ts`: that module imports this
// one to build the registry, so a value import would close a runtime cycle.
const PROVENANCE_KEY = "startBlockHeightProvenance";

type MidnightProtocol = {
  indexer: string;
  startBlockHeight: number | "latest";
  requestTimeoutMs?: number;
};

/**
 * Start policy for the Midnight parallel protocol.
 *
 * The indexer URL is already materialized on the protocol config by the config
 * builder, so the definition uses it verbatim — it never derives an endpoint
 * from a network id. Each protocol entry resolves its own boundary: there is
 * deliberately no cross-entry dedupe, because every protocol persists its own
 * durable first boundary anyway.
 */
export const midnightStartPolicy: SyncProtocolStartPolicy = {
  async resolveLatest(entry: SyncProtocolWithNetwork): Promise<number> {
    const syncProtocol = entry.syncProtocol as unknown as MidnightProtocol;
    const { height } = await getMidnightTip({
      indexer: syncProtocol.indexer,
      ...(syncProtocol.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: syncProtocol.requestTimeoutMs }
        : {}),
    });
    return height;
  },

  projectImmutable(
    entry: SyncProtocolWithNetwork,
    resolved: ResolvedStart,
  ): StartPolicyProjection {
    const syncProtocol = entry.syncProtocol as unknown as MidnightProtocol;
    const validated: StartPolicySnapshotFields = {};
    const restored: StartPolicySnapshotFields = {
      [PROVENANCE_KEY]: resolved.provenance,
    };
    if (syncProtocol.startBlockHeight === "latest") {
      restored["startBlockHeight"] = resolved.startBlockHeight;
    } else {
      validated["startBlockHeight"] = resolved.startBlockHeight;
    }
    return { validated, restored };
  },

  applySnapshot(
    entry: SyncProtocolWithNetwork,
    snapshot: StartPolicySnapshotFields,
  ): void {
    if ("startBlockHeight" in snapshot) {
      (entry.syncProtocol as unknown as Record<string, unknown>)[
        "startBlockHeight"
      ] = snapshot["startBlockHeight"];
    }
  },
};
