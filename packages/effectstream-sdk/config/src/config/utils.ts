import type { Satisfies, Stringifiable, TypeErrorMessage } from "@effectstream/utils";
import type {
  ConfigSyncProtocolType,
  PrimitiveEntry,
  ProtocolPrimitiveMap,
  SyncProtocolWithNetwork,
} from "../schema/sync-protocols/types.ts";
import type { ConfigBuilderData } from "./builder.ts";
import type { PostBuildSecurityNamespaceData } from "./parts/securityNamespace.ts";
import type { NetworkBuilderData, NetworkConfig } from "./parts/network.ts";
import type { DeployedAddressesBuilderData } from "./parts/deployedAddresses.ts";
import type { PostBuildSyncProtocolBuilderData } from "./parts/syncProtocols.ts";
import type { PrimitiveBuilderData } from "./parts/primitive.ts";

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
export function getPrimitivesForSyncProtocol<T extends ConfigSyncProtocolType>(
  primitives: Record<
    string,
    {
      syncProtocol: T;
      primitive: T extends keyof ProtocolPrimitiveMap ? ProtocolPrimitiveMap[T]
        : never;
    }
  >,
  syncProtocolName: string,
): Extract<PrimitiveEntry, { syncProtocol: T }>[] {
  if (!primitives) return [];
  const result: Extract<PrimitiveEntry, { syncProtocol: T }>[] = [];

  for (const [primitiveName, primitiveData] of Object.entries(primitives)) {
    if (primitiveData.syncProtocol === syncProtocolName) {
      const t: any = {
        syncProtocol: primitiveData.syncProtocol,
        primitive: primitiveData.primitive,
        id: primitiveName,
      };
      result.push(t);
    }
  }

  return result;
}

export function toSyncProtocolWithNetwork<
  Data extends ConfigBuilderData<
    | undefined
    | Readonly<PostBuildSecurityNamespaceData>["securityNamespace"],
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
        data.syncProtocols.main.syncProtocol.name as ConfigSyncProtocolType,
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
          protocol.syncProtocol.name as ConfigSyncProtocolType,
        ),
      };
      return result as SyncProtocolWithNetwork;
    }),
    // TODO: decorator syncProtocols
  ];
}
