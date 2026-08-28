import type { RemoveUnknown } from "@effectstream/utils";
import type { NetworkBuilderData, NetworkList } from "./network.ts";
import type {
  DeployedAddressesBuilderData,
  DeployedAddressesList,
} from "./deployedAddresses.ts";
import type { SyncProtocolConfig, SyncProtocolList } from "./syncProtocols.ts";

type PrimitiveConfig = {};

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
  data: {
    primitives: Record<
      string,
      PrimitiveEntry<
        SyncProtocols[string]["syncProtocol"]["name"],
        PrimitiveConfig
      >
    >;
  };

  constructor(
    readonly networks: NetworkBuilderData<Networks, any>,
    readonly deployedAddresses: DeployedAddressesBuilderData<
      Networks,
      DeployedAddresses
    >,
    readonly syncProtocols: SyncProtocols,
  ) {
    this.data = {
      primitives: {},
    };
  }

  // @bound
  addPrimitive<
    const SyncProtocol extends SyncProtocols[string],
    const NewPrimitive extends {
      name: string;
      type: string;
      /** Defaults to the owning protocol's resolved numeric start. */
      startBlockHeight?: number;
    }, // TODO This is the format from Primitive.getConfig()
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
        NewPrimitive & PrimitiveConfig
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

    this.data.primitives[primitive.name] = {
      syncProtocol: syncProtocol.syncProtocol.name,
      primitive: primitive,
    } satisfies PrimitiveEntry<
      SyncProtocol["syncProtocol"]["name"],
      & NewPrimitive
      & PrimitiveConfig
    >;
    return this as any;
  }

  // @bound
  build(): typeof this.data {
    return this.data;
  }
}
