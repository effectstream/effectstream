import {
  NetworkBuilder,
  type NetworkBuilderData,
} from "./parts/network.ts";
import {
  DeployedAddressBuilder,
  type DeployedAddressesBuilderData,
} from "./parts/deployedAddresses.ts";
import {
  type AnyPostBuildSyncProtocolBuilderData,
  type NetworkSyncProtocols,
  SyncProtocolBuilder,
} from "./parts/syncProtocols.ts";
import {
  PrimitiveBuilder,
  type PrimitiveBuilderData,
} from "./parts/primitive.ts";
import {
  type PostBuildSecurityNamespaceData,
  SecurityNamespaceBuilder,
} from "./parts/securityNamespace.ts";
import { onlyOnce, onlyValue } from "./utils.ts";
// import { bound } from "@effectstream/utils";

export type ConfigBuilderData<
  Namespace extends
    | undefined
    | Readonly<PostBuildSecurityNamespaceData>["securityNamespace"],
  Networks extends undefined | NetworkBuilderData,
  DeployedAddresses extends
    | undefined
    | DeployedAddressesBuilderData["deployedAddresses"],
  SyncProtocols extends undefined | AnyPostBuildSyncProtocolBuilderData,
  Primitives extends undefined | PrimitiveBuilderData["primitives"],
> = Readonly<{
  securityNamespace: Namespace;
  allNetworks: Networks;
  deployedAddresses: DeployedAddresses;
  syncProtocols: SyncProtocols;
  primitives: Primitives;
}>;

export type NormalizedDeployments<Deployments> = Deployments extends undefined
  ? {}
  : Deployments;

export class ConfigBuilder<
  // unfortunately, we have to repeat the arguments here for Typescript to work properly
  const Namespace extends
    | undefined
    | Readonly<PostBuildSecurityNamespaceData>["securityNamespace"] = undefined,
  const Networks extends undefined | NetworkBuilderData = undefined,
  const Deployments extends
    | undefined
    | DeployedAddressesBuilderData["deployedAddresses"] = undefined,
  const SyncProtocols extends undefined | AnyPostBuildSyncProtocolBuilderData =
    undefined,
  const Primitives extends undefined | PrimitiveBuilderData["primitives"] =
    undefined,
