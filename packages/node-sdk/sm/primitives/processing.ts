import processErc20TransferDatum from "./evm/rpc/erc20-transfer.ts";
import processPaimaL2Event from "./evm/rpc/paima-l2.ts";
// import processErc721TransferDatum from "./evm/rpc/erc721-transfer.ts";
// import processErc721MintDatum from "./evm/rpc/erc721-mint.ts";
// import processErc6551RegistryDatum from "./evm/rpc/erc6551-registry.ts";
// import processErc1155TransferDatum from "./evm/rpc/erc1155-transfer.ts";
// import processGenericDatum from "./generic.ts";
// import processCardanoDelegationDatum from "./cardano/carp/delegation.ts";
// import processCardanoProjectedNFT from "./cardano/carp/projected-nft.ts";
// import processCardanoAssetUtxoDatum from "./cardano/carp/delayed-asset.ts";
// import processCardanoTransferDatum from "./cardano/carp/transfer.ts";
// import processCardanoMintBurnDatum from "./cardano/carp/mint-burn.ts";
// import processDynamicEvmPrimitive from "./evm/rpc/dynamic-primitive.ts";
// import processMidnightContractStateDatum from "./midnight/contract-state.ts";
import assertNever from "assert-never";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import { ConfigPrimitivePayloadType, ConfigPrimitiveType } from "@paima/config";
import type { StateUpdateStream } from "@paima/coroutine";
import { type BaseStfInput, type BaseStfOutput } from "../types.ts";
import type { AppEvents } from "@paima/sm";

export function* primitiveTransitionFunction(
  primitive: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType,
    ConfigPrimitiveType,
    ConfigPrimitivePayloadType
  >,
  gameStateTransitionRouter: (
    blockHeight: number,
    input: BaseStfInput,
  ) => Promise<BaseStfOutput<AppEvents>>,
): StateUpdateStream<void> {
  switch (primitive.primitiveType) {
    case ConfigPrimitiveType.AvailPaimaL2:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          return; // TODO
        default:
          assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.EvmRpcPaimaL2:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          return yield* processPaimaL2Event(
            primitive,
            gameStateTransitionRouter,
          );
        default:
          assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC20:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          return yield* processErc20TransferDatum(
            primitive.output.syncProtocol.payload.ownChain.blockNumber,
            primitive,
            gameStateTransitionRouter,
          );
        default:
          assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC721:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processErc721TransferDatum(primitive);
        case ConfigPrimitivePayloadType.Mint:
          // return yield* processErc721MintDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC1155:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processErc1155TransferDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.EvmRpcGeneric:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processGenericDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC6551Registry:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Registry:
          // return yield* processErc6551RegistryDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.EvmRpcDynamicPrimitive:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processDynamicEvmPrimitive(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.CardanoCarpDelegation:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Delegate:
          // return yield* processCardanoDelegationDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.CardanoCarpProjectedNFT:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Projection:
          // return yield* processCardanoProjectedNFT(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.CardanoCarpDelayedAsset:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processCardanoAssetUtxoDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.CardanoCarpTransfer:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processCardanoTransferDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.CardanoCarpMintBurn:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.MintOrBurn:
          // return yield* processCardanoMintBurnDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.MinaEventGeneric:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processGenericDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.MinaActionGeneric:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processGenericDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    case ConfigPrimitiveType.MidnightContractState:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processMidnightContractStateDatum(primitive);
        default:
          // assertNever.default(primitive);
      }
      break;
    default:
      // assertNever.default(primitive);
  }
}
