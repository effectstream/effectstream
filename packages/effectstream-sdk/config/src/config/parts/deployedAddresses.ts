import type { NetworkBuilderData, NetworkList } from "./network.ts";
// import { bound } from "@effectstream/utils";

// TODO: decide if these should be opaque types. Probably not
type ContractName = string;
type Address = string;
export type DeployedAddressConfig = Record<ContractName, Address>;

export type DeployedAddressesList<Networks extends NetworkList> = Partial<
  Record<Networks[string]["name"], DeployedAddressConfig>
>;
export type DeployedAddressesBuilderData<
  Networks extends NetworkList = {},
  DeployedAddresses extends DeployedAddressesList<Networks> = {},
> = {
  deployedAddresses: DeployedAddresses;
};

export class DeployedAddressBuilder<
  const Networks extends NetworkList = {},
  const DeployedAddresses extends DeployedAddressesList<Networks> = {},
> {
  data: DeployedAddressesBuilderData<Networks, DeployedAddresses>;

  constructor(
    readonly networks: NetworkBuilderData<Networks, any>,
  ) {
    this.data = {
      deployedAddresses: {} as DeployedAddresses,
    };
  }

  // @bound
  addDeployment<
    const Network extends Networks[keyof Networks],
    const Deployments extends DeployedAddressConfig,
  >(
    genNetwork: (networks: Networks) => Network,
    genDeployments: (network: Network) => Deployments,
  ): DeployedAddressBuilder<
    Networks,
    DeployedAddresses & Record<Network["name"], Deployments>
  > {
    const network = genNetwork(this.networks.networks);
    const deployments = genDeployments(network);
    (this.data.deployedAddresses as any)[network.name] = {
      ...((this.data.deployedAddresses as any)[network.name] ?? {}),
      ...deployments,
    } satisfies DeployedAddressConfig;
    return this as any;
  }

  // @bound
  build(): typeof this.data {
    return this.data;
  }
}
