/** Types generated for queries found in "core/sql/queries/database-storage.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type NumberOrString = number | string;

/** 'CountPendingInputs' parameters type */
export type ICountPendingInputsParams = void;

/** 'CountPendingInputs' return type */
export interface ICountPendingInputsResult {
  count: number | null;
}

/** 'CountPendingInputs' query type */
export interface ICountPendingInputsQuery {
  params: ICountPendingInputsParams;
  result: ICountPendingInputsResult;
}

const countPendingInputsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT count(*)::int AS count\nFROM pending_inputs"};

/**
 * Query generated from SQL:
 * ```
 * SELECT count(*)::int AS count
 * FROM pending_inputs
 * ```
 */
export const countPendingInputs = new PreparedQuery<ICountPendingInputsParams,ICountPendingInputsResult>(countPendingInputsIR);


/** 'SynthesizeQueuedStatuses' parameters type */
export type ISynthesizeQueuedStatusesParams = void;

/** 'SynthesizeQueuedStatuses' return type */
export interface ISynthesizeQueuedStatusesResult {
  request_id: string;
}

/** 'SynthesizeQueuedStatuses' query type */
export interface ISynthesizeQueuedStatusesQuery {
  params: ISynthesizeQueuedStatusesParams;
  result: ISynthesizeQueuedStatusesResult;
}

