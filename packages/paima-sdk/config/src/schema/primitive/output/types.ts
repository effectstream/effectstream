import type { StaticDecode, TLiteral, TObject } from "@sinclair/typebox";
import type { ConfigSyncProtocolType } from "../../sync-protocols/types.ts";
import type { PrimitivesTypesForSyncProtocol } from "../config/types.ts";
import type { PrimitiveToDatum } from "./all.ts";
import type { IntersectObject, MergeIntersects, ValueOf } from "@paima/utils";
import type {
  ConfigSyncProtocolCommonAll,
  ConfigSyncProtocolCommonResponseAll,
} from "../../sync-protocols/all.ts";
import type { SyncProtocolConfig } from "../../../config/parts/syncProtocols.ts";

// TODO
// Should these match the EVM ABI Events?
export enum ConfigPrimitivePayloadType {
  Transfer = "Transfer",
  PaimaL2Event = "PaimaGameInteraction",
  Deposit = "deposit",
  Mint = "mint",
  MintOrBurn = "mint-or-burn",
  Event = "event",
  Registry = "registry",
  Delegate = "delegate",
  Projection = "projection",
}

// NOTE: returns never for sync protocols with no primitives
type FilterForPrimitive<Obj, FilterKey> = Obj extends
  TObject<{ primitive: TLiteral<infer T> }> ? T extends FilterKey ? Obj
  : never
  : never;

type AddSyncProtocolCommonResponse<
  SyncProtocol extends ConfigSyncProtocolType,
  Val,
> = Val extends unknown ? IntersectObject<
    Val,
    { syncProtocol: (typeof ConfigSyncProtocolCommonResponseAll)[SyncProtocol] }
  >
  : never;
export type ResponseForSyncProtocol<
  SyncProtocol extends ConfigSyncProtocolType,
> = SyncProtocol extends unknown ? AddSyncProtocolCommonResponse<
    SyncProtocol,
    FilterForPrimitive<
      (typeof PrimitiveToDatum)[number],
      ValueOf<PrimitivesTypesForSyncProtocol<SyncProtocol>>
    >
  >
  : never;

/**
 * Typescript struggles to realize the sync protocol & payload field generic types are correlated
 * This type helps overcome this by explicitly correlating them
 */
export type MergeResponseResult<
  SyncProtocolType extends ConfigSyncProtocolType,
  Base,
> = MergeIntersects<
  Base & {
    syncProtocol: StaticDecode<
      (typeof ConfigSyncProtocolCommonResponseAll)[SyncProtocolType]
    >;
  }
>;

export function mergeResponseOutput<
  const SyncProtocolType extends ConfigSyncProtocolType,
  Base,
>(
  syncProtocol: SyncProtocolConfig & { type: SyncProtocolType },
  base: Base,
  data: StaticDecode<ConfigSyncProtocolCommonAll[SyncProtocolType]> & object,
): MergeResponseResult<SyncProtocolType, Base> {
  return {
    ...base,
    syncProtocol: {
      type: syncProtocol.type,
      name: syncProtocol.name,
      ...data,
    },
  } as any;
}
