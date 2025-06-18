import type { Satisfies, Stringifiable, TypeErrorMessage } from "@paima/utils";
import type {
  PrimitiveEntry,
  SyncProtocolWithNetwork,
} from "../schema/sync-protocols/types.ts";
import { ConfigBuilderData } from "./builder.ts";
import { PostBuildSecurityNamespaceData } from "./parts/securityNamespace.ts";
import { NetworkBuilderData, NetworkConfig } from "./parts/network.ts";
import { DeployedAddressesBuilderData } from "./parts/deployedAddresses.ts";
import { PostBuildSyncProtocolBuilderData } from "./parts/syncProtocols.ts";
import { PrimitiveBuilderData } from "./parts/primitive.ts";

export type ErrorIfDefined<
  T,
  Success,
  ValName extends string = string,
> = T extends undefined ? Success
  : TypeErrorMessage<
    `${string extends ValName ? "Value" : ValName} has already been set`
  >;

// careful: this returns `never` in some cases
type IsStringifiable<A> = A extends Stringifiable ? true : false;

export type ErrorIfFalse<
  T extends boolean,
  Success,
  Value,
  Target,
  ValName extends string = string,
> = T extends true ? Success
  : TypeErrorMessage<
    `${string extends ValName ? "Value" : ValName} ${Value extends Stringifiable
      ? IsStringifiable<Target> extends never ? "is not in the right state"
      : IsStringifiable<Target> extends true
        ? `can only be set if ${Target & Stringifiable} is equal to ${Value}`
      : "is not in the right state"
      : "is not in the right state"}`
  >;

export function onlyOnce<
  const Step,
  const Func,
  const Name extends string = string,
>(param: {
  key: () => Step;
  name?: Name;
  build: Func;
}): ErrorIfDefined<Step, Func, Name> {
  return param.build as any;
}

export type ErrorIfMessage<
  T,
  Success,
  Name extends string = string, // TODO: do we need this?
> = T extends TypeErrorMessage<any> ? T : Success;

export function onlyNotError<
  const MaybeNever,
  const Func,
  const Name extends string,
>(param: {
  key: () => MaybeNever;
  name?: Name;
  build: Func;
}): ErrorIfMessage<MaybeNever, Func, Name> {
  return param.build as any;
}

export function onlyValue<
  const Value,
  const Target,
  const Func,
  const Name extends string = string,
>(param: {
  value: () => Value;
  target: () => Target;
  name?: Name;
  build: Func;
}): ErrorIfFalse<Satisfies<Target, Value>, Func, Value, Target, Name> {
  return param.build as any;
}

/**
 * Helper function to filter and create PrimitiveEntry objects for a specific sync protocol
 */
function getPrimitivesForSyncProtocol<T extends string>(
  primitives: Record<string, any>,
  syncProtocolName: T,
): PrimitiveEntry<any, any>[] {
  if (!primitives) return [];
  const result: PrimitiveEntry<any, any>[] = [];

  for (const [primitiveName, primitiveData] of Object.entries(primitives)) {
    if (primitiveData.syncProtocol === syncProtocolName) {
      result.push({
        syncProtocol: primitiveData.syncProtocol,
        primitive: primitiveData.primitive,
        id: primitiveName,
      });
    }
  }

  return result;
}

export function toSyncProtocolWithNetwork<
  Data extends ConfigBuilderData<
    Readonly<PostBuildSecurityNamespaceData>["securityNamespace"],
    NetworkBuilderData<Record<string, NetworkConfig>>,
    DeployedAddressesBuilderData["deployedAddresses"],
    PostBuildSyncProtocolBuilderData<Record<string, NetworkConfig>>,
    PrimitiveBuilderData["primitives"]
  >,
>(
  data: Data,
): SyncProtocolWithNetwork[] {
  return [
    // TODO: clean up this code so it's more readable
    {
      networkType: data.allNetworks
        .networks[data.syncProtocols.main.network].type,
      syncProtocolType: data.syncProtocols.main.syncProtocol.type,
      syncProtocol: data.syncProtocols.main.syncProtocol,
      network: data.allNetworks
        .networks[data.syncProtocols.main.network],
      primitives: getPrimitivesForSyncProtocol(
        data.primitives,
        data.syncProtocols.main.syncProtocol.name,
      ),
    } as SyncProtocolWithNetwork,
    ...Object.values(data.syncProtocols.parallel).map((
      protocol,
    ) => {
      const network = data.allNetworks
        .networks[protocol.network];
      const result = {
        networkType: network.type,
        syncProtocolType: protocol.syncProtocol.type,
        syncProtocol: protocol.syncProtocol,
        network,
        primitives: getPrimitivesForSyncProtocol(
          data.primitives,
          protocol.syncProtocol.name,
        ),
      };
      return result as SyncProtocolWithNetwork;
    }),
    // TODO: decorator syncProtocols
  ];
}
