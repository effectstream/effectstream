/** Types generated for queries found in "src/sql/block-heights.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'GetLatestProcessedBlockHeight' parameters type */
export type IGetLatestProcessedBlockHeightParams = void;

/** 'GetLatestProcessedBlockHeight' return type */
export interface IGetLatestProcessedBlockHeightResult {
  block_height: number;
  main_chain_block_hash: Buffer;
  ms_timestamp: Date;
  paima_block_hash: Buffer | null;
  seed: string;
  ver: number;
}

/** 'GetLatestProcessedBlockHeight' query type */
export interface IGetLatestProcessedBlockHeightQuery {
  params: IGetLatestProcessedBlockHeightParams;
  result: IGetLatestProcessedBlockHeightResult;
}

const getLatestProcessedBlockHeightIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM paima_blocks\nWHERE paima_block_hash IS NOT NULL\nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima_blocks
 * WHERE paima_block_hash IS NOT NULL
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

const getBlockSeedsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT seed FROM paima_blocks\nWHERE paima_block_hash IS NOT NULL\nORDER BY block_height DESC\nLIMIT 25"};

/**
 * Query generated from SQL:
 * ```
 * SELECT seed FROM paima_blocks
 * WHERE paima_block_hash IS NOT NULL
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
  main_chain_block_hash: Buffer;
  ms_timestamp: Date;
  paima_block_hash: Buffer | null;
  seed: string;
  ver: number;
}

/** 'GetBlockHeights' query type */
export interface IGetBlockHeightsQuery {
  params: IGetBlockHeightsParams;
  result: IGetBlockHeightsResult;
}

const getBlockHeightsIR: any = {"usedParamSet":{"block_heights":true},"params":[{"name":"block_heights","required":true,"transform":{"type":"array_spread"},"locs":[{"a":50,"b":64}]}],"statement":"SELECT * FROM paima_blocks \nWHERE block_height IN :block_heights!\nORDER BY block_height ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima_blocks 
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
  main_chain_block_hash: Buffer;
  ms_timestamp: Date;
  paima_block_hash: Buffer | null;
  prev_block: Buffer | null;
  seed: string;
  ver: number;
}

/** 'GetBlockByHash' query type */
export interface IGetBlockByHashQuery {
  params: IGetBlockByHashParams;
  result: IGetBlockByHashResult;
}

const getBlockByHashIR: any = {"usedParamSet":{"block_hash":true},"params":[{"name":"block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":179,"b":190},{"a":224,"b":235}]}],"statement":"SELECT curr.*, prev.paima_block_hash as \"prev_block\"\nFROM paima_blocks curr\nLEFT JOIN paima_blocks prev ON prev.block_height = curr.block_height - 1\nWHERE curr.paima_block_hash = :block_hash! OR curr.main_chain_block_hash = :block_hash!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT curr.*, prev.paima_block_hash as "prev_block"
 * FROM paima_blocks curr
 * LEFT JOIN paima_blocks prev ON prev.block_height = curr.block_height - 1
 * WHERE curr.paima_block_hash = :block_hash! OR curr.main_chain_block_hash = :block_hash!
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

const saveLastBlockIR: any = {"usedParamSet":{"block_height":true,"ver":true,"main_chain_block_hash":true,"seed":true,"ms_timestamp":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":126}]},{"name":"ver","required":true,"transform":{"type":"scalar"},"locs":[{"a":129,"b":133}]},{"name":"main_chain_block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":158}]},{"name":"seed","required":true,"transform":{"type":"scalar"},"locs":[{"a":161,"b":166}]},{"name":"ms_timestamp","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":182}]}],"statement":"INSERT INTO paima_blocks(block_height, ver, main_chain_block_hash, seed, ms_timestamp, paima_block_hash)\nVALUES (:block_height!, :ver!, :main_chain_block_hash!, :seed!, :ms_timestamp!, NULL)\nON CONFLICT (block_height)\nDO UPDATE SET\nblock_height = EXCLUDED.block_height,\nver = EXCLUDED.ver,\nmain_chain_block_hash = EXCLUDED.main_chain_block_hash,\nseed = EXCLUDED.seed,\nms_timestamp = EXCLUDED.ms_timestamp,\npaima_block_hash = EXCLUDED.paima_block_hash"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima_blocks(block_height, ver, main_chain_block_hash, seed, ms_timestamp, paima_block_hash)
 * VALUES (:block_height!, :ver!, :main_chain_block_hash!, :seed!, :ms_timestamp!, NULL)
 * ON CONFLICT (block_height)
 * DO UPDATE SET
 * block_height = EXCLUDED.block_height,
 * ver = EXCLUDED.ver,
 * main_chain_block_hash = EXCLUDED.main_chain_block_hash,
 * seed = EXCLUDED.seed,
 * ms_timestamp = EXCLUDED.ms_timestamp,
 * paima_block_hash = EXCLUDED.paima_block_hash
 * ```
 */
export const saveLastBlock = new PreparedQuery<ISaveLastBlockParams,ISaveLastBlockResult>(saveLastBlockIR);


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

const blockHeightDoneIR: any = {"usedParamSet":{"block_hash":true,"block_height":true},"params":[{"name":"block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":54}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":77,"b":90}]}],"statement":"UPDATE paima_blocks\nSET\npaima_block_hash = :block_hash!\nWHERE block_height = :block_height!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE paima_blocks
 * SET
 * paima_block_hash = :block_hash!
 * WHERE block_height = :block_height!
 * ```
 */
export const blockHeightDone = new PreparedQuery<IBlockHeightDoneParams,IBlockHeightDoneResult>(blockHeightDoneIR);


