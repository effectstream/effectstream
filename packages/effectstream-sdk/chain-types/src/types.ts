import type {
  BlockNumber,
  EvmAddress,
  HexString0x,
  TimestampMs,
  UnknownFormat,
} from "@effectstream/utils";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
} from "@effectstream/config";

export type InputDataString = string;
export type NonceString = HexString0x;

export type ScheduleTrigger = { blockHeight: BlockNumber } | {
  /*
   * This will be always lower or equal than the underlying block's timestamp
   */
  timestamp: TimestampMs;
};

/**
 * Primitive triggered by Paima itself (ex: timer)
 */
export type IntrinsicPrimitive = {
  extrinsic: false;
  trigger: ScheduleTrigger;
  /** STF input */
  inputData: InputDataString;
  /** precompile that triggered the primitive */
  precompile: EvmAddress;
};
/**
 * Primitive triggered by a chain Paima is monitoring
 */
export type ExtrinsicPrimitive = {
  extrinsic: true;
  /** primitive that triggered this event */
  info: FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType
  >;
};

export type PrimitiveCommon = {
  /** STF input */
  inputData: InputDataString;
};
export type BasePrimitive = IntrinsicPrimitive | ExtrinsicPrimitive;

export type PreExecutionBlockHeaderV1 = {
  mainChainBlochHash: UnknownFormat;
  blockHeight: BlockNumber;
  /**
   * If there is no previous block, this is null
   */
  prevBlockHash: UnknownFormat | null;
  /** in milliseconds */
  msTimestamp: TimestampMs;
};

type BlockVersions = 1;

type Max<N extends number, A extends any[] = []> = [N] extends
  [Partial<A>["length"]] ? A["length"]
  : Max<N, [0, ...A]>;

/**
 * Block header (see: ChainData for the full block)
 */
export type PerVersionPreExecutionBlockHeader<Version extends BlockVersions> = {
  version: Version;
} & (Version extends 1 ? PreExecutionBlockHeaderV1 : never);

/**
 * Modify the version number here when needed
 */
export type PreExecutionBlockHeader = PerVersionPreExecutionBlockHeader<
  Max<BlockVersions>
>;

/**
 * Careful: update version number if this struct changes
 */
export type PostExecutionBlockHeader<Version extends BlockVersions> =
  & PerVersionPreExecutionBlockHeader<Version>
  & {
    successTxsHash: UnknownFormat;
    /**
     * note: this may not contain all failed txs
     *       notably, it excludes any tx that failed before it got to the STF call
     */
    failedTxsHash: UnknownFormat;
  };
