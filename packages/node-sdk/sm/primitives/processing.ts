import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@effectstream/config";
import { type StateUpdateStream, World } from "@effectstream/coroutine";
import type { PaimaBlockNumber } from "@effectstream/utils";
import { PaimaPrimitiveRegistry } from "./PrimitiveRegistry.ts";
import {
  createScheduledData,
  type IInsertPrimitiveAccountingParams,
  insertPrimitiveAccounting,
} from "@effectstream/db";

export function* primitiveTransitionFunction(
  effectstream_block_height: PaimaBlockNumber,
  primitiveData: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType
  >,
): StateUpdateStream<void> {
  const primitiveName = primitiveData.primitive;
  const paimaPrimitive = PaimaPrimitiveRegistry.getPrimitive(primitiveName);
  if (!paimaPrimitive) {
    console.error("No Paima Primitive found for", primitiveName);
    return;
  }
  // TODO We don't need to pass the `primitive' rather the primitive.output
  const { isBatched, data } = yield* paimaPrimitive
    .getPayload(
      effectstream_block_height,
      primitiveData,
    );
  // console.error("[primitivePayload]", isBatched, data);
  // TODO We should process the batched data in order, instead of
  //      getting the data and then writing the data to the db.
  for (
    let { accountingPayload, stateMachinePayload, fromAddressAndType } of data
  ) {
    // TODO Why is JSON array types been rejected by the db?
    // [jsonPayload] [ [ "attack", "1", "100" ] ]
    // error: invalid input syntax for type json
    if (Array.isArray(accountingPayload)) {
      accountingPayload = { data: accountingPayload };
    }
    const insertPrimitiveAccountingParams: IInsertPrimitiveAccountingParams = {
      primitive_name: paimaPrimitive.instanceName,
      effectstream_block_height: effectstream_block_height,
      payload_type: paimaPrimitive.internalTypeName,
      payload: accountingPayload,
    };
    yield* World.resolve(
      insertPrimitiveAccounting,
      insertPrimitiveAccountingParams,
    );

    if (stateMachinePayload) {
      yield* createScheduledData(
        JSON.stringify(stateMachinePayload),
        {
          blockHeight: effectstream_block_height,
        },
        {
          primitiveName: primitiveName,
          txHash: primitiveData.syncProtocol.transactionHash,
          caip2: "caip2",
          fromAddress: fromAddressAndType.address,
          fromAddressType: fromAddressAndType.type,
          contractAddress: primitiveData.syncProtocol.contractAddress,
        },
      );
    }
  }
}
