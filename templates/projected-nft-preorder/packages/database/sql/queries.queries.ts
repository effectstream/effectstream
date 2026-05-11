/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'InsertNftLock' parameters type */
export interface IInsertNftLockParams {
  asset_name: string;
  block_height: number;
  current_output_index?: string | null | void;
  current_tx_id: string;
  for_how_long?: string | null | void;
  owner_address: string;
  policy_id: string;
  previous_output_index?: string | null | void;
  previous_tx_id?: string | null | void;
  status: string;
}

/** 'InsertNftLock' return type */
export type IInsertNftLockResult = void;

/** 'InsertNftLock' query type */
export interface IInsertNftLockQuery {
  params: IInsertNftLockParams;
  result: IInsertNftLockResult;
}

const insertNftLockIR: any = {"usedParamSet":{"owner_address":true,"policy_id":true,"asset_name":true,"status":true,"current_tx_id":true,"previous_tx_id":true,"current_output_index":true,"previous_output_index":true,"for_how_long":true,"block_height":true},"params":[{"name":"owner_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":189,"b":203}]},{"name":"policy_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":206,"b":216}]},{"name":"asset_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":219,"b":230}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":233,"b":240}]},{"name":"current_tx_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":243,"b":257}]},{"name":"previous_tx_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":260,"b":274}]},{"name":"current_output_index","required":false,"transform":{"type":"scalar"},"locs":[{"a":277,"b":297}]},{"name":"previous_output_index","required":false,"transform":{"type":"scalar"},"locs":[{"a":300,"b":321}]},{"name":"for_how_long","required":false,"transform":{"type":"scalar"},"locs":[{"a":324,"b":336}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":339,"b":352}]}],"statement":"INSERT INTO nft_locks\n    (owner_address, policy_id, asset_name, status, current_tx_id, previous_tx_id, current_output_index, previous_output_index, for_how_long, block_height)\nVALUES\n    (:owner_address!, :policy_id!, :asset_name!, :status!, :current_tx_id!, :previous_tx_id, :current_output_index, :previous_output_index, :for_how_long, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO nft_locks
 *     (owner_address, policy_id, asset_name, status, current_tx_id, previous_tx_id, current_output_index, previous_output_index, for_how_long, block_height)
 * VALUES
 *     (:owner_address!, :policy_id!, :asset_name!, :status!, :current_tx_id!, :previous_tx_id, :current_output_index, :previous_output_index, :for_how_long, :block_height!)
 * ```
 */
export const insertNftLock = new PreparedQuery<IInsertNftLockParams,IInsertNftLockResult>(insertNftLockIR);


/** 'GetNftLocks' parameters type */
export type IGetNftLocksParams = void;

/** 'GetNftLocks' return type */
export interface IGetNftLocksResult {
  asset_name: string;
  block_height: number;
  created_at: Date | null;
  current_output_index: string | null;
  current_tx_id: string;
  for_how_long: string | null;
  id: number;
  owner_address: string;
  policy_id: string;
  previous_output_index: string | null;
  previous_tx_id: string | null;
  status: string;
}

/** 'GetNftLocks' query type */
export interface IGetNftLocksQuery {
  params: IGetNftLocksParams;
  result: IGetNftLocksResult;
}

const getNftLocksIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM nft_locks ORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM nft_locks ORDER BY id DESC
 * ```
 */
export const getNftLocks = new PreparedQuery<IGetNftLocksParams,IGetNftLocksResult>(getNftLocksIR);


/** 'GetNftLocksByOwner' parameters type */
export interface IGetNftLocksByOwnerParams {
  owner_address: string;
}

/** 'GetNftLocksByOwner' return type */
export interface IGetNftLocksByOwnerResult {
  asset_name: string;
  block_height: number;
  created_at: Date | null;
  current_output_index: string | null;
  current_tx_id: string;
  for_how_long: string | null;
  id: number;
  owner_address: string;
  policy_id: string;
  previous_output_index: string | null;
  previous_tx_id: string | null;
  status: string;
}

/** 'GetNftLocksByOwner' query type */
export interface IGetNftLocksByOwnerQuery {
  params: IGetNftLocksByOwnerParams;
  result: IGetNftLocksByOwnerResult;
}

