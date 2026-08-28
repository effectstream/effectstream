import type { MergeIntersects } from "@effectstream/utils";
import type { Static } from "@sinclair/typebox";
import {
  ConfigNetworkAll,
  ConfigNetworkType,
  type MapNetworkTypes,
  viemToConfigNetwork,
} from "../../schema/mod.ts";
import type { Chain, ChainFormatters } from "viem";
import { Value } from "@sinclair/typebox/value";
// import { bound } from "@effectstream/utils";

export type NetworkBuilderData<
  Networks extends NetworkList = {},
  ViemNetworks extends ViemNetworkList = {},
> = {
  networks: Networks;
  viemNetworks: ViemNetworks;
};

export type NetworkConfig<RequireDefaults extends boolean = true> =
  MergeIntersects<
    Static<ReturnType<typeof ConfigNetworkAll<RequireDefaults>>>
  >;

export type NetworkList = Record<string, NetworkConfig>;
export type ViemNetworkList = Record<string, Chain>;

type NetworkFor<Type extends ConfigNetworkType> = Extract<
  NetworkConfig<false>,
  { type: Type }
>;

type WithOptionalFields<Config, Fields extends keyof Config> =
  & Omit<Config, Fields>
  & Partial<Pick<Config, Fields>>;

export type NetworkBuilderInput =
  | WithOptionalFields<
    NetworkFor<ConfigNetworkType.NTP>,
    "name" | "startTime" | "blockTimeMS"
  >
  | WithOptionalFields<NetworkFor<ConfigNetworkType.MIDNIGHT>, "name">
  | Exclude<
    NetworkConfig<false>,
    { type: ConfigNetworkType.NTP | ConfigNetworkType.MIDNIGHT }
  >;

type ValueOrDefault<
  Config,
  Field extends PropertyKey,
  Default,
> = Config extends Record<Field, infer Value> ? Value : Default;

type NetworkName<Network extends NetworkBuilderInput> = ValueOrDefault<
  Network,
  "name",
  Network["type"] extends ConfigNetworkType.NTP ? "ntp"
    : Network["type"] extends ConfigNetworkType.MIDNIGHT ? "midnight"
    : never
>;

type NormalizedNetwork<Network extends NetworkBuilderInput> =
  & Network
  & Extract<NetworkConfig<true>, { type: Network["type"] }>
  & {
    name: NetworkName<Network>;
  }
  & (Network["type"] extends ConfigNetworkType.NTP ? {
      startTime: ValueOrDefault<Network, "startTime", number>;
      blockTimeMS: ValueOrDefault<Network, "blockTimeMS", 1_000>;
    }
    : {});

export class NetworkBuilder<
  const Networks extends NetworkList = {},
  const ViemNetworks extends ViemNetworkList = {},
> {
  data: NetworkBuilderData<Networks, ViemNetworks>;

  constructor() {
    this.data = {
      networks: {} as Networks,
      viemNetworks: {} as ViemNetworks,
    };
  }

  // @bound
  addNetwork<const Network extends NetworkBuilderInput>(
    network: Network,
  ): NetworkBuilder<
    Networks & Record<NetworkName<Network>, NormalizedNetwork<Network>>,
    ViemNetworks
  > {
    const name = "name" in network && network.name !== undefined
      ? network.name
      : network.type === ConfigNetworkType.NTP
      ? "ntp"
      : network.type === ConfigNetworkType.MIDNIGHT
      ? "midnight"
      : undefined;

    if (name === undefined) {
      throw new Error(`Network ${network.type} requires an explicit name`);
    }
    if (name in this.data.networks) {
      throw new Error(
        `Network ${name} is already included in your config; provide explicit unique names when adding multiple ${network.type} networks`,
      );
    }

    const normalized = network.type === ConfigNetworkType.NTP
      ? {
        ...network,
        name,
        startTime: "startTime" in network && network.startTime !== undefined
          ? network.startTime
          : Date.now(),
        blockTimeMS:
          "blockTimeMS" in network && network.blockTimeMS !== undefined
            ? network.blockTimeMS
            : 1_000,
      }
      : { ...network, name };
    const withDefaults = Value.Default(
      ConfigNetworkAll(true),
      normalized,
    ) as NormalizedNetwork<Network>;
    (this.data.networks as any)[name] = withDefaults;
    return this as any;
  }

  // @bound
  addViemNetwork<
    formatters extends ChainFormatters,
    const chain extends Chain<formatters>,
  >(
    chain: chain,
  ): NetworkBuilder<
    Networks & Record<chain["name"], MapNetworkTypes<chain>>,
    ViemNetworks & Record<chain["name"], chain>
  > {
    const config = viemToConfigNetwork(chain);
    (this.data.viemNetworks as any)[config.name] = chain;
    return this.addNetwork(config) as any;
  }

  build(): typeof this.data {
    return this.data;
  }
}
