/** Types generated for queries found in "src/sql/block-heights.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { Buffer } from 'node:buffer';

export type DateOrString = Date | string;

/** 'GetLatestProcessedBlockHeight' parameters type */
export type IGetLatestProcessedBlockHeightParams = void;

/** 'GetLatestProcessedBlockHeight' return type */
export interface IGetLatestProcessedBlockHeightResult {
  block_height: number;
  effectstream_block_hash: Buffer | null;
  main_chain_block_hash: Buffer;
  ms_timestamp: Date;
  seed: string;
  ver: number;
}

/** 'GetLatestProcessedBlockHeight' query type */
export interface IGetLatestProcessedBlockHeightQuery {
  params: IGetLatestProcessedBlockHeightParams;
  result: IGetLatestProcessedBlockHeightResult;
}

const getLatestProcessedBlockHeightIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM effectstream.effectstream_blocks\nWHERE effectstream_block_hash IS NOT NULL\nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.effectstream_blocks
 * WHERE effectstream_block_hash IS NOT NULL
 * ORDER BY block_height DESC
 * LIMIT 1
 * ```
 */
export const getLatestProcessedBlockHeight = new PreparedQuery<IGetLatestProcessedBlockHeightParams,IGetLatestProcessedBlockHeightResult>(getLatestProcessedBlockHeightIR);


/** 'GetBlockSeeds' parameters type */
export type IGetBlockSeedsParams = void;

/** 'GetBlockSeeds' return type */
export interface IGetBlockSeedsResult {
  seed: string;
}

/** 'GetBlockSeeds' query type */
export interface IGetBlockSeedsQuery {
  params: IGetBlockSeedsParams;
  result: IGetBlockSeedsResult;
}

const getBlockSeedsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT seed FROM effectstream.effectstream_blocks\nWHERE effectstream_block_hash IS NOT NULL\nORDER BY block_height DESC\nLIMIT 25"};

/**
 * Query generated from SQL:
 * ```
 * SELECT seed FROM effectstream.effectstream_blocks
 * WHERE effectstream_block_hash IS NOT NULL
 * ORDER BY block_height DESC
 * LIMIT 25
 * ```
 */
export const getBlockSeeds = new PreparedQuery<IGetBlockSeedsParams,IGetBlockSeedsResult>(getBlockSeedsIR);


/** 'GetBlockHeights' parameters type */
export interface IGetBlockHeightsParams {
  block_heights: readonly (number)[];
}

/** 'GetBlockHeights' return type */
export interface IGetBlockHeightsResult {
  block_height: number;
  effectstream_block_hash: Buffer | null;
  main_chain_block_hash: Buffer;
  ms_timestamp: Date;
  seed: string;
  ver: number;
}

/** 'GetBlockHeights' query type */
export interface IGetBlockHeightsQuery {
  params: IGetBlockHeightsParams;
  result: IGetBlockHeightsResult;
}

const getBlockHeightsIR: any = {"usedParamSet":{"block_heights":true},"params":[{"name":"block_heights","required":true,"transform":{"type":"array_spread"},"locs":[{"a":70,"b":84}]}],"statement":"SELECT * FROM effectstream.effectstream_blocks \nWHERE block_height IN :block_heights!\nORDER BY block_height ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.effectstream_blocks 
 * WHERE block_height IN :block_heights!
 * ORDER BY block_height ASC
 * ```
 */
export const getBlockHeights = new PreparedQuery<IGetBlockHeightsParams,IGetBlockHeightsResult>(getBlockHeightsIR);


/** 'GetBlockByHash' parameters type */
export interface IGetBlockByHashParams {
  block_hash: Buffer;
}

/** 'GetBlockByHash' return type */
export interface IGetBlockByHashResult {
  block_height: number;
  effectstream_block_hash: Buffer | null;
  main_chain_block_hash: Buffer;
  ms_timestamp: Date;
  prev_block: Buffer | null;
  seed: string;
  ver: number;
}

/** 'GetBlockByHash' query type */
export interface IGetBlockByHashQuery {
  params: IGetBlockByHashParams;
  result: IGetBlockByHashResult;
}