const synthesizeQueuedStatusesIR: any = {"usedParamSet":{},"params":[],"statement":"INSERT INTO request_status\n  (request_id, row_target, address, state, terminal, retry_count, accepted_at, updated_at)\nSELECT p.request_id,\n       min(p.row_target),\n       min(p.address),\n       'queued',\n       false,\n       min(p.retry_count),\n       min(p.created_at),\n       now()\nFROM pending_inputs p\nLEFT JOIN request_status s ON s.request_id = p.request_id\nWHERE s.request_id IS NULL\nGROUP BY p.request_id\nRETURNING request_id"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO request_status
 *   (request_id, row_target, address, state, terminal, retry_count, accepted_at, updated_at)
 * SELECT p.request_id,
 *        min(p.row_target),
 *        min(p.address),
 *        'queued',
 *        false,
 *        min(p.retry_count),
 *        min(p.created_at),
 *        now()
 * FROM pending_inputs p
 * LEFT JOIN request_status s ON s.request_id = p.request_id
 * WHERE s.request_id IS NULL
 * GROUP BY p.request_id
 * RETURNING request_id
 * ```
 */
export const synthesizeQueuedStatuses = new PreparedQuery<ISynthesizeQueuedStatusesParams,ISynthesizeQueuedStatusesResult>(synthesizeQueuedStatusesIR);


/** 'CountOrphanedStatuses' parameters type */
export type ICountOrphanedStatusesParams = void;

/** 'CountOrphanedStatuses' return type */
export interface ICountOrphanedStatusesResult {
  count: number | null;
}

/** 'CountOrphanedStatuses' query type */
export interface ICountOrphanedStatusesQuery {
  params: ICountOrphanedStatusesParams;
  result: ICountOrphanedStatusesResult;
}

const countOrphanedStatusesIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT count(*)::int AS count\nFROM request_status s\nWHERE NOT s.terminal\n  AND NOT EXISTS (\n    SELECT 1\n    FROM pending_inputs p\n    WHERE p.request_id = s.request_id\n  )"};

/**
 * Query generated from SQL:
 * ```
 * SELECT count(*)::int AS count
 * FROM request_status s
 * WHERE NOT s.terminal
 *   AND NOT EXISTS (
 *     SELECT 1
 *     FROM pending_inputs p
 *     WHERE p.request_id = s.request_id
 *   )
 * ```
 */
export const countOrphanedStatuses = new PreparedQuery<ICountOrphanedStatusesParams,ICountOrphanedStatusesResult>(countOrphanedStatusesIR);


/** 'InsertPendingInput' parameters type */
export interface IInsertPendingInputParams {
  address: string;
  address_type: number;
  content_key: string;
  input: string;
  payload: string;
  request_id: string;
  retry_count: number;
  row_target: string;
  signature: string;
  ts: string;
}

/** 'InsertPendingInput' return type */
export type IInsertPendingInputResult = void;

/** 'InsertPendingInput' query type */
export interface IInsertPendingInputQuery {
  params: IInsertPendingInputParams;
  result: IInsertPendingInputResult;
}

const insertPendingInputIR: any = {"usedParamSet":{"content_key":true,"request_id":true,"row_target":true,"address":true,"address_type":true,"ts":true,"signature":true,"input":true,"retry_count":true,"payload":true},"params":[{"name":"content_key","required":true,"transform":{"type":"scalar"},"locs":[{"a":147,"b":159}]},{"name":"request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":162,"b":173}]},{"name":"row_target","required":true,"transform":{"type":"scalar"},"locs":[{"a":176,"b":187}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":190,"b":198}]},{"name":"address_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":201,"b":214}]},{"name":"ts","required":true,"transform":{"type":"scalar"},"locs":[{"a":217,"b":220}]},{"name":"signature","required":true,"transform":{"type":"scalar"},"locs":[{"a":226,"b":236}]},{"name":"input","required":true,"transform":{"type":"scalar"},"locs":[{"a":239,"b":245}]},{"name":"retry_count","required":true,"transform":{"type":"scalar"},"locs":[{"a":248,"b":260}]},{"name":"payload","required":true,"transform":{"type":"scalar"},"locs":[{"a":263,"b":271}]}],"statement":"INSERT INTO pending_inputs\n  (content_key, request_id, row_target, address, address_type, ts,\n   signature, input, retry_count, payload)\nVALUES\n  (:content_key!, :request_id!, :row_target!, :address!, :address_type!, :ts!,\n   :signature!, :input!, :retry_count!, :payload!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO pending_inputs
 *   (content_key, request_id, row_target, address, address_type, ts,
 *    signature, input, retry_count, payload)
 * VALUES
 *   (:content_key!, :request_id!, :row_target!, :address!, :address_type!, :ts!,
 *    :signature!, :input!, :retry_count!, :payload!)
 * ```
 */
export const insertPendingInput = new PreparedQuery<IInsertPendingInputParams,IInsertPendingInputResult>(insertPendingInputIR);


/** 'GetAllPendingPayloads' parameters type */
export type IGetAllPendingPayloadsParams = void;

/** 'GetAllPendingPayloads' return type */
export interface IGetAllPendingPayloadsResult {
  payload: string;
}

/** 'GetAllPendingPayloads' query type */
export interface IGetAllPendingPayloadsQuery {
  params: IGetAllPendingPayloadsParams;
  result: IGetAllPendingPayloadsResult;
}

const getAllPendingPayloadsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT payload\nFROM pending_inputs\nORDER BY seq"};

/**
 * Query generated from SQL:
 * ```
 * SELECT payload
 * FROM pending_inputs
 * ORDER BY seq
 * ```
 */
export const getAllPendingPayloads = new PreparedQuery<IGetAllPendingPayloadsParams,IGetAllPendingPayloadsResult>(getAllPendingPayloadsIR);


/** 'GetPendingPayloadsByTarget' parameters type */
export interface IGetPendingPayloadsByTargetParams {
  default_target: string;
  target: string;
}

/** 'GetPendingPayloadsByTarget' return type */
export interface IGetPendingPayloadsByTargetResult {
  payload: string;
}

/** 'GetPendingPayloadsByTarget' query type */
export interface IGetPendingPayloadsByTargetQuery {
  params: IGetPendingPayloadsByTargetParams;
  result: IGetPendingPayloadsByTargetResult;
}

const getPendingPayloadsByTargetIR: any = {"usedParamSet":{"default_target":true,"target":true},"params":[{"name":"default_target","required":true,"transform":{"type":"scalar"},"locs":[{"a":102,"b":117}]},{"name":"target","required":true,"transform":{"type":"scalar"},"locs":[{"a":149,"b":156}]}],"statement":"SELECT payload\nFROM pending_inputs\nWHERE (\n  CASE\n    WHEN row_target IS NULL OR row_target = '' THEN :default_target!\n    ELSE row_target\n  END\n) = :target!\nORDER BY seq"};

/**
 * Query generated from SQL:
 * ```
 * SELECT payload
 * FROM pending_inputs
 * WHERE (
 *   CASE
 *     WHEN row_target IS NULL OR row_target = '' THEN :default_target!
 *     ELSE row_target
 *   END
 * ) = :target!
 * ORDER BY seq
 * ```
 */
export const getPendingPayloadsByTarget = new PreparedQuery<IGetPendingPayloadsByTargetParams,IGetPendingPayloadsByTargetResult>(getPendingPayloadsByTargetIR);


/** 'DeletePendingByRequestIds' parameters type */
export interface IDeletePendingByRequestIdsParams {
  request_ids: readonly (string)[];
}

/** 'DeletePendingByRequestIds' return type */
export interface IDeletePendingByRequestIdsResult {
  one: number | null;
}

/** 'DeletePendingByRequestIds' query type */
export interface IDeletePendingByRequestIdsQuery {
  params: IDeletePendingByRequestIdsParams;
  result: IDeletePendingByRequestIdsResult;
}

const deletePendingByRequestIdsIR: any = {"usedParamSet":{"request_ids":true},"params":[{"name":"request_ids","required":true,"transform":{"type":"array_spread"},"locs":[{"a":47,"b":59}]}],"statement":"DELETE FROM pending_inputs\nWHERE request_id IN :request_ids!\nRETURNING 1::int AS one"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM pending_inputs
 * WHERE request_id IN :request_ids!
 * RETURNING 1::int AS one
 * ```
 */
export const deletePendingByRequestIds = new PreparedQuery<IDeletePendingByRequestIdsParams,IDeletePendingByRequestIdsResult>(deletePendingByRequestIdsIR);


/** 'GetPendingInputCountAndSize' parameters type */
export type IGetPendingInputCountAndSizeParams = void;

/** 'GetPendingInputCountAndSize' return type */
export interface IGetPendingInputCountAndSizeResult {
  count: number | null;
  size: string | null;
}

/** 'GetPendingInputCountAndSize' query type */
export interface IGetPendingInputCountAndSizeQuery {
  params: IGetPendingInputCountAndSizeParams;
  result: IGetPendingInputCountAndSizeResult;
}

const getPendingInputCountAndSizeIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT count(*)::int AS count,\n       COALESCE(sum(length(payload)), 0)::bigint AS size\nFROM pending_inputs"};

/**
 * Query generated from SQL:
 * ```
 * SELECT count(*)::int AS count,
 *        COALESCE(sum(length(payload)), 0)::bigint AS size
 * FROM pending_inputs
 * ```
 */
export const getPendingInputCountAndSize = new PreparedQuery<IGetPendingInputCountAndSizeParams,IGetPendingInputCountAndSizeResult>(getPendingInputCountAndSizeIR);


/** 'GetPendingForRetry' parameters type */
export interface IGetPendingForRetryParams {
  request_ids: readonly (string)[];
}

/** 'GetPendingForRetry' return type */
export interface IGetPendingForRetryResult {
  payload: string;
  request_id: string;
  retry_count: number;
  seq: string;
}

/** 'GetPendingForRetry' query type */
export interface IGetPendingForRetryQuery {
  params: IGetPendingForRetryParams;
  result: IGetPendingForRetryResult;
}

const getPendingForRetryIR: any = {"usedParamSet":{"request_ids":true},"params":[{"name":"request_ids","required":true,"transform":{"type":"array_spread"},"locs":[{"a":85,"b":97}]}],"statement":"SELECT request_id, seq, retry_count, payload\nFROM pending_inputs\nWHERE request_id IN :request_ids!\nORDER BY seq\nFOR UPDATE"};

/**
 * Query generated from SQL:
 * ```
 * SELECT request_id, seq, retry_count, payload
 * FROM pending_inputs
 * WHERE request_id IN :request_ids!
 * ORDER BY seq
 * FOR UPDATE
 * ```
 */
export const getPendingForRetry = new PreparedQuery<IGetPendingForRetryParams,IGetPendingForRetryResult>(getPendingForRetryIR);


/** 'DeletePendingByIdentity' parameters type */
export interface IDeletePendingByIdentityParams {
  request_id: string;
  seq: NumberOrString;
}

/** 'DeletePendingByIdentity' return type */
export type IDeletePendingByIdentityResult = void;

/** 'DeletePendingByIdentity' query type */
export interface IDeletePendingByIdentityQuery {
  params: IDeletePendingByIdentityParams;
  result: IDeletePendingByIdentityResult;
}

const deletePendingByIdentityIR: any = {"usedParamSet":{"request_id":true,"seq":true},"params":[{"name":"request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":57}]},{"name":"seq","required":true,"transform":{"type":"scalar"},"locs":[{"a":71,"b":75}]}],"statement":"DELETE FROM pending_inputs\nWHERE request_id = :request_id!\n  AND seq = :seq!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM pending_inputs
 * WHERE request_id = :request_id!
 *   AND seq = :seq!
 * ```
 */
export const deletePendingByIdentity = new PreparedQuery<IDeletePendingByIdentityParams,IDeletePendingByIdentityResult>(deletePendingByIdentityIR);


/** 'UpdatePendingRetry' parameters type */
export interface IUpdatePendingRetryParams {
  payload: string;
  request_id: string;
  retry_count: number;
  seq: NumberOrString;
}

/** 'UpdatePendingRetry' return type */
export type IUpdatePendingRetryResult = void;

/** 'UpdatePendingRetry' query type */
export interface IUpdatePendingRetryQuery {
  params: IUpdatePendingRetryParams;
  result: IUpdatePendingRetryResult;
}

const updatePendingRetryIR: any = {"usedParamSet":{"retry_count":true,"payload":true,"request_id":true,"seq":true},"params":[{"name":"retry_count","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":52}]},{"name":"payload","required":true,"transform":{"type":"scalar"},"locs":[{"a":69,"b":77}]},{"name":"request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":109}]},{"name":"seq","required":true,"transform":{"type":"scalar"},"locs":[{"a":123,"b":127}]}],"statement":"UPDATE pending_inputs\nSET retry_count = :retry_count!,\n    payload = :payload!\nWHERE request_id = :request_id!\n  AND seq = :seq!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE pending_inputs
 * SET retry_count = :retry_count!,
 *     payload = :payload!
 * WHERE request_id = :request_id!
 *   AND seq = :seq!
 * ```
 */
export const updatePendingRetry = new PreparedQuery<IUpdatePendingRetryParams,IUpdatePendingRetryResult>(updatePendingRetryIR);


/** 'ClearPendingInputs' parameters type */
export type IClearPendingInputsParams = void;

/** 'ClearPendingInputs' return type */
export type IClearPendingInputsResult = void;

/** 'ClearPendingInputs' query type */
export interface IClearPendingInputsQuery {
  params: IClearPendingInputsParams;
  result: IClearPendingInputsResult;
}

const clearPendingInputsIR: any = {"usedParamSet":{},"params":[],"statement":"DELETE FROM pending_inputs"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM pending_inputs
 * ```
 */
