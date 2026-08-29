import type { MergeIntersects, RemoveUnknown } from "@effectstream/utils";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  type ConfigSyncProtocolAll,
  type ConfigSchema,
  type ConfigSyncProtocolMappingDecorator,
  type ConfigSyncProtocolMappingMain,
  type ConfigSyncProtocolMappingParallel,
  decoratorSyncProtocolTypes,
  ConfigSyncProtocolDecorator,
  ConfigSyncProtocolMain,
  ConfigSyncProtocolParallel,
  ConfigSyncProtocolType,
  mainSyncProtocolTypes,
  type MaterializedFromRegistry,
  materializeDiscriminated,
  parallelSyncProtocolTypes,
  type NetworkTypeFromSyncProtocol,
  SyncProtocolToNetwork,
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

type MatchesMainMapping<SyncProtocol extends SyncProtocolShape> =
  IsNever<SyncProtocol> extends true ? false
  : HasNeverProperty<SyncProtocol> extends true ? false
  : IsNever<SyncProtocol["type"]> extends true ? false
  : SyncProtocol["type"] extends keyof ConfigSyncProtocolMappingMain
    ? SyncProtocol extends ConfigSyncProtocolMappingMain[SyncProtocol["type"]]
      ? true
    : false
  : false;
type MatchesParallelMapping<SyncProtocol extends SyncProtocolShape> =
  IsNever<SyncProtocol> extends true ? false
  : HasNeverProperty<SyncProtocol> extends true ? false
  : IsNever<SyncProtocol["type"]> extends true ? false
  : SyncProtocol["type"] extends keyof ConfigSyncProtocolMappingParallel
    ? SyncProtocol extends
        ConfigSyncProtocolMappingParallel[SyncProtocol["type"]] ? true
    : false
  : false;
type MatchesDecoratorMapping<SyncProtocol extends SyncProtocolShape> =
  IsNever<SyncProtocol> extends true ? false
  : HasNeverProperty<SyncProtocol> extends true ? false
  : IsNever<SyncProtocol["type"]> extends true ? false
  : SyncProtocol["type"] extends keyof ConfigSyncProtocolMappingDecorator
    ? SyncProtocol extends
        ConfigSyncProtocolMappingDecorator[SyncProtocol["type"]] ? true
    : false
  : false;
type IsNever<T> = [T] extends [never] ? true : false;
type NeverPropertyKeys<T> = {
  [K in keyof T]-?: IsNever<T[K]> extends true ? K : never;
}[keyof T];
type HasNeverPropertyInMember<T> = T extends unknown
  ? [NeverPropertyKeys<T>] extends [never] ? false : true
  : never;
type HasNeverProperty<T> = true extends HasNeverPropertyInMember<T> ? true
  : false;
type AllNetworkKeys<Networks extends NetworkList> = Networks extends unknown
  ? keyof Networks & string
  : never;
type NetworkForName<
  Networks extends NetworkList,
  Network extends AllNetworkKeys<Networks>,
> = Networks extends unknown ? Network extends keyof Networks
    ? Networks[Network]
  : never
  : never;
type EveryNetworkVariantMatches<
  Networks extends NetworkList,
  Network extends AllNetworkKeys<Networks>,
  SyncProtocol extends SyncProtocolShape,
> = SyncProtocol["type"] extends ConfigSyncProtocolType
  ? [NetworkForName<Networks, Network>["type"]] extends [
    NetworkTypeFromSyncProtocol<SyncProtocol["type"]>
  ] ? true
  : false
  : false;
type IsValidMainEntry<
  Networks extends NetworkList,
  Entry,
> = IsNever<Entry> extends true ? false
  : HasNeverProperty<Entry> extends true ? false
  : Entry extends SyncProtocolEntry<infer Network, infer SyncProtocol>
  ? IsNever<Network> extends true ? false
  : IsNever<SyncProtocol> extends true ? false
  : Network extends AllNetworkKeys<Networks>
    ? IsNever<NetworkForName<Networks, Network>["type"]> extends true ? false
    : MatchesMainMapping<SyncProtocol> extends true
      ? SyncProtocol["type"] extends SyncProtocolFromNetwork<
          NetworkForName<Networks, Network>["type"]
        > ? EveryNetworkVariantMatches<
            Networks,
            Network,
            SyncProtocol
          >
      : false
    : false
  : false
  : false;
type IsValidParallelEntry<
  Networks extends NetworkList,
  Entry,
> = IsNever<Entry> extends true ? false
  : HasNeverProperty<Entry> extends true ? false
  : Entry extends SyncProtocolEntry<infer Network, infer SyncProtocol>
  ? IsNever<Network> extends true ? false
  : IsNever<SyncProtocol> extends true ? false
  : Network extends AllNetworkKeys<Networks>
    ? IsNever<NetworkForName<Networks, Network>["type"]> extends true ? false
    : MatchesParallelMapping<SyncProtocol> extends true
      ? SyncProtocol["type"] extends SyncProtocolFromNetwork<
          NetworkForName<Networks, Network>["type"]
        > ? EveryNetworkVariantMatches<
            Networks,
            Network,
            SyncProtocol
          >
      : false
    : false
  : false
  : false;
