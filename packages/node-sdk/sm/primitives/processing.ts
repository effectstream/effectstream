import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@paima/config";
import { type StateUpdateStream, World } from "@paima/coroutine";
import type { PaimaBlockNumber } from "@paima/utils";
// TODO THIS NEED TO BE AN INTERNAL PACKAGE
import { PaimaPrimitiveRegistry } from "@e2e/my-primitives";
import {
  createScheduledData,
  type IInsertPrimitiveAccountingParams,
  insertPrimitiveAccounting,
} from "@paima/db";

export function* primitiveTransitionFunction(
  paima_block_height: PaimaBlockNumber,
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
  const { isBatched, data } = yield* paimaPrimitive.getPayload(
    paima_block_height,
    primitiveData,
  );
  // console.error("[primitivePayload]", isBatched, data);
  // TODO We should process the batched data in order, instead of
  //      getting the data and then writing the data to the db.
  for (let { accountingPayload, stateMachinePayload } of data) {
    // TODO Why is JSON array types been rejected by the db?
    // [jsonPayload] [ [ "attack", "1", "100" ] ]
    // error: invalid input syntax for type json
    if (Array.isArray(accountingPayload)) {
      accountingPayload = { data: accountingPayload };
    }
    const insertPrimitiveAccountingParams: IInsertPrimitiveAccountingParams = {
      primitive_name: paimaPrimitive.instanceName,
      paima_block_height: paima_block_height,
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
          blockHeight: paima_block_height,
        },
        {
          primitiveName: primitiveName,
          txHash: primitiveData.syncProtocol.transactionHash,
          caip2: "caip2",
          // TODO: Should we try to infer from the payload contents?
          fromAddress: "0x0",
          contractAddress: primitiveData.syncProtocol.contractAddress,
        },
      );
    }
  }
}