export const clearPendingInputs = new PreparedQuery<IClearPendingInputsParams,IClearPendingInputsResult>(clearPendingInputsIR);


/** 'PruneTerminalByAge' parameters type */
export interface IPruneTerminalByAgeParams {
  ttl_ms: NumberOrString;
}

/** 'PruneTerminalByAge' return type */
export interface IPruneTerminalByAgeResult {
  request_id: string;
}

/** 'PruneTerminalByAge' query type */
export interface IPruneTerminalByAgeQuery {
  params: IPruneTerminalByAgeParams;
  result: IPruneTerminalByAgeResult;
}

const pruneTerminalByAgeIR: any = {"usedParamSet":{"ttl_ms":true},"params":[{"name":"ttl_ms","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":77}]}],"statement":"DELETE FROM request_status\nWHERE terminal\n  AND updated_at < now() - (:ttl_ms!::bigint * interval '1 millisecond')\nRETURNING request_id"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM request_status
 * WHERE terminal
 *   AND updated_at < now() - (:ttl_ms!::bigint * interval '1 millisecond')
 * RETURNING request_id
 * ```
 */
export const pruneTerminalByAge = new PreparedQuery<IPruneTerminalByAgeParams,IPruneTerminalByAgeResult>(pruneTerminalByAgeIR);


/** 'PruneTerminalByCount' parameters type */
export interface IPruneTerminalByCountParams {
  keep_count: NumberOrString;
}

/** 'PruneTerminalByCount' return type */
export interface IPruneTerminalByCountResult {
  request_id: string;
}

/** 'PruneTerminalByCount' query type */
export interface IPruneTerminalByCountQuery {
  params: IPruneTerminalByCountParams;
  result: IPruneTerminalByCountResult;
}

const pruneTerminalByCountIR: any = {"usedParamSet":{"keep_count":true},"params":[{"name":"keep_count","required":true,"transform":{"type":"scalar"},"locs":[{"a":235,"b":246}]}],"statement":"DELETE FROM request_status rs\nUSING (\n  SELECT request_id,\n         row_number() OVER (ORDER BY updated_at DESC, seq DESC) AS rn\n  FROM request_status\n  WHERE terminal\n) ranked\nWHERE rs.request_id = ranked.request_id\n  AND ranked.rn > :keep_count!\nRETURNING rs.request_id"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM request_status rs
 * USING (
 *   SELECT request_id,
 *          row_number() OVER (ORDER BY updated_at DESC, seq DESC) AS rn
 *   FROM request_status
 *   WHERE terminal
 * ) ranked
 * WHERE rs.request_id = ranked.request_id
 *   AND ranked.rn > :keep_count!
 * RETURNING rs.request_id
 * ```
 */
