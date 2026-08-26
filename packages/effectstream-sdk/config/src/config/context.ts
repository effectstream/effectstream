import { createContext, type Operation } from "effection";
import type { ViemNetworkList } from "./parts/network.ts";
import { ConfigNetworkToViem } from "../schema/network/evm.ts";
import type { ConfigNetworkEvm } from "../schema/network/evm.ts";
import type { SecurityNamespace } from "../schema/namespace.ts";
import type { Chain, ChainFormatters } from "viem";

export const PaimaStaticConfigContext = createContext<GlobalContext>(
  "paima:static-config",
);

/**
 * Careful: only include fields that don't change at runtime
 */
type GlobalContext = {
  viemNetworks: ViemNetworkList;
  securityNamespace: SecurityNamespace;
};

/**
 * Process-stable configuration required by the Effectstream runtime.
 *
 * This is kept separate from the runtime start configuration because these
 * values are installed in an Effection context for the full node scope.
 */
export type EffectstreamStaticConfig = {
  securityNamespace: SecurityNamespace;
  allNetworks: {
    viemNetworks: ViemNetworkList;
  };
};

export function* withEffectstreamStaticConfig(
  config: EffectstreamStaticConfig,
  continuation: () => Operation<void>,
) {
  yield* PaimaStaticConfigContext.set(
    {
      securityNamespace: config.securityNamespace,
      viemNetworks: config.allNetworks.viemNetworks,
    },
  );
  yield* continuation();
}

export function* usePaimaStaticConfig(): Operation<GlobalContext> {
  const config = yield* PaimaStaticConfigContext.get();
  if (!config) {
    throw new Error("Static config not set");
  }
  return config;
}

export function* getViemNetwork(
  network: ConfigNetworkEvm,
): Operation<
  Chain<ChainFormatters>
> {
  const staticConfig = yield* usePaimaStaticConfig();
  const viemNetwork: undefined | Chain =
    staticConfig.viemNetworks[network.name];
  if (viemNetwork == null) {
    return ConfigNetworkToViem(network);
  }
  return viemNetwork;
}