type IsValidDecorator<SyncProtocol> =
  IsNever<SyncProtocol> extends true ? false
  : SyncProtocol extends SyncProtocolShape
    ? MatchesDecoratorMapping<SyncProtocol>
  : false;
type InvalidParallelKeys<
  Networks extends NetworkList,
  Data extends AnyPostBuildSyncProtocolBuilderData,
> = {
  [K in keyof Data["parallel"]]: IsValidParallelEntry<
    Networks,
    Data["parallel"][K]
  > extends true ? never : K;
}[keyof Data["parallel"]];
type InvalidDecoratorKeys<Data extends AnyPostBuildSyncProtocolBuilderData> = {
  [K in keyof Data["decorators"]]: IsValidDecorator<
    Data["decorators"][K]
  > extends true ? never : K;
}[keyof Data["decorators"]];

export type ValidatePostBuildSyncProtocolBuilderData<
  Networks extends NetworkList,
  Data extends AnyPostBuildSyncProtocolBuilderData,
> = IsNever<Data["parallel"]> extends true ? never
  : HasNeverProperty<Data["parallel"]> extends true ? never
  : IsNever<Data["decorators"]> extends true ? never
  : HasNeverProperty<Data["decorators"]> extends true ? never
  : IsValidMainEntry<Networks, Data["main"]> extends true
  ? [InvalidParallelKeys<Networks, Data>] extends [never]
    ? [InvalidDecoratorKeys<Data>] extends [never] ? unknown : never
  : never
  : never;

function isDataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

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

function assertMaterializedProtocol(
  registry: Record<string, ConfigSchema<any, any, any>>,
  protocol: unknown,
  location: string,
): asserts protocol is SyncProtocolShape {
  if (!isDataRecord(protocol) || !Object.hasOwn(protocol, "type")) {
    throw new Error(`Invalid sync protocol builder result at ${location}`);
  }
  const type = (protocol as { type?: unknown }).type;
  const schema = typeof type === "string" && Object.hasOwn(registry, type)
    ? registry[type]
    : undefined;
  const requiredKeys = schema === undefined ? [] : [
    ...(schema.config.required.required ?? []),
    ...(schema.config.optional.required ?? []),
  ];
  if (schema === undefined ||
    requiredKeys.some((key) => !Object.hasOwn(protocol, key)) ||
    !Value.Check(schema.allProperties(true), protocol)) {
    throw new Error(`Invalid sync protocol builder result at ${location}`);
  }
}

export function assertValidPostBuildSyncProtocolBuilderData(
  networks: NetworkList,
  data: unknown,
): void {
  if (!isDataRecord(networks) || !isDataRecord(data) ||
    !Object.hasOwn(data, "main") || !Object.hasOwn(data, "parallel") ||
    !Object.hasOwn(data, "decorators")) {
    throw new Error("Invalid sync protocol builder result");
  }
  const checkNetworked = (
    entry: unknown,
    registry: Record<string, ConfigSchema<any, any, any>>,
    location: string,
  ): void => {
    if (!isDataRecord(entry) || !Object.hasOwn(entry, "network") ||
      typeof entry.network !== "string" ||
      !Object.hasOwn(entry, "syncProtocol") ||
      !Object.hasOwn(networks, entry.network)) {
      throw new Error(`Invalid sync protocol builder result at ${location}`);
    }
    assertMaterializedProtocol(registry, entry.syncProtocol, location);
    const network = networks[entry.network];
    if (!isDataRecord(network) || !Object.hasOwn(network, "type")) {
      throw new Error(`Invalid sync protocol builder result at ${location}`);
    }
    const expectedNetworkType = SyncProtocolToNetwork[
      entry.syncProtocol.type as ConfigSyncProtocolType
    ];
    if (expectedNetworkType === undefined ||
      network.type !== expectedNetworkType) {
      throw new Error(`Invalid sync protocol builder result at ${location}`);
    }
  };

  checkNetworked(data.main, mainSyncProtocolTypes, "main");
  if (!isDataRecord(data.parallel) || !isDataRecord(data.decorators)) {
    throw new Error("Invalid sync protocol builder result collections");
  }
  for (const [name, entry] of Object.entries(data.parallel)) {
    checkNetworked(entry, parallelSyncProtocolTypes, `parallel.${name}`);
    if (!isDataRecord(entry) || !isDataRecord(entry.syncProtocol) ||
      entry.syncProtocol.name !== name) {
      throw new Error(`Invalid sync protocol builder result at parallel.${name}`);
    }
  }
  for (const [name, protocol] of Object.entries(data.decorators)) {
    assertMaterializedProtocol(
      decoratorSyncProtocolTypes,
      protocol,
      `decorators.${name}`,
    );
    if (protocol.name !== name) {
      throw new Error(`Invalid sync protocol builder result at decorators.${name}`);
    }
  }
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
