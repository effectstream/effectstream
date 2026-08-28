import type { MergeIntersects, RemoveUnknown } from "@effectstream/utils";
import type { Static } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolAll,
  ConfigNetworkType,
  ConfigSyncProtocolDecorator,
  ConfigSyncProtocolMain,
  ConfigSyncProtocolParallel,
  ConfigSyncProtocolType,
  type SyncProtocolFromNetwork,
} from "../../schema/mod.ts";
import { Value } from "@sinclair/typebox/value";
import type { NetworkBuilderData, NetworkList } from "./network.ts";
import type {
  DeployedAddressesBuilderData,
  DeployedAddressesList,
} from "./deployedAddresses.ts";
import { onlyOnce, onlyValue } from "../utils.ts";
import { resolveMidnightNetworkProfile } from "../../midnight-network-profile.ts";

export type MainSyncProtocolConfig<RequireDefaults extends boolean = true> =
  MergeIntersects<
    Static<ReturnType<typeof ConfigSyncProtocolMain<RequireDefaults>>>
  >;
export type ParallelSyncProtocolConfig<RequireDefaults extends boolean = true> =
  MergeIntersects<
    Static<ReturnType<typeof ConfigSyncProtocolParallel<RequireDefaults>>>
  >;
export type DecoratorSyncProtocolConfig<
  RequireDefaults extends boolean = true,
> = MergeIntersects<
  Static<ReturnType<typeof ConfigSyncProtocolDecorator<RequireDefaults>>>
>;
export type SyncProtocolConfig<RequireDefaults extends boolean = true> =
  MergeIntersects<
    Static<ReturnType<typeof ConfigSyncProtocolAll<RequireDefaults>>>
  >;

type WithOptionalFields<Config, Fields extends keyof Config> =
  & Omit<Config, Fields>
  & Partial<Pick<Config, Fields>>;

type ParallelSyncProtocolBuilderInput =
  | WithOptionalFields<
    Extract<
      ParallelSyncProtocolConfig<false>,
      { type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL }
    >,
    "indexer"
  >
  | Exclude<
    ParallelSyncProtocolConfig<false>,
    { type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL }
  >;

type ValueOrDefault<
  Config,
  Field extends PropertyKey,
  Default,
> = Config extends Record<Field, infer Value> ? Value : Default;

type NormalizedSyncProtocol<Protocol> = & Protocol
  & (Protocol extends { type: ConfigSyncProtocolType.NTP_MAIN } ? {
      pollingInterval: ValueOrDefault<Protocol, "pollingInterval", 1_000>;
    }
    : Protocol extends { type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL } ? {
        pollingInterval: ValueOrDefault<Protocol, "pollingInterval", 6_000>;
        indexer: ValueOrDefault<Protocol, "indexer", string>;
      }
    : {});

function normalizeProtocolDefaults<
  Network extends NetworkList[keyof NetworkList],
  Protocol extends { type: ConfigSyncProtocolType },
>(network: Network, protocol: Protocol) {
  if (
    network.type === ConfigNetworkType.NTP &&
    protocol.type === ConfigSyncProtocolType.NTP_MAIN
  ) {
    const pollingInterval =
      "pollingInterval" in protocol &&
        typeof protocol.pollingInterval === "number"
        ? protocol.pollingInterval
        : 1_000;
    return { ...protocol, pollingInterval };
  }

  if (
    network.type === ConfigNetworkType.MIDNIGHT &&
    protocol.type === ConfigSyncProtocolType.MIDNIGHT_PARALLEL
  ) {
    const pollingInterval =
      "pollingInterval" in protocol &&
        typeof protocol.pollingInterval === "number"
        ? protocol.pollingInterval
        : 6_000;
    const indexer = "indexer" in protocol &&
        typeof protocol.indexer === "string"
      ? protocol.indexer
      : resolveMidnightNetworkProfile(network.networkId).indexerHttpUrl;
    return { ...protocol, pollingInterval, indexer };
  }

  return protocol;
}

export type SyncProtocolEntry<
  Network extends string = string,
  SyncProtocolType extends SyncProtocolConfig = SyncProtocolConfig,
> = Readonly<{
  network: Network;
  syncProtocol: Readonly<SyncProtocolType>;
}>;
export type SyncProtocolDecoratorList = Record<
  string,
  DecoratorSyncProtocolConfig<true>
>;
export type SyncProtocolList<
  Networks extends NetworkList,
  Type extends SyncProtocolConfig,
> = Record<
  string,
  SyncProtocolEntry<Networks[keyof Networks]["name"], Type>
>;

export type PreBuildSyncProtocolBuilderData<
  Networks extends NetworkList = {},
  Main extends
    | undefined
    | SyncProtocolEntry<
      Networks[keyof Networks]["name"],
      MainSyncProtocolConfig
    > = undefined,
  Parallel extends SyncProtocolList<Networks, ParallelSyncProtocolConfig> = {},
  Decorator extends SyncProtocolDecoratorList = {},
> = {
  main: Main;
  parallel: Parallel;
  decorators: Decorator;
};

export type PostBuildSyncProtocolBuilderData<
  Networks extends NetworkList = {},
> = {
  main: SyncProtocolEntry<
    Networks[keyof Networks]["name"],
    MainSyncProtocolConfig
  >;
  parallel: SyncProtocolList<Networks, ParallelSyncProtocolConfig>;
  decorators: SyncProtocolDecoratorList;
};

