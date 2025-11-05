import type { MergeIntersects } from "@effectstream/utils";
import type { Static } from "@sinclair/typebox";
import {
  ConfigNetworkAll,
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
  addNetwork<const Network extends NetworkConfig<false>>(
    network: Network,
  ): NetworkBuilder<
    Networks & Record<Network["name"], Network & NetworkConfig<true>>,
    ViemNetworks
  > {
    if (network.name in this.data.networks) {
      throw new Error(
        `Network ${network.name} is already included in your config`,
      );
    }
    const withDefaults = Value.Default(ConfigNetworkAll(true), network) as
      & Network
      & NetworkConfig<true>;
    (this.data.networks as any)[network.name] = withDefaults;
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