const getBlockByHashIR: any = {"usedParamSet":{"block_hash":true},"params":[{"name":"block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":233,"b":244},{"a":278,"b":289}]}],"statement":"SELECT curr.*, prev.effectstream_block_hash as \"prev_block\"\nFROM effectstream.effectstream_blocks curr\nLEFT JOIN effectstream.effectstream_blocks prev ON prev.block_height = curr.block_height - 1\nWHERE curr.effectstream_block_hash = :block_hash! OR curr.main_chain_block_hash = :block_hash!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT curr.*, prev.effectstream_block_hash as "prev_block"
 * FROM effectstream.effectstream_blocks curr
 * LEFT JOIN effectstream.effectstream_blocks prev ON prev.block_height = curr.block_height - 1
 * WHERE curr.effectstream_block_hash = :block_hash! OR curr.main_chain_block_hash = :block_hash!
 * ```
 */
export const getBlockByHash = new PreparedQuery<IGetBlockByHashParams,IGetBlockByHashResult>(getBlockByHashIR);


/** 'SaveLastBlock' parameters type */
export interface ISaveLastBlockParams {
  block_height: number;
  main_chain_block_hash: Buffer;
  ms_timestamp: DateOrString;
  seed: string;
  ver: number;
}

/** 'SaveLastBlock' return type */
export type ISaveLastBlockResult = void;

/** 'SaveLastBlock' query type */
export interface ISaveLastBlockQuery {
  params: ISaveLastBlockParams;
  result: ISaveLastBlockResult;
}

const saveLastBlockIR: any = {"usedParamSet":{"block_height":true,"ver":true,"main_chain_block_hash":true,"seed":true,"ms_timestamp":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":153}]},{"name":"ver","required":true,"transform":{"type":"scalar"},"locs":[{"a":156,"b":160}]},{"name":"main_chain_block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":163,"b":185}]},{"name":"seed","required":true,"transform":{"type":"scalar"},"locs":[{"a":188,"b":193}]},{"name":"ms_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":196,"b":209}]}],"statement":"INSERT INTO effectstream.effectstream_blocks(block_height, ver, main_chain_block_hash, seed, ms_timestamp, effectstream_block_hash)\nVALUES (:block_height!, :ver!, :main_chain_block_hash!, :seed!, :ms_timestamp!, NULL)\nON CONFLICT (block_height)\nDO UPDATE SET\nblock_height = EXCLUDED.block_height,\nver = EXCLUDED.ver,\nmain_chain_block_hash = EXCLUDED.main_chain_block_hash,\nseed = EXCLUDED.seed,\nms_timestamp = EXCLUDED.ms_timestamp,\neffectstream_block_hash = EXCLUDED.effectstream_block_hash"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.effectstream_blocks(block_height, ver, main_chain_block_hash, seed, ms_timestamp, effectstream_block_hash)
 * VALUES (:block_height!, :ver!, :main_chain_block_hash!, :seed!, :ms_timestamp!, NULL)
 * ON CONFLICT (block_height)
 * DO UPDATE SET
 * block_height = EXCLUDED.block_height,
 * ver = EXCLUDED.ver,
 * main_chain_block_hash = EXCLUDED.main_chain_block_hash,
 * seed = EXCLUDED.seed,
 * ms_timestamp = EXCLUDED.ms_timestamp,
 * effectstream_block_hash = EXCLUDED.effectstream_block_hash
 * ```
 */
export const saveLastBlock = new PreparedQuery<ISaveLastBlockParams,ISaveLastBlockResult>(saveLastBlockIR);


/** 'GetLastNonEmptyBlockHash' parameters type */
export type IGetLastNonEmptyBlockHashParams = void;

/** 'GetLastNonEmptyBlockHash' return type */
export interface IGetLastNonEmptyBlockHashResult {
  effectstream_block_hash: Buffer | null;
}

/** 'GetLastNonEmptyBlockHash' query type */
export interface IGetLastNonEmptyBlockHashQuery {
  params: IGetLastNonEmptyBlockHashParams;
  result: IGetLastNonEmptyBlockHashResult;
}

const getLastNonEmptyBlockHashIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT effectstream_block_hash FROM effectstream.effectstream_blocks\nWHERE effectstream_block_hash IS NOT NULL\n  AND effectstream_block_hash != '\\x307830'::bytea\nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT effectstream_block_hash FROM effectstream.effectstream_blocks
 * WHERE effectstream_block_hash IS NOT NULL
 *   AND effectstream_block_hash != '\x307830'::bytea
 * ORDER BY block_height DESC
 * LIMIT 1
 * ```
 */
export const getLastNonEmptyBlockHash = new PreparedQuery<IGetLastNonEmptyBlockHashParams,IGetLastNonEmptyBlockHashResult>(getLastNonEmptyBlockHashIR);

/** 'BlockHeightDone' parameters type */
export interface IBlockHeightDoneParams {
  block_hash: Buffer;
  block_height: number;
}

/** 'BlockHeightDone' return type */
export type IBlockHeightDoneResult = void;

/** 'BlockHeightDone' query type */
export interface IBlockHeightDoneQuery {
  params: IBlockHeightDoneParams;
  result: IBlockHeightDoneResult;
}

/** 'DeleteEmptyBlocks' parameters type */
export type IDeleteEmptyBlocksParams = void;

/** 'DeleteEmptyBlocks' return type */
export type IDeleteEmptyBlocksResult = void;

/** 'DeleteEmptyBlocks' query type */
export interface IDeleteEmptyBlocksQuery {
  params: IDeleteEmptyBlocksParams;
  result: IDeleteEmptyBlocksResult;
}

const deleteEmptyBlocksIR: any = {"usedParamSet":{},"params":[],"statement":"DELETE FROM effectstream.effectstream_blocks\nWHERE effectstream_block_hash = '\\x307830'::bytea"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM effectstream.effectstream_blocks
 * WHERE effectstream_block_hash = '\x307830'::bytea
 * ```
 */
export const deleteEmptyBlocks = new PreparedQuery<IDeleteEmptyBlocksParams,IDeleteEmptyBlocksResult>(deleteEmptyBlocksIR);

const blockHeightDoneIR: any = {"usedParamSet":{"block_hash":true,"block_height":true},"params":[{"name":"block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":81}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":117}]}],"statement":"UPDATE effectstream.effectstream_blocks\nSET\neffectstream_block_hash = :block_hash!\nWHERE block_height = :block_height!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE effectstream.effectstream_blocks
 * SET
 * effectstream_block_hash = :block_hash!
 * WHERE block_height = :block_height!
 * ```
 */
export const blockHeightDone = new PreparedQuery<IBlockHeightDoneParams,IBlockHeightDoneResult>(blockHeightDoneIR);