export const pruneTerminalByCount = new PreparedQuery<IPruneTerminalByCountParams,IPruneTerminalByCountResult>(pruneTerminalByCountIR);


/** 'DeleteReplayKeysByRequestIds' parameters type */
export interface IDeleteReplayKeysByRequestIdsParams {
  request_ids: readonly (string)[];
}

/** 'DeleteReplayKeysByRequestIds' return type */
export type IDeleteReplayKeysByRequestIdsResult = void;

/** 'DeleteReplayKeysByRequestIds' query type */
export interface IDeleteReplayKeysByRequestIdsQuery {
  params: IDeleteReplayKeysByRequestIdsParams;
  result: IDeleteReplayKeysByRequestIdsResult;
}

const deleteReplayKeysByRequestIdsIR: any = {"usedParamSet":{"request_ids":true},"params":[{"name":"request_ids","required":true,"transform":{"type":"array_spread"},"locs":[{"a":44,"b":56}]}],"statement":"DELETE FROM replay_keys\nWHERE request_id IN :request_ids!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM replay_keys
 * WHERE request_id IN :request_ids!
 * ```
 */
export const deleteReplayKeysByRequestIds = new PreparedQuery<IDeleteReplayKeysByRequestIdsParams,IDeleteReplayKeysByRequestIdsResult>(deleteReplayKeysByRequestIdsIR);


/** 'RecordAccepted' parameters type */
export interface IRecordAcceptedParams {
  address: string;
  address_type: number;
  content_key: string;
  input: string;
  payload: string;
  queue_request_id: string;
  replay_key?: string | null | void;
  request_id: string;
  retry_count: number;
  row_target: string;
  signature: string;
  ts: string;
}

/** 'RecordAccepted' return type */
export interface IRecordAcceptedResult {
  accepted_at: Date | null;
  address: string | null;
  block_number: string | null;
  error_code: string | null;
  message: string | null;
  outcome_created: boolean | null;
  outcome_duplicate: boolean | null;
  replay_key: string | null;
  request_id: string | null;
  retry_count: number | null;
  row_target: string | null;
  state: string | null;
  terminal: boolean | null;
  transaction_hash: string | null;
  updated_at: Date | null;
}

/** 'RecordAccepted' query type */
export interface IRecordAcceptedQuery {
  params: IRecordAcceptedParams;
  result: IRecordAcceptedResult;
}

const recordAcceptedIR: any = {"usedParamSet":{"replay_key":true,"request_id":true,"row_target":true,"address":true,"address_type":true,"ts":true,"signature":true,"input":true,"retry_count":true,"payload":true,"content_key":true,"queue_request_id":true},"params":[{"name":"replay_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":41,"b":51}]},{"name":"request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":67}]},{"name":"row_target","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":83}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":88,"b":96}]},{"name":"address_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":101,"b":114}]},{"name":"ts","required":true,"transform":{"type":"scalar"},"locs":[{"a":119,"b":122}]},{"name":"signature","required":true,"transform":{"type":"scalar"},"locs":[{"a":127,"b":137}]},{"name":"input","required":true,"transform":{"type":"scalar"},"locs":[{"a":142,"b":148}]},{"name":"retry_count","required":true,"transform":{"type":"scalar"},"locs":[{"a":153,"b":165}]},{"name":"payload","required":true,"transform":{"type":"scalar"},"locs":[{"a":170,"b":178}]},{"name":"content_key","required":true,"transform":{"type":"scalar"},"locs":[{"a":183,"b":195}]},{"name":"queue_request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":200,"b":217}]}],"statement":"SELECT *\nFROM batcher_record_accepted(\n  :replay_key,\n  :request_id!,\n  :row_target!,\n  :address!,\n  :address_type!,\n  :ts!,\n  :signature!,\n  :input!,\n  :retry_count!,\n  :payload!,\n  :content_key!,\n  :queue_request_id!\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM batcher_record_accepted(
 *   :replay_key,
 *   :request_id!,
 *   :row_target!,
 *   :address!,
 *   :address_type!,
 *   :ts!,
 *   :signature!,
 *   :input!,
 *   :retry_count!,
 *   :payload!,
 *   :content_key!,
 *   :queue_request_id!
 * )
 * ```
 */
export const recordAccepted = new PreparedQuery<IRecordAcceptedParams,IRecordAcceptedResult>(recordAcceptedIR);


/** 'GetStatusForUpdate' parameters type */
export interface IGetStatusForUpdateParams {
  request_id: string;
}

/** 'GetStatusForUpdate' return type */
export interface IGetStatusForUpdateResult {
  accepted_at: Date;
  address: string | null;
  block_number: string | null;
  error_code: string | null;
  message: string | null;
  replay_key: string | null;
  request_id: string;
  retry_count: number;
  row_target: string;
  seq: string;
  state: string;
  terminal: boolean;
  transaction_hash: string | null;
  updated_at: Date;
}

/** 'GetStatusForUpdate' query type */
export interface IGetStatusForUpdateQuery {
  params: IGetStatusForUpdateParams;
  result: IGetStatusForUpdateResult;
}

const getStatusForUpdateIR: any = {"usedParamSet":{"request_id":true},"params":[{"name":"request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":59}]}],"statement":"SELECT *\nFROM request_status\nWHERE request_id = :request_id!\nFOR UPDATE"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM request_status
 * WHERE request_id = :request_id!
 * FOR UPDATE
 * ```
 */
export const getStatusForUpdate = new PreparedQuery<IGetStatusForUpdateParams,IGetStatusForUpdateResult>(getStatusForUpdateIR);


/** 'UpdateRequestStatus' parameters type */
export interface IUpdateRequestStatusParams {
  block_number?: NumberOrString | null | void;
  error_code?: string | null | void;
  message?: string | null | void;
  request_id: string;
  retry_count?: number | null | void;
  state: string;
  terminal: boolean;
  transaction_hash?: string | null | void;
}

/** 'UpdateRequestStatus' return type */
export interface IUpdateRequestStatusResult {
  accepted_at: Date;
  address: string | null;
  block_number: string | null;
  error_code: string | null;
  message: string | null;
  replay_key: string | null;
  request_id: string;
  retry_count: number;
  row_target: string;
  seq: string;
  state: string;
  terminal: boolean;
  transaction_hash: string | null;
  updated_at: Date;
}

/** 'UpdateRequestStatus' query type */
export interface IUpdateRequestStatusQuery {
  params: IUpdateRequestStatusParams;
  result: IUpdateRequestStatusResult;
}

const updateRequestStatusIR: any = {"usedParamSet":{"state":true,"terminal":true,"transaction_hash":true,"block_number":true,"error_code":true,"message":true,"retry_count":true,"request_id":true},"params":[{"name":"state","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":40}]},{"name":"terminal","required":true,"transform":{"type":"scalar"},"locs":[{"a":58,"b":67}]},{"name":"transaction_hash","required":false,"transform":{"type":"scalar"},"locs":[{"a":102,"b":118}]},{"name":"block_number","required":false,"transform":{"type":"scalar"},"locs":[{"a":168,"b":180}]},{"name":"error_code","required":false,"transform":{"type":"scalar"},"locs":[{"a":232,"b":242}]},{"name":"message","required":false,"transform":{"type":"scalar"},"locs":[{"a":281,"b":288}]},{"name":"retry_count","required":false,"transform":{"type":"scalar"},"locs":[{"a":328,"b":339}]},{"name":"request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":403,"b":414}]}],"statement":"UPDATE request_status\nSET state = :state!,\n    terminal = :terminal!,\n    transaction_hash = COALESCE(:transaction_hash, transaction_hash),\n    block_number = COALESCE(:block_number::bigint, block_number),\n    error_code = COALESCE(:error_code, error_code),\n    message = COALESCE(:message, message),\n    retry_count = COALESCE(:retry_count::int, retry_count),\n    updated_at = now()\nWHERE request_id = :request_id!\nRETURNING *"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE request_status
 * SET state = :state!,
 *     terminal = :terminal!,
 *     transaction_hash = COALESCE(:transaction_hash, transaction_hash),
 *     block_number = COALESCE(:block_number::bigint, block_number),
 *     error_code = COALESCE(:error_code, error_code),
 *     message = COALESCE(:message, message),
 *     retry_count = COALESCE(:retry_count::int, retry_count),
 *     updated_at = now()
 * WHERE request_id = :request_id!
 * RETURNING *
 * ```
 */
