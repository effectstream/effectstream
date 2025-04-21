import type { FlipObject, RemoveNeverEntries, ValueOf } from "@paima/utils";
import { ConfigSyncProtocolType } from "../../sync-protocols/types.ts";
import type { ConfigSyncProtocolDecoratorType } from "../../sync-protocols/decorators/types.ts";
import type { PrimitiveConfig } from "../../../config/parts/primitive.ts";

export enum ConfigPrimitiveType {
  EvmRpcGeneric = "evm-rpc-generic",
  EvmRpcPaimaL2 = "evm-rpc-paima-l2",
  EvmRpcERC20 = "evm-rpc-erc20",
  EvmRpcERC20Deposit = "evm-rpc-erc20-deposit",
  EvmRpcERC721 = "evm-rpc-erc721",
  EvmRpcERC6551Registry = "evm-rpc-erc6551-registry",
  EvmRpcERC1155 = "evm-rpc-erc1155",
  EvmRpcDynamicPrimitive = "evm-rpc-dynamic-primitive",
  CardanoUtxorpcMatchTx = "cardano-utxorpc-match-tx",
  CardanoCarpDelegation = "carp-stake-delegation",
  CardanoCarpProjectedNFT = "carp-projected-nft",
  CardanoCarpDelayedAsset = "carp-delayed-asset",
  CardanoCarpTransfer = "carp-transfer",
  CardanoCarpMintBurn = "carp-mint-burn",
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

export const CardanoCarpPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.CardanoCarpDelegation]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoCarpProjectedNFT]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoCarpDelayedAsset]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoCarpTransfer]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
  [ConfigPrimitiveType.CardanoCarpMintBurn]: [
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
  ],
} as const;
export const CardanoUtxorpcPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.CardanoUtxorpcMatchTx]: [
    ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
  ],
} as const;

export const EvmPrimitivesToSyncProtocol = {
  [ConfigPrimitiveType.EvmRpcGeneric]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmRpcPaimaL2]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmRpcERC20]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmRpcERC20Deposit]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmRpcERC721]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmRpcERC6551Registry]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmRpcERC1155]: [
    ConfigSyncProtocolType.EVM_RPC_MAIN,
    ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  ],
  [ConfigPrimitiveType.EvmRpcDynamicPrimitive]: [
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
  ...CardanoCarpPrimitivesToSyncProtocol,
  ...CardanoUtxorpcPrimitivesToSyncProtocol,
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
