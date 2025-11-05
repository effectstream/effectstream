import type { StateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import {
  newScheduledHeightData,
  newScheduledTimestampData,
  removeAllScheduledDataByInputData,
  removeScheduledBlockData,
  removeScheduledTimestampData,
} from "./sql/rollup_inputs.queries.ts";
import {
  AddressType,
  type Caip2,
  type TxHash,
  type UnknownFormat,
} from "@effectstream/utils";
import {
  type BlockNumber,
  strip0x,
  type TimestampMs,
  type WalletAddress,
} from "@effectstream/utils";
import { Buffer } from "node:buffer";

export type UpdateAtTrigger = { blockHeight: BlockNumber } | {
  timestamp: TimestampMs;
};

/**
 * Create an SQL update which schedules a piece of data to be run through
 * the STF at a future block height / timestamp.
 *
 * @param inputData The input to pass to the STF, generally in Paima Concise format.
 * @param blockHeight The future block height at which to post the input to the STF.
 * @returns
 */
export function* createScheduledData(
  inputData: string,
  trigger: UpdateAtTrigger,
  source:
    | {
      primitiveName: string;
      txHash: TxHash;
      caip2: Caip2;
      fromAddress: WalletAddress;
      fromAddressType: AddressType;
      contractAddress: undefined | WalletAddress;
    }
    | {
      precompile: UnknownFormat;
    },
): StateUpdateStream<void> {
  if ("blockHeight" in trigger) {
    const sourceParams = "precompile" in source
      ? {
        from_address: source.precompile,
        // TODO: Check this value. What is the precompile types?
        from_address_type: AddressType.NONE,
        primitive_name: null,
        origin_tx_hash: null,
        caip2: null,
        origin_contract_address: null,
      }
      : {
        from_address: source.fromAddress,
        from_address_type: source.fromAddressType,
        primitive_name: source.primitiveName,
        origin_tx_hash: Buffer.from(strip0x(source.txHash), "hex"),
        caip2: source.caip2,
        origin_contract_address: source.contractAddress,
      };

    yield* World.resolve(newScheduledHeightData, {
      future_block_height: trigger.blockHeight,
      input_data: inputData,
      ...sourceParams,
    });
  } else {
    if (!("precompile" in source)) {
      // in particular primitives only schedule data in the same block they trigger
      throw new Error("primitives should not schedule timers by date");
    }
    yield* World.resolve(newScheduledTimestampData, {
      future_ms_timestamp: new Date(trigger.timestamp),
      input_data: inputData,
      from_address: source.precompile,
      from_address_type: AddressType.NONE,
    });
  }
}

// Create an SQL update which deletes an upcoming scheduled data
// NOTE: if trigger is null, then delete ALL schedules that match inputData.
export function* deleteScheduledData(
  inputData: string,
  trigger: UpdateAtTrigger | null,
): StateUpdateStream<void> {
  if (trigger === null) {
    yield* World.resolve(removeAllScheduledDataByInputData, {
      input_data: inputData,
    });
    return;
  }

  if ("blockHeight" in trigger) {
    // Delete exact schedule by command and height
    yield* World.resolve(removeScheduledBlockData, {
      block_height: trigger.blockHeight,
      input_data: inputData,
    });
  } else {
    // Delete exact schedule by command and timestamp
    yield* World.resolve(removeScheduledTimestampData, {
      ms_timestamp: new Date(trigger.timestamp),
      input_data: inputData,
    });
  }
}
