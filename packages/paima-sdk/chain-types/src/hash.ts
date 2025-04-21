import type {
  BlockNumber,
  Caip2,
  HexStringNo0x,
  TimestampMs,
} from "@paima/utils";
import type { PostExecutionBlockHeader } from "./types.ts";
import sha3 from "js-sha3";
const { keccak_256 } = sha3;

export function genV1BlockHeader(
  mainChainInfo: {
    blockHash: HexStringNo0x;
    blockHeight: BlockNumber;
    msTimestamp: TimestampMs;
  },
  prevBlockHash: null | HexStringNo0x,
  successfulTxs: string[],
  failedTxs: string[],
): PostExecutionBlockHeader<1> {
  return {
    version: 1 as const,
    prevBlockHash,
    mainChainBlochHash: mainChainInfo.blockHash,
    blockHeight: mainChainInfo.blockHeight,
    msTimestamp: mainChainInfo.msTimestamp,
    successTxsHash: hashTransactions.hash(successfulTxs),
    failedTxsHash: hashTransactions.hash(failedTxs),
  };
}

interface HashInfo<T> {
  preHash: (info: T) => string;
  hash: (info: T) => HexStringNo0x;
}
export const hashTransactions: HashInfo<string[]> = {
  preHash: (txs) => txs.join("|"),
  hash: (txs) => keccak_256(hashTransactions.preHash(txs)),
};

export const hashBlockV1: HashInfo<PostExecutionBlockHeader<1>> = {
  preHash: (header) =>
    `${header.version}|${header.prevBlockHash}|${header.mainChainBlochHash}|${header.blockHeight}|${header.msTimestamp}|${header.successTxsHash}|${header.failedTxsHash}`,
  hash: (header) => keccak_256(hashBlockV1.preHash(header)),
};

export type RollupInputHashInfo = {
  caip2Prefix: Caip2;
  txHash: HexStringNo0x;
  indexInBlock: number;
};
export const hashRollupInput: HashInfo<RollupInputHashInfo> = {
  preHash: (info) => `${info.caip2Prefix}}|${info.txHash}|${info.indexInBlock}`,
  hash: (info) => keccak_256(hashRollupInput.preHash(info)),
};

export type TimerHashInfo = {
  address: string;
  dataHash: HexStringNo0x;
  blockHeight: BlockNumber;
  indexInBlock: number;
};
export const hashTimerData: HashInfo<TimerHashInfo> = {
  preHash: (info) =>
    `${info.address}|${info.dataHash}|${info.blockHeight}|${info.indexInBlock}`,
  hash: (info) => keccak_256(hashTimerData.preHash(info)),
};
