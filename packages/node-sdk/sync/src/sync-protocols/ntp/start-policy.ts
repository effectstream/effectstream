import type { SyncProtocolWithNetwork } from "@effectstream/config";
import { getNtpTip } from "./tip.ts";
import type {
  ResolvedStart,
  StartPolicyProjection,
  StartPolicySnapshotFields,
  SyncProtocolStartPolicy,
} from "../start-policy.ts";

// Only types are imported from `../start-policy.ts`: that module imports this
// one to build the registry, so a value import would close a runtime cycle.
const PROVENANCE_KEY = "startBlockHeightProvenance";

type NtpNetwork = {
  startTime: number;
  blockTimeMS: number;
  servers?: readonly string[];
};

type NtpProtocol = {
  startBlockHeight: number | "latest";
  requestTimeoutMs?: number;
};

/**
 * Start policy for the NTP main protocol.
 *
 * NTP blocks are pure arithmetic over `network.startTime` and
 * `network.blockTimeMS`, so those two fields are **restored** rather than
 * mismatch-checked: `startTime` defaults to `Date.now()` sampled at
 * `addNetwork`, so a rebuilt config differs on every single boot, and the saved
 * mapping must win or previously synced blocks would be remapped in time.
 * (Consequence, accepted by design: an intentionally changed explicit
 * `startTime` is adopted with a warning instead of aborting startup.)
 */
export const ntpStartPolicy: SyncProtocolStartPolicy = {
  async resolveLatest(entry: SyncProtocolWithNetwork): Promise<number> {
    const network = entry.network as unknown as NtpNetwork;
    const syncProtocol = entry.syncProtocol as unknown as NtpProtocol;
    const { height } = await getNtpTip({
      startTime: network.startTime,
      blockTimeMS: network.blockTimeMS,
      ...(network.servers !== undefined ? { servers: network.servers } : {}),
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
    const network = entry.network as unknown as NtpNetwork;
    const syncProtocol = entry.syncProtocol as unknown as NtpProtocol;
    const validated: StartPolicySnapshotFields = {};
    const restored: StartPolicySnapshotFields = {
      startTime: network.startTime,
      blockTimeMS: network.blockTimeMS,
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
    const network = entry.network as unknown as Record<string, unknown>;
    if ("startTime" in snapshot) network["startTime"] = snapshot["startTime"];
    if ("blockTimeMS" in snapshot) {
      network["blockTimeMS"] = snapshot["blockTimeMS"];
    }
    if ("startBlockHeight" in snapshot) {
      (entry.syncProtocol as unknown as Record<string, unknown>)[
        "startBlockHeight"
      ] = snapshot["startBlockHeight"];
    }
  },
};
