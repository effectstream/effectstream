import type { Static } from "@sinclair/typebox";
import { type Caip2, type MergeIntersects, strip0x } from "@effectstream/utils";
import { registry, toChainId } from "@dcspark/cip34-js";
import { ConfigNetworkType } from "./types.ts";
import type { ConfigNetworkAll } from "./all.ts";
import { Buffer } from "node:buffer";

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
    case "yaci":
      // TODO: dynamically fetch (but it should probably be added inside `config` directly instead of fetched here)
      //       see: https://github.com/utxorpc/spec/pull/147#discussion_r2013805908
      return toChainId({
        // default values for yaci-devkit
        networkId: 0,
        networkMagic: 42,
      });
  }
  throw new Error(`Unknown network: ${config.network}`);
}

export function caip2PrefixFor(
  config: MergeIntersects<Static<ReturnType<typeof ConfigNetworkAll<false>>>>,
): Caip2 {
  const type = config.type;

  // see https://github.com/ChainAgnostic/namespaces
  switch (type) {
    case ConfigNetworkType.NTP:
      // TODO What to return here
      return `ntp:${config.name}`;
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
      return `polkadot:${config.networkId}`;
    case ConfigNetworkType.BITCOIN: {
      const chainIdentifier =
        (config as { chainIdentifier?: string | null }).chainIdentifier ??
        (config as { network?: string }).network ??
        config.name;
      return `bip122:${chainIdentifier}`;
    }
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
  }
  throw new Error(`Unknown network type: ${type}`);
}
