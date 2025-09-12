import processErc20TransferDatum from "./evm/rpc/erc20-transfer.ts";
import processPaimaL2Event from "./evm/rpc/paima-l2.ts";
import processErc721TransferDatum from "./evm/rpc/erc721-transfer.ts";
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
import { World, type StateUpdateStream } from "@paima/coroutine";
import type { PaimaBlockNumber } from "@paima/utils";
import { clearBigInts } from "./utils.ts";
import processMidnightContractStateDatum from "./midnight/contract-state.ts";
import { PaimaPrimitiveRegistry } from "@e2e/data-types";
import { createScheduledData, type IInsertPrimitiveAccountingParams, insertPrimitiveAccounting } from "@paima/db";

export function* primitiveTransitionFunction(
  paima_block_height: PaimaBlockNumber,
  primitive: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType,
    ConfigPrimitiveType,
    ConfigPrimitivePayloadType
  >,
): StateUpdateStream<void> {


  // This is the new primitiveTransitionFunction
  // 1. Insert the primitive accounting
  //    NOTE This might be used for creating the dynamic-ivm tables. 
  // 2. If user scheduled prefix defined, then call the primitive's getStateMachinePayload

  const primitiveName = primitive.output.syncProtocol.payload.primitiveName;
  const paimaPrimitive = PaimaPrimitiveRegistry.getPrimitive(primitiveName);
  if (paimaPrimitive) {
    // TODO Other custom primitive actions can be added here.
    // if (paimaPrimitive.preprocess) {
    //   yield* paimaPrimitive.preprocess(primitive);
    // }

    const prefix: string | undefined = (primitive.input as any).scheduledPrefix;

    

    const insertPrimitiveAccountingParams: IInsertPrimitiveAccountingParams = {
      primitive_name: paimaPrimitive.instanceName,
      paima_block_height: paima_block_height,
      payload_type: paimaPrimitive.internalEvent,
      // TODO This needs to be a JSON Object, not JSON Array.
      payload: paimaPrimitive.getPayload(primitive)[0],
    }

    yield* World.resolve(insertPrimitiveAccounting, insertPrimitiveAccountingParams);

    // This is the old primitiveTransitionFunction
    if (prefix) {
      yield* createScheduledData(
        paimaPrimitive.getStateMachinePayload(prefix, primitive),
        {
          blockHeight: paima_block_height,
        },
        {
          primitiveName: primitiveName,
          txHash: (primitive.output.syncProtocol.payload as any).transactionHash,
          caip2: primitive.output.syncProtocol.payload.caip2,
          // TODO: Should we try to infer from the payload contents?
          fromAddress: "0x0",
          contractAddress: paimaPrimitive.contractAddress,
        },
      );
    }
    return;
  }
  // TODO The next section will not be used.
  //      It should be removed when PaimaPrimitive
  //      are fully implemented.

  switch (primitive.primitiveType) {
    case ConfigPrimitiveType.AvailPaimaL2:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          return; // TODO
        default:
          assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.EvmRpcPaimaL2:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.PaimaL2Event:
          return yield* processPaimaL2Event(
            paima_block_height,
            primitive,
          );
        default:
          assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC20:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          return yield* processErc20TransferDatum(
            paima_block_height,
            primitive,
          );
        default:
          assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC721:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processErc721TransferDatum(
          //   paima_block_height,
          //   primitive,
          // );
          throw new Error("Implemented as PaimaPrimitive");
        // case ConfigPrimitivePayloadType.Mint:
        //   return yield* processErc721MintDatum(paima_block_height, primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC1155:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processErc1155TransferDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.EvmRpcGeneric:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processGenericDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.EvmRpcERC6551Registry:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Registry:
          // return yield* processErc6551RegistryDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.EvmRpcDynamicPrimitive:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processDynamicEvmPrimitive(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.CardanoCarpDelegation:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Delegate:
          // return yield* processCardanoDelegationDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.CardanoCarpProjectedNFT:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Projection:
          // return yield* processCardanoProjectedNFT(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.CardanoCarpDelayedAsset:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processCardanoAssetUtxoDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.CardanoCarpTransfer:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Transfer:
          // return yield* processCardanoTransferDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.CardanoCarpMintBurn:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.MintOrBurn:
          // return yield* processCardanoMintBurnDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.MinaEventGeneric:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processGenericDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.MinaActionGeneric:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          // return yield* processGenericDatum(primitive);
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    case ConfigPrimitiveType.MidnightContractState:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.Event:
          return yield* processMidnightContractStateDatum(
            paima_block_height,
            primitive,
          );
        default:
          // assertNever.default(clearBigInts(primitive));
      }
      break;
    default:
      // assertNever.default(clearBigInts(primitive));
  }
}