export type NetworkSyncProtocols<T extends PostBuildSyncProtocolBuilderData> =
  & Record<
    NonNullable<T["main"]>["syncProtocol"]["name"],
    NonNullable<T["main"]>
  >
  & T["parallel"];

export class SyncProtocolBuilder<
  const Networks extends NetworkList = {},
  const DeployedAddresses extends DeployedAddressesList<Networks> = {},
  const Main extends
    | undefined
    | SyncProtocolEntry<
      Networks[keyof Networks]["name"],
      MainSyncProtocolConfig
    > = undefined,
  const Parallel extends SyncProtocolList<
    Networks,
    ParallelSyncProtocolConfig
  > = {},
  const Decorator extends SyncProtocolDecoratorList = {},
> {
  data: PreBuildSyncProtocolBuilderData<Networks, Main, Parallel, Decorator>;

  constructor(
    readonly networks: NetworkBuilderData<Networks, any>,
    readonly deployedAddresses: DeployedAddressesBuilderData<
      Networks,
      DeployedAddresses
    >,
  ) {
    this.data = {
      main: {} as Main,
      parallel: {} as Parallel,
      decorators: {} as Decorator,
    };
  }

  addMain = onlyOnce({
    key: () => this.data.main,
    name: "main",
    build: <
      const Network extends Networks[keyof Networks],
      const NewMain extends MainSyncProtocolConfig<false> & {
        type: SyncProtocolFromNetwork<Network["type"]>;
      },
    >(
      genNetwork: (networks: Networks) => Network,
      genSyncProtocol: (
        network: Network,
        deployments: RemoveUnknown<DeployedAddresses[Network["name"]]>,
      ) => NewMain,
    ): SyncProtocolBuilder<
      Networks,
      DeployedAddresses,
      SyncProtocolEntry<
        Network["name"],
        MergeIntersects<
          NormalizedSyncProtocol<NewMain> &
            MainSyncProtocolConfig<true>
        >
      >,
      Parallel,
      Decorator
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = genSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const normalized = normalizeProtocolDefaults(network, syncProtocol);
      const withDefaults = Value.Default(
        ConfigSyncProtocolMain(true),
        normalized,
      ) as NormalizedSyncProtocol<NewMain> &
        MainSyncProtocolConfig<true>;
      (this.data.main as any) = {
        network: network.name,
        syncProtocol: withDefaults,
      } satisfies SyncProtocolEntry<
        Network["name"],
        NormalizedSyncProtocol<NewMain> & MainSyncProtocolConfig<true>
      >;
      return this as any;
    },
  });

  addParallel = onlyValue({
    value: () => this.data.main,
    target: () => ({}) as NonNullable<Main>,
    name: "main",
    build: <
      const Network extends Networks[keyof Networks],
      const NewParallel extends ParallelSyncProtocolBuilderInput & {
        type: SyncProtocolFromNetwork<Network["type"]>;
      },
    >(
      genNetwork: (networks: Networks) => Network,
      getSyncProtocol: (
        network: Network,
        deployments: RemoveUnknown<DeployedAddresses[Network["name"]]>,
      ) => NewParallel,
    ): SyncProtocolBuilder<
      Networks,
      DeployedAddresses,
      Main,
      & Parallel
      & Record<
        NewParallel["name"],
        SyncProtocolEntry<
          Network["name"],
          MergeIntersects<
            NormalizedSyncProtocol<NewParallel> &
              ParallelSyncProtocolConfig<true>
          >
        >
      >,
      Decorator
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = getSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const normalized = normalizeProtocolDefaults(network, syncProtocol);
      const withDefaults = Value.Default(
        ConfigSyncProtocolParallel(true),
        normalized,
      ) as NormalizedSyncProtocol<NewParallel> &
        ParallelSyncProtocolConfig<true>;
      (this.data.parallel as any)[syncProtocol.name] = {
        network: network.name,
        syncProtocol: withDefaults,
      } satisfies SyncProtocolEntry<
        Network["name"],
        NormalizedSyncProtocol<NewParallel> &
          ParallelSyncProtocolConfig<true>
      >;
      return this as any;
    },
  });

  addDecorator = onlyValue({
    value: () => this.data.main,
    target: () => ({}) as NonNullable<Main>,
    name: "main",
    build: <
      const Network extends Networks[keyof Networks],
      const NewDecorator extends DecoratorSyncProtocolConfig<false> & {
        type: SyncProtocolFromNetwork<Network["type"]>;
      },
    >(
      genNetwork: (networks: Networks) => Network,
      getSyncProtocol: (
        network: Network,
        deployments: DeployedAddresses[Network["name"]],
      ) => NewDecorator,
    ): SyncProtocolBuilder<
      Networks,
      DeployedAddresses,
      Main,
      Parallel,
      & Decorator
      & Record<
        NewDecorator["name"],
        MergeIntersects<NewDecorator & DecoratorSyncProtocolConfig<true>>
      >
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = getSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const withDefaults = Value.Default(
        ConfigSyncProtocolDecorator(true),
        syncProtocol,
      ) as NewDecorator & DecoratorSyncProtocolConfig<true>;
      (this.data.decorators as any)[syncProtocol.name] = withDefaults;
      return this as any;
    },
  });

  build = onlyValue({
    value: () => this.data.main,
    target: () => ({}) as NonNullable<Main>,
    name: "main",
    build: (): typeof this.data => {
      return this.data as any;
    },
  });
}