export const updateRequestStatus = new PreparedQuery<IUpdateRequestStatusParams,IUpdateRequestStatusResult>(updateRequestStatusIR);


/** 'RecordTransitions' parameters type */
export interface IRecordTransitionsParams {
  transitions: Json;
}

/** 'RecordTransitions' return type */
export interface IRecordTransitionsResult {
  accepted_at: Date | null;
  address: string | null;
  applied: boolean | null;
  block_number: string | null;
  error_code: string | null;
  message: string | null;
  ord: number | null;
  refused: string | null;
  replay_key: string | null;
  request_id: string | null;
  retry_count: number | null;
  row_target: string | null;
  state: string | null;
  terminal: boolean | null;
  transaction_hash: string | null;
  updated_at: Date | null;
}

/** 'RecordTransitions' query type */
export interface IRecordTransitionsQuery {
  params: IRecordTransitionsParams;
  result: IRecordTransitionsResult;
}

const recordTransitionsIR: any = {"usedParamSet":{"transitions":true},"params":[{"name":"transitions","required":true,"transform":{"type":"scalar"},"locs":[{"a":482,"b":494}]}],"statement":"WITH input AS MATERIALIZED (\n  SELECT\n    ordinality::int AS ord,\n    item->>'requestId' AS requested_id,\n    item->>'state' AS next_state,\n    item->'detail'->>'transactionHash' AS next_transaction_hash,\n    NULLIF(item->'detail'->>'blockNumber', '')::bigint AS next_block_number,\n    item->'detail'->>'errorCode' AS next_error_code,\n    item->'detail'->>'message' AS next_message,\n    NULLIF(item->'detail'->>'retryCount', '')::int AS next_retry_count\n  FROM jsonb_array_elements(:transitions!::jsonb)\n       WITH ORDINALITY AS source(item, ordinality)\n), locked AS MATERIALIZED (\n  SELECT\n    i.*,\n    s.request_id, s.row_target, s.address, s.state, s.terminal,\n    s.transaction_hash, s.block_number, s.error_code, s.message,\n    s.retry_count, s.replay_key, s.accepted_at, s.updated_at\n  FROM input i\n  JOIN request_status s ON s.request_id = i.requested_id\n  ORDER BY s.request_id\n  FOR UPDATE OF s\n), evaluated AS MATERIALIZED (\n  SELECT l.*,\n    CASE\n      WHEN l.terminal THEN 'already-terminal'\n      WHEN\n        CASE l.next_state\n          WHEN 'queued' THEN 0\n          WHEN 'batching' THEN 1\n          WHEN 'submitted' THEN 2\n          ELSE 3\n        END <\n        CASE l.state\n          WHEN 'queued' THEN 0\n          WHEN 'batching' THEN 1\n          WHEN 'submitted' THEN 2\n          ELSE 3\n        END THEN 'regression'\n      ELSE NULL\n    END AS refusal\n  FROM locked l\n), updated AS (\n  UPDATE request_status s\n  SET state = e.next_state,\n      terminal = e.next_state IN ('confirmed', 'failed'),\n      transaction_hash = COALESCE(e.next_transaction_hash, s.transaction_hash),\n      block_number = COALESCE(e.next_block_number, s.block_number),\n      error_code = COALESCE(e.next_error_code, s.error_code),\n      message = COALESCE(e.next_message, s.message),\n      retry_count = COALESCE(e.next_retry_count, s.retry_count),\n      updated_at = now()\n  FROM evaluated e\n  WHERE s.request_id = e.requested_id\n    AND e.refusal IS NULL\n  RETURNING e.ord, true AS applied, NULL::text AS refused,\n    s.request_id, s.row_target, s.address, s.state, s.terminal,\n    s.transaction_hash, s.block_number, s.error_code, s.message,\n    s.retry_count, s.replay_key, s.accepted_at, s.updated_at\n), refused AS (\n  SELECT e.ord, false AS applied, e.refusal AS refused,\n    e.request_id, e.row_target, e.address, e.state, e.terminal,\n    e.transaction_hash, e.block_number, e.error_code, e.message,\n    e.retry_count, e.replay_key, e.accepted_at, e.updated_at\n  FROM evaluated e\n  WHERE e.refusal IS NOT NULL\n), unknown AS (\n  SELECT i.ord, false AS applied, 'unknown-request'::text AS refused,\n    NULL::text AS request_id, NULL::text AS row_target,\n    NULL::text AS address, NULL::text AS state, NULL::boolean AS terminal,\n    NULL::text AS transaction_hash, NULL::bigint AS block_number,\n    NULL::text AS error_code, NULL::text AS message,\n    NULL::integer AS retry_count, NULL::text AS replay_key,\n    NULL::timestamptz AS accepted_at, NULL::timestamptz AS updated_at\n  FROM input i\n  LEFT JOIN locked l ON l.ord = i.ord\n  WHERE l.ord IS NULL\n)\nSELECT * FROM updated\nUNION ALL\nSELECT * FROM refused\nUNION ALL\nSELECT * FROM unknown\nORDER BY ord"};

