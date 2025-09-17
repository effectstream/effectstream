import type { MergeIntersects, RemoveUnknown } from "@paima/utils";
import type { StaticDecode } from "@sinclair/typebox";
import {
  ConfigPrimitiveAll,
  type PrimitivesForSyncProtocol,
} from "../../schema/mod.ts";
import type { NetworkBuilderData, NetworkList } from "./network.ts";
import type {
  DeployedAddressesBuilderData,
  DeployedAddressesList,
} from "./deployedAddresses.ts";
import type { SyncProtocolConfig, SyncProtocolList } from "./syncProtocols.ts";
import { Value } from "@sinclair/typebox/value";
// import { bound } from "@paima/utils";

export type PrimitiveConfig<RequireDefaults extends boolean = true> =
  MergeIntersects<
    StaticDecode<ReturnType<typeof ConfigPrimitiveAll<RequireDefaults>>>
  >;

type PrimitiveEntry<SyncProtocol extends string, PrimitiveConfig> = {
  syncProtocol: SyncProtocol;
  primitive: PrimitiveConfig;
};
export type PrimitiveList<
  Networks extends NetworkList,
  SyncProtocols extends SyncProtocolList<Networks, SyncProtocolConfig>,
  Primitive extends PrimitiveConfig,
> = Partial<
  Record<
    string,
    PrimitiveEntry<
      SyncProtocols[string]["syncProtocol"]["name"],
      Primitive
    >
  >
>;
export type PrimitiveBuilderData<
  Networks extends NetworkList = {},
  SyncProtocols extends SyncProtocolList<Networks, SyncProtocolConfig> = {},
  Primitives extends PrimitiveList<
    Networks,
    SyncProtocols,
    PrimitiveConfig
  > = {},
> = {
  primitives: Primitives;
};

export class PrimitiveBuilder<
  const Networks extends NetworkList = {},
  const DeployedAddresses extends DeployedAddressesList<Networks> = {},
  const SyncProtocols extends SyncProtocolList<Networks, SyncProtocolConfig> =
    {},
  const Primitives extends PrimitiveList<
    Networks,
    SyncProtocols,
    PrimitiveConfig
  > = {},
> {
  data: PrimitiveBuilderData<Networks, SyncProtocols, Primitives>;

  constructor(
    readonly networks: NetworkBuilderData<Networks, any>,
    readonly deployedAddresses: DeployedAddressesBuilderData<
      Networks,
      DeployedAddresses
    >,
    readonly syncProtocols: SyncProtocols,
  ) {
    this.data = {
      primitives: {} as Primitives,
    };
  }

  // @bound
  addPrimitive<
    const SyncProtocol extends SyncProtocols[string],
    const NewPrimitive extends PrimitivesForSyncProtocol<
      SyncProtocol["syncProtocol"]["type"],
      false
    >,
  >(
    genSyncProtocol: (syncProtocol: SyncProtocols) => SyncProtocol,
    genPrimitive: (
      network: Networks[SyncProtocol["network"]],
      deployments: RemoveUnknown<DeployedAddresses[SyncProtocol["network"]]>,
      syncProtocol: SyncProtocol,
    ) => NewPrimitive,
  ): PrimitiveBuilder<
    Networks,
    DeployedAddresses,
    SyncProtocols,
    & Primitives
    & Record<
      string, // NewPrimitive["name"],
      PrimitiveEntry<
        SyncProtocol["syncProtocol"]["name"],
        NewPrimitive & PrimitiveConfig<true>
      >
    >
  > {
    const syncProtocol = genSyncProtocol(this.syncProtocols);
    const primitive = genPrimitive(
      this.networks.networks[syncProtocol.network],
      (this.deployedAddresses.deployedAddresses as any)[
        syncProtocol.network
      ],
      syncProtocol,
    );
    const withDefaults = Value.Default(ConfigPrimitiveAll(true), primitive) as
      & NewPrimitive
      & PrimitiveConfig<true>;

    (this.data.primitives as any)[withDefaults.name] = {
      syncProtocol: syncProtocol.syncProtocol.name,
      primitive: withDefaults,
    } satisfies PrimitiveEntry<
      SyncProtocol["syncProtocol"]["name"],
      & NewPrimitive
      & PrimitiveConfig<true>
    >;
    return this as any;
  }

  // @bound
  build(): typeof this.data {
    return this.data;
  }
}
