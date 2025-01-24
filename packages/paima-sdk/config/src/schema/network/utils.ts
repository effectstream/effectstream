import type { Static } from "@sinclair/typebox";
import { type Caip2, type MergeIntersects, strip0x } from "@paima/utils";
import assertNever from "assert-never";
import { registry, toChainId } from "@dcspark/cip34-js";
import { ConfigNetworkType } from "./types.ts";
import type { ConfigNetworkAll } from "./all.ts";
import { Buffer } from "buffer";

function networkToCip34(
  config: MergeIntersects<
    Static<ReturnType<typeof ConfigNetworkAll<true>>> & {
      type: ConfigNetworkType.CARDANO;
    }
  >,
): string {
  switch (config.network) {
    case "mainnet":
      return toChainId({
        networkId: registry.Mainnet.NetworkId,
        networkMagic: registry.Mainnet.NetworkMagic,
      });
    case "preprod":
      return toChainId({
        networkId: registry.PreProduction.NetworkId,
        networkMagic: registry.PreProduction.NetworkMagic,
      });
    case "preview":
      return toChainId({
        networkId: registry.Preview.NetworkId,
        networkMagic: registry.Preview.NetworkMagic,
      });
    default:
      assertNever.default(config.network);
  }
}

export function caip2PrefixFor(
  config: MergeIntersects<Static<ReturnType<typeof ConfigNetworkAll<false>>>>,
): Caip2 {
  const type = config.type;

  // see https://github.com/ChainAgnostic/namespaces
  switch (type) {
    case ConfigNetworkType.EVM:
      // https://github.com/ChainAgnostic/namespaces/tree/main/eip155
      return `eip155:${config.chainId}`;
    case ConfigNetworkType.MINA:
      // https://github.com/ChainAgnostic/namespaces/blob/main/mina/caip2.md
      return `mina:${config.networkId}`;
    case ConfigNetworkType.CARDANO:
      // https://github.com/cardano-foundation/CIPs/tree/master/CIP-0034
      return networkToCip34(config);
    case ConfigNetworkType.AVAIL:
      // https://github.com/ChainAgnostic/namespaces/blob/main/polkadot/caip2.md
      return `polkadot:${strip0x(config.genesisHash).slice(0, 32)}`;
    case ConfigNetworkType.MIDNIGHT:
      // https://github.com/ChainAgnostic/namespaces/blob/main/polkadot/caip2.md
      return `polkadot:${strip0x(config.genesisHash).slice(0, 32)}`;
    case ConfigNetworkType.SUBSTRATE:
      // https://github.com/ChainAgnostic/namespaces/blob/main/polkadot/caip2.md
      return `polkadot:${strip0x(config.genesisHash).slice(0, 32)}`;
    case ConfigNetworkType.ALGORAND: {
      // https://github.com/ChainAgnostic/namespaces/blob/main/algorand/caip2.md
      const urlSafe = Buffer.from(config.genesisHash, "base64").toString(
        "base64url",
      );
      const prefix = urlSafe.substring(0, 32);
      const identifier = "algorand:" + prefix;
      return identifier;
    }
    default:
      assertNever.default(type);
  }
}