/**
 * Query generated from SQL:
 * ```
 * WITH input AS MATERIALIZED (
 *   SELECT
 *     ordinality::int AS ord,
 *     item->>'requestId' AS requested_id,
 *     item->>'state' AS next_state,
 *     item->'detail'->>'transactionHash' AS next_transaction_hash,
 *     NULLIF(item->'detail'->>'blockNumber', '')::bigint AS next_block_number,
 *     item->'detail'->>'errorCode' AS next_error_code,
 *     item->'detail'->>'message' AS next_message,
 *     NULLIF(item->'detail'->>'retryCount', '')::int AS next_retry_count
 *   FROM jsonb_array_elements(:transitions!::jsonb)
 *        WITH ORDINALITY AS source(item, ordinality)
 * ), locked AS MATERIALIZED (
 *   SELECT
 *     i.*,
 *     s.request_id, s.row_target, s.address, s.state, s.terminal,
 *     s.transaction_hash, s.block_number, s.error_code, s.message,
 *     s.retry_count, s.replay_key, s.accepted_at, s.updated_at
 *   FROM input i
 *   JOIN request_status s ON s.request_id = i.requested_id
 *   ORDER BY s.request_id
 *   FOR UPDATE OF s
 * ), evaluated AS MATERIALIZED (
 *   SELECT l.*,
 *     CASE
 *       WHEN l.terminal THEN 'already-terminal'
 *       WHEN
 *         CASE l.next_state
 *           WHEN 'queued' THEN 0
 *           WHEN 'batching' THEN 1
 *           WHEN 'submitted' THEN 2
 *           ELSE 3
 *         END <
 *         CASE l.state
 *           WHEN 'queued' THEN 0
 *           WHEN 'batching' THEN 1
 *           WHEN 'submitted' THEN 2
 *           ELSE 3
 *         END THEN 'regression'
 *       ELSE NULL
 *     END AS refusal
 *   FROM locked l
 * ), updated AS (
 *   UPDATE request_status s
 *   SET state = e.next_state,
 *       terminal = e.next_state IN ('confirmed', 'failed'),
 *       transaction_hash = COALESCE(e.next_transaction_hash, s.transaction_hash),
 *       block_number = COALESCE(e.next_block_number, s.block_number),
 *       error_code = COALESCE(e.next_error_code, s.error_code),
 *       message = COALESCE(e.next_message, s.message),
 *       retry_count = COALESCE(e.next_retry_count, s.retry_count),
 *       updated_at = now()
 *   FROM evaluated e
 *   WHERE s.request_id = e.requested_id
 *     AND e.refusal IS NULL
 *   RETURNING e.ord, true AS applied, NULL::text AS refused,
 *     s.request_id, s.row_target, s.address, s.state, s.terminal,
 *     s.transaction_hash, s.block_number, s.error_code, s.message,
 *     s.retry_count, s.replay_key, s.accepted_at, s.updated_at
 * ), refused AS (
 *   SELECT e.ord, false AS applied, e.refusal AS refused,
 *     e.request_id, e.row_target, e.address, e.state, e.terminal,
 *     e.transaction_hash, e.block_number, e.error_code, e.message,
 *     e.retry_count, e.replay_key, e.accepted_at, e.updated_at
 *   FROM evaluated e
 *   WHERE e.refusal IS NOT NULL
 * ), unknown AS (
 *   SELECT i.ord, false AS applied, 'unknown-request'::text AS refused,
 *     NULL::text AS request_id, NULL::text AS row_target,
 *     NULL::text AS address, NULL::text AS state, NULL::boolean AS terminal,
 *     NULL::text AS transaction_hash, NULL::bigint AS block_number,
 *     NULL::text AS error_code, NULL::text AS message,
 *     NULL::integer AS retry_count, NULL::text AS replay_key,
 *     NULL::timestamptz AS accepted_at, NULL::timestamptz AS updated_at
 *   FROM input i
 *   LEFT JOIN locked l ON l.ord = i.ord
 *   WHERE l.ord IS NULL
 * )
 * SELECT * FROM updated
 * UNION ALL
 * SELECT * FROM refused
 * UNION ALL
 * SELECT * FROM unknown
 * ORDER BY ord
 * ```
 */
