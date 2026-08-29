import type { MergeIntersects, RemoveUnknown } from "@effectstream/utils";
import type { Static } from "@sinclair/typebox";
import {
  type ConfigSyncProtocolAll,
  decoratorSyncProtocolTypes,
  ConfigSyncProtocolDecorator,
  ConfigSyncProtocolMain,
  ConfigSyncProtocolParallel,
  mainSyncProtocolTypes,
  type MaterializedFromRegistry,
  materializeDiscriminated,
  parallelSyncProtocolTypes,
  type SyncProtocolFromNetwork,
} from "../../schema/mod.ts";
import type {
  NetworkBuilderData,
  NetworkList,
  NetworkValues,
} from "./network.ts";
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
type MaterializedMain<Config extends MainSyncProtocolConfig<false>> =
  MaterializedFromRegistry<
    typeof mainSyncProtocolTypes,
    Config
  >;
type MaterializedParallel<Config extends ParallelSyncProtocolConfig<false>> =
  MaterializedFromRegistry<
    typeof parallelSyncProtocolTypes,
    Config
  >;
type MaterializedDecorator<
  Config extends DecoratorSyncProtocolConfig<false>,
> = MaterializedFromRegistry<
  typeof decoratorSyncProtocolTypes,
  Config
>;
export type SyncProtocolShape = Readonly<{
  name: string;
  type: string;
}>;

export type SyncProtocolEntry<
  Network extends string = string,
  SyncProtocolType extends SyncProtocolShape = SyncProtocolConfig,
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
  Type extends SyncProtocolShape,
> = Record<
  string,
  SyncProtocolEntry<NetworkValues<Networks>["name"], Type>
>;

export type PreBuildSyncProtocolBuilderData<
  Networks extends NetworkList = {},
  Main extends
    | undefined
    | SyncProtocolEntry<
      NetworkValues<Networks>["name"],
      SyncProtocolShape
    > = undefined,
  Parallel extends SyncProtocolList<Networks, SyncProtocolShape> = {},
  Decorator extends Record<string, SyncProtocolShape> = {},
> = {
  main: Main;
  parallel: Parallel;
  decorators: Decorator;
};

export type PostBuildSyncProtocolBuilderData<
  Networks extends NetworkList = {},
> = {
  main: SyncProtocolEntry<
    NetworkValues<Networks>["name"],
    MainSyncProtocolConfig
  >;
  parallel: SyncProtocolList<Networks, ParallelSyncProtocolConfig>;
  decorators: SyncProtocolDecoratorList;
};

export type AnySyncProtocolList = Record<
  string,
  SyncProtocolEntry<string, SyncProtocolShape>
>;

export type AnyPostBuildSyncProtocolBuilderData = {
  main: SyncProtocolEntry<string, SyncProtocolShape>;
  parallel: AnySyncProtocolList;
  decorators: Record<string, SyncProtocolShape>;
};

function defineOwnEnumerableDataProperty(
  target: Record<PropertyKey, unknown>,
  key: PropertyKey,
  value: unknown,
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    configurable: true,
    writable: true,
  });
}

export type NetworkSyncProtocols<
  T extends AnyPostBuildSyncProtocolBuilderData,
> =
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
      NetworkValues<Networks>["name"],
      SyncProtocolShape
    > = undefined,
  const Parallel extends SyncProtocolList<
    Networks,
    SyncProtocolShape
  > = {},
  const Decorator extends Record<string, SyncProtocolShape> = {},
> {
  readonly #builderIdentity = true;
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
      const Network extends NetworkValues<Networks>,
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
        MaterializedMain<NewMain>
      >,
      Parallel,
      Decorator
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = genSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const withDefaults = materializeDiscriminated(
        mainSyncProtocolTypes,
        syncProtocol,
      );
      (this.data.main as any) = {
        network: network.name,
        syncProtocol: withDefaults,
      } satisfies SyncProtocolEntry<
        Network["name"],
        MaterializedMain<NewMain>
      >;
      return this as any;
    },
  });

  addParallel = onlyValue({
    value: () => this.data.main,
    target: () => ({}) as NonNullable<Main>,
    name: "main",
    build: <
      const Network extends NetworkValues<Networks>,
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
          MaterializedParallel<NewParallel>
        >
      >,
      Decorator
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = getSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const withDefaults = materializeDiscriminated(
        parallelSyncProtocolTypes,
        syncProtocol,
      );
      defineOwnEnumerableDataProperty(
        this.data.parallel as any,
        withDefaults.name,
        {
          network: network.name,
          syncProtocol: withDefaults,
        } satisfies SyncProtocolEntry<
          Network["name"],
          MaterializedParallel<NewParallel>
        >,
      );
      return this as any;
    },
  });

  addDecorator = onlyValue({
    value: () => this.data.main,
    target: () => ({}) as NonNullable<Main>,
    name: "main",
    build: <
      const Network extends NetworkValues<Networks>,
      const NewDecorator extends DecoratorSyncProtocolConfig<false>,
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
        MaterializedDecorator<NewDecorator>
      >
    > => {
      const network = genNetwork(this.networks.networks);
      const syncProtocol = getSyncProtocol(
        network,
        (this.deployedAddresses.deployedAddresses as any)[network.name],
      );
      const withDefaults = materializeDiscriminated(
        decoratorSyncProtocolTypes,
        syncProtocol,
      );
      defineOwnEnumerableDataProperty(
        this.data.decorators as any,
        withDefaults.name,
        withDefaults,
      );
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
