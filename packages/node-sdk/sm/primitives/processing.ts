import processPaimaL2Event from "./evm/rpc/paima-l2.ts";

import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import { ConfigPrimitivePayloadType, ConfigPrimitiveType } from "@paima/config";
import { World, type StateUpdateStream } from "@paima/coroutine";
import type { PaimaBlockNumber } from "@paima/utils";
import { PaimaPrimitiveRegistry } from "@e2e/my-primitives";
import { createScheduledData, type IInsertPrimitiveAccountingParams, insertPrimitiveAccounting } from "@paima/db";



export function* primitiveTransitionFunction(
  paima_block_height: PaimaBlockNumber,
  primitive: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType,
    ConfigPrimitiveType,
    ConfigPrimitivePayloadType
  >,
): StateUpdateStream<void> {

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
      payload: paimaPrimitive.getPayload(primitive),
    }

    yield* World.resolve(insertPrimitiveAccounting, insertPrimitiveAccountingParams);

    if (prefix) {
      yield* createScheduledData(
        paimaPrimitive.getStateMachinePayloadString(primitive),
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
    case ConfigPrimitiveType.EvmRpcPaimaL2:
      switch (primitive.payloadType) {
        case ConfigPrimitivePayloadType.PaimaL2Event:
          return yield* processPaimaL2Event(
            paima_block_height,
            primitive,
          );
        default:
          throw new Error(`Primitive type ${primitive.primitiveType} not supported`);
        }
  
    default:
      throw new Error(`Primitive type ${primitive.primitiveType} not supported`);
  }
}