export const recordTransitions = new PreparedQuery<IRecordTransitionsParams,IRecordTransitionsResult>(recordTransitionsIR);


/** 'GetStatus' parameters type */
export interface IGetStatusParams {
  request_id: string;
}

/** 'GetStatus' return type */
export interface IGetStatusResult {
  accepted_at: Date;
  address: string | null;
  block_number: string | null;
  error_code: string | null;
  message: string | null;
  replay_key: string | null;
  request_id: string;
  retry_count: number;
  row_target: string;
  seq: string;
  state: string;
  terminal: boolean;
  transaction_hash: string | null;
  updated_at: Date;
}

/** 'GetStatus' query type */
export interface IGetStatusQuery {
  params: IGetStatusParams;
  result: IGetStatusResult;
}

const getStatusIR: any = {"usedParamSet":{"request_id":true},"params":[{"name":"request_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":59}]}],"statement":"SELECT *\nFROM request_status\nWHERE request_id = :request_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT *
 * FROM request_status
 * WHERE request_id = :request_id!
 * ```
 */
export const getStatus = new PreparedQuery<IGetStatusParams,IGetStatusResult>(getStatusIR);


/** 'GetStatusByReplayKey' parameters type */
export interface IGetStatusByReplayKeyParams {
  replay_key: string;
}

/** 'GetStatusByReplayKey' return type */
export interface IGetStatusByReplayKeyResult {
  accepted_at: Date;
  address: string | null;
  block_number: string | null;
  error_code: string | null;
  message: string | null;
  replay_key: string | null;
  request_id: string;
  retry_count: number;
  row_target: string;
  seq: string;
  state: string;
  terminal: boolean;
  transaction_hash: string | null;
  updated_at: Date;
}

/** 'GetStatusByReplayKey' query type */
export interface IGetStatusByReplayKeyQuery {
  params: IGetStatusByReplayKeyParams;
  result: IGetStatusByReplayKeyResult;
}

const getStatusByReplayKeyIR: any = {"usedParamSet":{"replay_key":true},"params":[{"name":"replay_key","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":65}]}],"statement":"SELECT s.*\nFROM request_status s\nWHERE s.replay_key = :replay_key!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT s.*
 * FROM request_status s
 * WHERE s.replay_key = :replay_key!
 * ```
 */
export const getStatusByReplayKey = new PreparedQuery<IGetStatusByReplayKeyParams,IGetStatusByReplayKeyResult>(getStatusByReplayKeyIR);


