import type { FlipObject, RemoveNeverEntries, ValueOf } from "@paima/utils";
import { ConfigSyncProtocolType } from "../../sync-protocols/types.ts";
import type { ConfigSyncProtocolDecoratorType } from "../../sync-protocols/decorators/types.ts";
import type { PrimitiveConfig } from "../../../config/parts/primitive.ts";

export enum ConfigPrimitiveType {
  EvmRpcGeneric = "evm-rpc-generic",
  EvmRpcPaimaL2 = "evm-rpc-paima-l2",
  // EvmRpcERC20 = "evm-rpc-erc20",
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

export type SyncProtocolsForPrimitives<
  SyncProtocol extends ConfigSyncProtocolType,
> = any;
// RemoveNeverEntries<
//   FindPrimitive<SyncProtocol, typeof PrimitiveToSyncProtocol>
// >;

export type PrimitivesTypesForSyncProtocol<
  SyncProtocol extends ConfigSyncProtocolType,
> = any;
//  FlipObject<
//   SyncProtocolsForPrimitives<SyncProtocol>
// >;

export type PrimitivesForSyncProtocol<
  SyncProtocol extends ConfigSyncProtocolType | ConfigSyncProtocolDecoratorType,
  RequireOptional extends boolean = true,
> = any;
// PrimitiveConfig<RequireOptional> & {
//  type: ValueOf<
//    PrimitivesTypesForSyncProtocol<SyncProtocol & ConfigSyncProtocolType>
//  >;
// };
