import type { MergeIntersects, RemoveUnknown } from "@paima/utils";
import type { Static } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolAll,
  ConfigSyncProtocolDecorator,
  ConfigSyncProtocolMain,
  ConfigSyncProtocolParallel,
  type SyncProtocolFromNetwork,
} from "../../schema/index.ts";
import { Value } from "@sinclair/typebox/value";
import type { NetworkBuilderData, NetworkList } from "./network.ts";
import type {
  DeployedAddressesBuilderData,
  DeployedAddressesList,
} from "./deployedAddresses.ts";
import { onlyOnce, onlyValue } from "../utils.ts";

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
        MergeIntersects<NewMain & MainSyncProtocolConfig<true>>
      >,
      Parallel,
      Decorator
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = genSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const withDefaults = Value.Default(
        ConfigSyncProtocolMain(true),
        syncProtocol,
      ) as NewMain & MainSyncProtocolConfig<true>;
      (this.data.main as any) = {
        network: network.name,
        syncProtocol: withDefaults,
      } satisfies SyncProtocolEntry<
        Network["name"],
        NewMain & MainSyncProtocolConfig<true>
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
      const NewParallel extends ParallelSyncProtocolConfig<false> & {
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
          MergeIntersects<NewParallel & ParallelSyncProtocolConfig<true>>
        >
      >,
      Decorator
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = getSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const withDefaults = Value.Default(
        ConfigSyncProtocolParallel(true),
        syncProtocol,
      ) as NewParallel & ParallelSyncProtocolConfig<true>;
      (this.data.parallel as any)[syncProtocol.name] = {
        network: network.name,
        syncProtocol: withDefaults,
      } satisfies SyncProtocolEntry<
        Network["name"],
        NewParallel & ParallelSyncProtocolConfig<true>
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
