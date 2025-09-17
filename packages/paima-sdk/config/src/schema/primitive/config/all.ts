import { Type } from "@sinclair/typebox";
import {
  PrimitiveDynamicEvmPrimitiveConfig,
  PrimitiveErc1155Config,
  // PrimitiveErc20Config,
  PrimitiveErc6551RegistryConfig,
  PrimitiveErc721Config,
  PrimitiveEvmGenericConfig,
  PrimitiveEvmPaimaL2Config,
} from "./evm/rpc.ts";
import {
  PrimitiveCardanoDelayedAssetConfig,
  PrimitiveCardanoDelegationConfig,
  PrimitiveCardanoMintBurnConfig,
  PrimitiveCardanoProjectedNFTConfig,
  PrimitiveCardanoTransferConfig,
} from "./cardano/carp.ts";
import { PrimitiveCardanoUtxorpcMatchTxConfig } from "./cardano/utxorpc.ts";
import {
  PrimitiveMinaActionGenericConfig,
  PrimitiveMinaEventGenericConfig,
} from "./mina.ts";
import { PrimitiveMidnightContractStateConfig } from "./midnight.ts";
import type { ToKeyedUnion } from "../../mod.ts";
import { PrimitiveAvailPaimaL2Config } from "./avail.ts";

const ConfigPrimitives = <Bool extends boolean>(
  requireOptional: Bool,
) =>
  [
    PrimitiveAvailPaimaL2Config.allProperties(requireOptional),
    PrimitiveEvmPaimaL2Config.allProperties(requireOptional),
    // PrimitiveErc20Config.allProperties(requireOptional),
    PrimitiveErc721Config.allProperties(requireOptional),
    PrimitiveErc1155Config.allProperties(requireOptional),
    PrimitiveErc6551RegistryConfig.allProperties(requireOptional),
    PrimitiveEvmGenericConfig.allProperties(requireOptional),
    PrimitiveCardanoDelegationConfig.allProperties(requireOptional),
    PrimitiveCardanoProjectedNFTConfig.allProperties(requireOptional),
    PrimitiveCardanoDelayedAssetConfig.allProperties(requireOptional),
    PrimitiveCardanoTransferConfig.allProperties(requireOptional),
    PrimitiveCardanoMintBurnConfig.allProperties(requireOptional),
    PrimitiveCardanoUtxorpcMatchTxConfig.allProperties(requireOptional),
    PrimitiveMinaEventGenericConfig.allProperties(requireOptional),
    PrimitiveMinaActionGenericConfig.allProperties(requireOptional),
    PrimitiveDynamicEvmPrimitiveConfig.allProperties(requireOptional),
    PrimitiveMidnightContractStateConfig.allProperties(requireOptional),
  ] as const;

export const ConfigPrimitiveAll = <Bool extends boolean>(
  requireOptional: Bool,
) => Type.Union([...ConfigPrimitives<Bool>(requireOptional)]);

export type KeyedConfigPrimitiveAll = ToKeyedUnion<
  ReturnType<typeof ConfigPrimitives<true>>
>;
