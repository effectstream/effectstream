import type { ConfigSyncProtocolCommonResponseAll } from "@paima/config";
import type { Static } from "@sinclair/typebox";
import type { BlockNumber } from "@paima/utils";

export function getScheduleBlockHeight<
  T extends keyof typeof ConfigSyncProtocolCommonResponseAll,
>(
  payload: Static<typeof ConfigSyncProtocolCommonResponseAll[T]>["payload"],
  currentBlockHeight: BlockNumber,
): BlockNumber {
  const { blockNumber } = "mainchain" in payload
    ? payload.mainchain
    : payload.ownChain;
  // if null, it means we're in the presync
  // and the currentBlockNumber is the first block processing starts
  if (blockNumber == null) {
    return currentBlockHeight;
  }
  return blockNumber;
}

// We cannot insert bigints into the database, or be serialized to JSON.
export function clearBigInts<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(
      value,
      (_, v) => typeof v === "bigint" ? v.toString() : v,
    ),
  );
}