const getNftLocksByOwnerIR: any = {"usedParamSet":{"owner_address":true},"params":[{"name":"owner_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":60}]}],"statement":"SELECT * FROM nft_locks\nWHERE owner_address = :owner_address!\nORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM nft_locks
 * WHERE owner_address = :owner_address!
 * ORDER BY id DESC
 * ```
 */
export const getNftLocksByOwner = new PreparedQuery<IGetNftLocksByOwnerParams,IGetNftLocksByOwnerResult>(getNftLocksByOwnerIR);


/** 'GetNftLocksByStatus' parameters type */
export interface IGetNftLocksByStatusParams {
  status: string;
}

/** 'GetNftLocksByStatus' return type */
export interface IGetNftLocksByStatusResult {
  asset_name: string;
  block_height: number;
  created_at: Date | null;
  current_output_index: string | null;
  current_tx_id: string;
  for_how_long: string | null;
  id: number;
  owner_address: string;
  policy_id: string;
  previous_output_index: string | null;
  previous_tx_id: string | null;
  status: string;
}

/** 'GetNftLocksByStatus' query type */
export interface IGetNftLocksByStatusQuery {
  params: IGetNftLocksByStatusParams;
  result: IGetNftLocksByStatusResult;
}

const getNftLocksByStatusIR: any = {"usedParamSet":{"status":true},"params":[{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":46}]}],"statement":"SELECT * FROM nft_locks\nWHERE status = :status!\nORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM nft_locks
 * WHERE status = :status!
 * ORDER BY id DESC
 * ```
 */
export const getNftLocksByStatus = new PreparedQuery<IGetNftLocksByStatusParams,IGetNftLocksByStatusResult>(getNftLocksByStatusIR);


/** 'GetActiveNftLockByAsset' parameters type */
export interface IGetActiveNftLockByAssetParams {
  asset_name: string;
  policy_id: string;
}

/** 'GetActiveNftLockByAsset' return type */
export interface IGetActiveNftLockByAssetResult {
  asset_name: string;
  block_height: number;
  created_at: Date | null;
  current_output_index: string | null;
  current_tx_id: string;
  for_how_long: string | null;
  id: number;
  owner_address: string;
  policy_id: string;
  previous_output_index: string | null;
  previous_tx_id: string | null;
  status: string;
}

/** 'GetActiveNftLockByAsset' query type */
export interface IGetActiveNftLockByAssetQuery {
  params: IGetActiveNftLockByAssetParams;
  result: IGetActiveNftLockByAssetResult;
}

const getActiveNftLockByAssetIR: any = {"usedParamSet":{"policy_id":true,"asset_name":true},"params":[{"name":"policy_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":42,"b":52}]},{"name":"asset_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":84}]}],"statement":"SELECT * FROM nft_locks\nWHERE policy_id = :policy_id!\n  AND asset_name = :asset_name!\n  AND status = 'Lock'\nORDER BY id DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM nft_locks
 * WHERE policy_id = :policy_id!
 *   AND asset_name = :asset_name!
 *   AND status = 'Lock'
 * ORDER BY id DESC
 * LIMIT 1
 * ```
 */
export const getActiveNftLockByAsset = new PreparedQuery<IGetActiveNftLockByAssetParams,IGetActiveNftLockByAssetResult>(getActiveNftLockByAssetIR);


/** 'NftLocksTableExists' parameters type */
export type INftLocksTableExistsParams = void;

/** 'NftLocksTableExists' return type */
export interface INftLocksTableExistsResult {
  exists: boolean | null;
}

/** 'NftLocksTableExists' query type */
export interface INftLocksTableExistsQuery {
  params: INftLocksTableExistsParams;
  result: INftLocksTableExistsResult;
}

const nftLocksTableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables\n    WHERE  table_schema = 'public'\n    AND    table_name   = 'nft_locks'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables
 *     WHERE  table_schema = 'public'
 *     AND    table_name   = 'nft_locks'
 * )
 * ```
 */
export const nftLocksTableExists = new PreparedQuery<INftLocksTableExistsParams,INftLocksTableExistsResult>(nftLocksTableExistsIR);
