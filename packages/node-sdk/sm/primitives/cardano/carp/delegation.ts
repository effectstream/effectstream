import { createScheduledData, insertPrimitiveAccounting } from "@paima/db";
import type { StateUpdateStream } from "@paima/coroutine";
import { World } from "@paima/coroutine";
import type {
  ConfigPrimitivePayloadType,
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  PayloadOf,
  PrimitiveCardanoCarpDelegationAccounting,
} from "@paima/config";
import { BuiltinTransitions, generateRawStmInput } from "@paima/concise";
import {
  ConfigPrimitiveAccountingPayloadType,
  ConfigPrimitiveType,
} from "@paima/config";
import type { BlockNumber } from "@paima/utils";
import { getScheduleBlockHeight } from "../../utils.ts";

export default function* processCardanoDelegateSyncProtocolResponse(
  paima_block_height: BlockNumber,
  response: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.CARDANO_CARP_PARALLEL,
    ConfigPrimitiveType.CardanoCarpDelegation,
    ConfigPrimitivePayloadType.Delegate
  >,
): StateUpdateStream<void> {
  const primitiveName = response.output.syncProtocol.payload.primitiveName;
  const prefix = response.input.scheduledPrefix;
  const address = response.output.payload.address;
  const pool = response.output.payload.pool;
  const epoch = response.output.payload.epoch;

  const scheduledInputData = generateRawStmInput(
    BuiltinTransitions[ConfigPrimitiveType.CardanoCarpDelegation]
      .scheduledPrefix,
    prefix,
    {
      address,
      pool,
      epoch,
    },
  );

  yield* createScheduledData(
    JSON.stringify(scheduledInputData),
    {
      blockHeight: getScheduleBlockHeight(
        response.output.syncProtocol.payload,
        paima_block_height,
      ),
    },
    {
      primitiveName: response.output.syncProtocol.payload.primitiveName,
      txHash: response.output.syncProtocol.payload.transactionHash as string,
      caip2: response.output.syncProtocol.payload.caip2,
      fromAddress: address,
      contractAddress: undefined,
    },
  );
  // TODO: we should register indices for this
  yield* World.resolve(insertPrimitiveAccounting, {
    primitive_name: primitiveName,
    paima_block_height: paima_block_height,
    payload_type: ConfigPrimitiveAccountingPayloadType.Transfer,
    payload: response.output.payload satisfies PayloadOf<
      typeof PrimitiveCardanoCarpDelegationAccounting
    >,
  });
  // TODO: it may be good to remove old entries
}
