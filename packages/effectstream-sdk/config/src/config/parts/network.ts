import type { MergeIntersects } from "@effectstream/utils";
import type { Static } from "@sinclair/typebox";
import {
  ConfigNetworkAll,
  type MapNetworkTypes,
  type MaterializedFromRegistry,
  materializeDiscriminated,
  networkTypes,
  viemToConfigNetwork,
} from "../../schema/mod.ts";
import type { Chain, ChainFormatters } from "viem";
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
export type NetworkValues<Networks extends NetworkList> = Networks extends unknown
  ? Networks[keyof Networks]
  : never;
export type ViemNetworkList = Record<string, Chain>;
type MaterializedNetwork<Network extends NetworkConfig<false>> =
  MaterializedFromRegistry<
    typeof networkTypes,
    Network
  >;
type NamedNetworkRecord<Network> = Network extends { name: infer Name }
  ? Name extends string ? Record<Name, Network & { name: Name }>
  : never
  : never;

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
    & Networks
    & NamedNetworkRecord<MaterializedNetwork<Network>>,
    ViemNetworks
  > {
    const withDefaults = materializeDiscriminated(networkTypes, network);
    const effectiveName = withDefaults.name;
    if (effectiveName in this.data.networks) {
      throw new Error(
        `Network ${effectiveName} is already included in your config; supply an explicit unique name`,
      );
    }
    (this.data.networks as any)[effectiveName] = withDefaults;
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
