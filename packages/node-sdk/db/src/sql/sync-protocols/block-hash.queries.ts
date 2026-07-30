/** Types generated for queries found in "src/sql/sync-protocols/block-hash.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'UpsertBlockHash' parameters type */
export interface IUpsertBlockHashParams {
  block_hash: string;
  block_number: number;
  effectstream_block_height: number;
  protocol_name: string;
}

/** 'UpsertBlockHash' return type */
export type IUpsertBlockHashResult = void;

/** 'UpsertBlockHash' query type */
export interface IUpsertBlockHashQuery {
  params: IUpsertBlockHashParams;
  result: IUpsertBlockHashResult;
}

const upsertBlockHashIR: any = {"usedParamSet":{"protocol_name":true,"block_number":true,"block_hash":true,"effectstream_block_height":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":152,"b":166}]},{"name":"block_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":171,"b":184}]},{"name":"block_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":189,"b":200}]},{"name":"effectstream_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":205,"b":231}]}],"statement":"INSERT INTO\n  effectstream.sync_protocol_block_hash (\n    protocol_name,\n    block_number,\n    block_hash,\n    effectstream_block_height\n  )\nVALUES (\n  :protocol_name!,\n  :block_number!,\n  :block_hash!,\n  :effectstream_block_height!\n)\nON CONFLICT (protocol_name, block_number) DO UPDATE SET\n  block_hash = EXCLUDED.block_hash,\n  effectstream_block_height = EXCLUDED.effectstream_block_height"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO
 *   effectstream.sync_protocol_block_hash (
 *     protocol_name,
 *     block_number,
 *     block_hash,
 *     effectstream_block_height
 *   )
 * VALUES (
 *   :protocol_name!,
 *   :block_number!,
 *   :block_hash!,
 *   :effectstream_block_height!
 * )
 * ON CONFLICT (protocol_name, block_number) DO UPDATE SET
 *   block_hash = EXCLUDED.block_hash,
 *   effectstream_block_height = EXCLUDED.effectstream_block_height
 * ```
 */
export const upsertBlockHash = new PreparedQuery<IUpsertBlockHashParams,IUpsertBlockHashResult>(upsertBlockHashIR);


/** 'GetBlockHash' parameters type */
export interface IGetBlockHashParams {
  block_number: number;
  protocol_name: string;
}

/** 'GetBlockHash' return type */
export interface IGetBlockHashResult {
  block_hash: string;
  block_number: number;
  effectstream_block_height: number;
  protocol_name: string;
}

/** 'GetBlockHash' query type */
export interface IGetBlockHashQuery {
  params: IGetBlockHashParams;
  result: IGetBlockHashResult;
}

const getBlockHashIR: any = {"usedParamSet":{"protocol_name":true,"block_number":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":88}]},{"name":"block_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":111,"b":124}]}],"statement":"SELECT * FROM effectstream.sync_protocol_block_hash\nWHERE protocol_name = :protocol_name!\n  AND block_number = :block_number!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.sync_protocol_block_hash
 * WHERE protocol_name = :protocol_name!
 *   AND block_number = :block_number!
 * ```
 */
export const getBlockHash = new PreparedQuery<IGetBlockHashParams,IGetBlockHashResult>(getBlockHashIR);


/** 'GetLatestBlockHash' parameters type */
export interface IGetLatestBlockHashParams {
  protocol_name: string;
}

/** 'GetLatestBlockHash' return type */
export interface IGetLatestBlockHashResult {
  block_hash: string;
  block_number: number;
  effectstream_block_height: number;
  protocol_name: string;
}

/** 'GetLatestBlockHash' query type */
export interface IGetLatestBlockHashQuery {
  params: IGetLatestBlockHashParams;
  result: IGetLatestBlockHashResult;
}

const getLatestBlockHashIR: any = {"usedParamSet":{"protocol_name":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":88}]}],"statement":"SELECT * FROM effectstream.sync_protocol_block_hash\nWHERE protocol_name = :protocol_name!\nORDER BY block_number DESC\nLIMIT 1                                                                                                                               "};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.sync_protocol_block_hash
 * WHERE protocol_name = :protocol_name!
 * ORDER BY block_number DESC
 * LIMIT 1                                                                                                                               
 * ```
 */
export const getLatestBlockHash = new PreparedQuery<IGetLatestBlockHashParams,IGetLatestBlockHashResult>(getLatestBlockHashIR);


/** 'GetBlockHashesFrom' parameters type */
export interface IGetBlockHashesFromParams {
  block_number: number;
  protocol_name: string;
}

/** 'GetBlockHashesFrom' return type */
export interface IGetBlockHashesFromResult {
  block_hash: string;
  block_number: number;
  effectstream_block_height: number;
  protocol_name: string;
}

/** 'GetBlockHashesFrom' query type */
export interface IGetBlockHashesFromQuery {
  params: IGetBlockHashesFromParams;
  result: IGetBlockHashesFromResult;
}

const getBlockHashesFromIR: any = {"usedParamSet":{"protocol_name":true,"block_number":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":88}]},{"name":"block_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":125}]}],"statement":"SELECT * FROM effectstream.sync_protocol_block_hash\nWHERE protocol_name = :protocol_name!\n  AND block_number >= :block_number!\nORDER BY block_number ASC                                                                        "};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.sync_protocol_block_hash
 * WHERE protocol_name = :protocol_name!
 *   AND block_number >= :block_number!
 * ORDER BY block_number ASC                                                                        
 * ```
 */
export const getBlockHashesFrom = new PreparedQuery<IGetBlockHashesFromParams,IGetBlockHashesFromResult>(getBlockHashesFromIR);


/** 'PruneBlockHashes' parameters type */
export interface IPruneBlockHashesParams {
  block_number: number;
  protocol_name: string;
}

/** 'PruneBlockHashes' return type */
export type IPruneBlockHashesResult = void;

/** 'PruneBlockHashes' query type */
export interface IPruneBlockHashesQuery {
  params: IPruneBlockHashesParams;
  result: IPruneBlockHashesResult;
}

const pruneBlockHashesIR: any = {"usedParamSet":{"protocol_name":true,"block_number":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":86}]},{"name":"block_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":122}]}],"statement":"DELETE FROM effectstream.sync_protocol_block_hash\nWHERE protocol_name = :protocol_name!\n  AND block_number < :block_number!                                                                                                                                                                      "};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM effectstream.sync_protocol_block_hash
 * WHERE protocol_name = :protocol_name!
 *   AND block_number < :block_number!                                                                                                                                                                      
 * ```
 */
export const pruneBlockHashes = new PreparedQuery<IPruneBlockHashesParams,IPruneBlockHashesResult>(pruneBlockHashesIR);


/** 'GetEffectstreamHeightForSourceBlock' parameters type */
export interface IGetEffectstreamHeightForSourceBlockParams {
  block_number: number;
  protocol_name: string;
}

/** 'GetEffectstreamHeightForSourceBlock' return type */
export interface IGetEffectstreamHeightForSourceBlockResult {
  min_height: number | null;
}

/** 'GetEffectstreamHeightForSourceBlock' query type */
export interface IGetEffectstreamHeightForSourceBlockQuery {
  params: IGetEffectstreamHeightForSourceBlockParams;
  result: IGetEffectstreamHeightForSourceBlockResult;
}

const getEffectstreamHeightForSourceBlockIR: any = {"usedParamSet":{"protocol_name":true,"block_number":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":117,"b":131}]},{"name":"block_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":155,"b":168}]}],"statement":"SELECT MIN(effectstream_block_height) AS min_height\nFROM effectstream.sync_protocol_block_hash\nWHERE protocol_name = :protocol_name!\n  AND block_number >= :block_number!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT MIN(effectstream_block_height) AS min_height
 * FROM effectstream.sync_protocol_block_hash
 * WHERE protocol_name = :protocol_name!
 *   AND block_number >= :block_number!
 * ```
 */
export const getEffectstreamHeightForSourceBlock = new PreparedQuery<IGetEffectstreamHeightForSourceBlockParams,IGetEffectstreamHeightForSourceBlockResult>(getEffectstreamHeightForSourceBlockIR);