> {
  data: ConfigBuilderData<
    Namespace,
    Networks,
    Deployments,
    SyncProtocols,
    Primitives
  >;

  constructor() {
    this.data = {
      securityNamespace: undefined,
      allNetworks: undefined,
      deployedAddresses: undefined,
      syncProtocols: undefined,
      primitives: undefined,
    } as any;
  }

  setNamespace = onlyOnce({
    key: () => this.data.securityNamespace,
    name: "setNamespace",
    build: <const NewNamespace extends PostBuildSecurityNamespaceData>(
      namespace: (
        builder: SecurityNamespaceBuilder,
      ) => { build: () => NewNamespace },
    ): ConfigBuilder<
      Readonly<NewNamespace>["securityNamespace"],
      Networks,
      Deployments,
      SyncProtocols,
      Primitives
    > => {
      const builder = new SecurityNamespaceBuilder();
      (this.data.securityNamespace as any) =
        namespace(builder).build().securityNamespace;
      return this as any;
    },
  });

  buildNetworks = onlyValue({
    value: () => ({}) as Networks,
    target: () => undefined as undefined,
    name: "buildNetworks",
    build: <const NewNetworks extends NetworkBuilderData>(
      networks: (builder: NetworkBuilder) => { build: () => NewNetworks },
    ): ConfigBuilder<
      Namespace,
      Readonly<NewNetworks>,
      Deployments,
      SyncProtocols,
      Primitives
    > => {
      const builder = new NetworkBuilder();
      (this.data.allNetworks as any) = networks(builder).build();
      return this as any;
    },
  });

  buildDeployments = onlyValue({
    value: () =>
      ({}) as [
        Networks,
        Deployments,
      ],
    target: () => ({}) as readonly [NonNullable<Networks>, undefined],
    name: "buildDeployments and/or buildNetworks",
    build: <
      NewDeployments extends DeployedAddressesBuilderData<
        NonNullable<Networks>["networks"]
      >,
    >(
      deployments: (
        builder: DeployedAddressBuilder<
          NonNullable<Networks>["networks"]
        >,
      ) => { build: () => NewDeployments },
    ): ConfigBuilder<
      Namespace,
      Networks,
      NewDeployments["deployedAddresses"],
      SyncProtocols,
      Primitives
    > => {
      const builder = new DeployedAddressBuilder(this.data.allNetworks as any);
      (this.data.deployedAddresses as any) =
        deployments(builder).build().deployedAddresses;
      return this as any;
    },
  });

  buildSyncProtocols = onlyValue({
    value: () =>
      ({}) as [
        Networks,
        SyncProtocols,
      ],
    target: () => ({}) as readonly [NonNullable<Networks>, undefined],
    name: "buildSyncProtocols and/or buildNetworks",
    build: <
      NewSyncProtocols extends AnyPostBuildSyncProtocolBuilderData,
    >(
      syncProtocols: (
        builder: SyncProtocolBuilder<
          NonNullable<Networks>["networks"],
          NormalizedDeployments<Deployments>
        >,
      ) => SyncProtocolBuilder<
        NonNullable<Networks>["networks"],
        NormalizedDeployments<Deployments>,
        any,
        any,
        any
      > & { build: () => NewSyncProtocols },
    ): ConfigBuilder<
      Namespace,
      Networks,
      NormalizedDeployments<Deployments>,
      NewSyncProtocols,
      Primitives
    > => {
      if (this.data.deployedAddresses === undefined) {
        (this.data.deployedAddresses as any) = {};
      }
      const builder = new SyncProtocolBuilder(
        this.data.allNetworks as any,
        {
          deployedAddresses: this.data.deployedAddresses as NormalizedDeployments<
            Deployments
          >,
        },
      );
      const configuredBuilder = syncProtocols(builder as any);
      if (configuredBuilder !== builder) {
        throw new Error(
          "buildSyncProtocols callback must return the supplied SyncProtocolBuilder",
        );
      }
      (this.data.syncProtocols as any) = configuredBuilder.build();
      return this as any;
    },
  });

  buildPrimitives = onlyValue({
    value: () =>
      ({}) as [
        SyncProtocols,
        Primitives,
      ],
    target: () => ({}) as readonly [NonNullable<SyncProtocols>, undefined],
    name: "buildPrimitives and/or buildSyncProtocols",
    build: <
      NewPrimitives extends PrimitiveBuilderData<
        NonNullable<Networks>["networks"],
        NetworkSyncProtocols<NonNullable<SyncProtocols>>
      >,
    >(
      primitives: (
        builder: PrimitiveBuilder<
          NonNullable<Networks>["networks"],
          NonNullable<Deployments>,
          NetworkSyncProtocols<NonNullable<SyncProtocols>>
        >,
      ) => { build: () => NewPrimitives },
    ): ConfigBuilder<
      Namespace,
      Networks,
      Deployments,
      SyncProtocols,
      NewPrimitives["primitives"]
    > => {
      const syncProtocols = this.data.syncProtocols as any as NonNullable<
        SyncProtocols
      >;
      const builder = new PrimitiveBuilder<
        NonNullable<Networks>["networks"],
        NonNullable<Deployments>,
        NetworkSyncProtocols<NonNullable<SyncProtocols>>
      >(
        this.data.allNetworks as any,
        { deployedAddresses: this.data.deployedAddresses as any },
        ({
          ...({
            [syncProtocols.main.syncProtocol.name]: syncProtocols.main,
          }),
          ...syncProtocols.parallel,
        }) as NetworkSyncProtocols<NonNullable<SyncProtocols>>,
      );
      (this.data.primitives as any) =
        primitives(builder as any).build().primitives;
      return this as any;
    },
  });

  build = onlyValue({
    value: () => ({}) as Primitives,
    target: () => ({}) as NonNullable<Primitives>,
    name: "builder",
    build: (): typeof this.data => this.data,
  });
}
