import type { FlipObject, RemoveNeverEntries, ValueOf } from "@paima/utils";
import { ConfigSyncProtocolType } from "../../sync-protocols/types.ts";
import type { ConfigSyncProtocolDecoratorType } from "../../sync-protocols/decorators/types.ts";
import type { PrimitiveConfig } from "../../../config/parts/primitive.ts";

export enum ConfigPrimitiveType {
  EvmGeneric = "evm-generic",
  EvmPaimaL2 = "evm-paima-l2",
  ERC20 = "erc20",
  ERC20Deposit = "erc20-deposit",
  ERC721 = "erc721",
  ERC6551Registry = "erc6551-registry",
  ERC1155 = "erc1155",
  DynamicEvmPrimitive = "dynamic-evm-primitive",
  CardanoDelegation = "cardano-stake-delegation",
  CardanoProjectedNFT = "cardano-projected-nft",
  CardanoDelayedAsset = "cardano-delayed-asset",
  CardanoTransfer = "cardano-transfer",
  CardanoMintBurn = "cardano-mint-burn",
  MinaEventGeneric = "mina-event-generic",
  MinaActionGeneric = "mina-action-generic",
  MidnightContractState = "midnight-contract-state",
  AvailPaimaL2 = "avail-paima-l2",
}

export const AlgorandPrimitivesToSyncProtocol = {} as const;

export const AvailPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.AvailPaimaL2]: [
    ConfigSyncProtocolType.AVAIL_MAIN,
    ConfigSyncProtocolType.AVAIL_PARALLEL,
  ],
} as const;

export const CardanoPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.CardanoDelegation]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoProjectedNFT]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoDelayedAsset]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoTransfer]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoMintBurn]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
} as const;

export const EvmPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.EvmGeneric]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmPaimaL2]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.ERC20]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.ERC20Deposit]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.ERC721]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.ERC6551Registry]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.ERC1155]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.DynamicEvmPrimitive]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
} as const;

export const MinaPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.MinaEventGeneric]: [
    ConfigSyncProtocolType.MINA_PARALLEL,
  ],
  [ConfigPrimitiveType.MinaActionGeneric]: [
    ConfigSyncProtocolType.MINA_PARALLEL,
  ],
} as const;

export const MidnightPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.MidnightContractState]: [
    ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
  ],
} as const;

export const PrimitiveToSyncProtocol = {
  ...AvailPrimitivesToSyncProtocol,
  ...CardanoPrimitivesToSyncProtocol,
  ...EvmPrimitivesToSyncProtocol,
  ...MinaPrimitivesToSyncProtocol,
  ...MidnightPrimitivesToSyncProtocol,
} as const satisfies Record<
  ConfigPrimitiveType,
  readonly ConfigSyncProtocolType[]
>;

type FindPrimitive<
  SyncProtocol extends ConfigSyncProtocolType,
  T extends typeof PrimitiveToSyncProtocol,
> = {
  [K in keyof T]: T[K] extends readonly (infer Val)[]
    ? SyncProtocol extends Val ? SyncProtocol
    : never
    : never;
};

export type SyncProtocolsForPrimitives<
  SyncProtocol extends ConfigSyncProtocolType,
> = RemoveNeverEntries<
  FindPrimitive<SyncProtocol, typeof PrimitiveToSyncProtocol>
>;
export type PrimitivesTypesForSyncProtocol<
  SyncProtocol extends ConfigSyncProtocolType,
> = FlipObject<
  SyncProtocolsForPrimitives<SyncProtocol>
>;
export type PrimitivesForSyncProtocol<
  SyncProtocol extends ConfigSyncProtocolType | ConfigSyncProtocolDecoratorType,
  RequireOptional extends boolean = true,
> = PrimitiveConfig<RequireOptional> & {
  type: ValueOf<
    PrimitivesTypesForSyncProtocol<SyncProtocol & ConfigSyncProtocolType>
  >;
};
