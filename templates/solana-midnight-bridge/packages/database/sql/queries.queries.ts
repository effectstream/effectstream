/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

export type NumberOrString = number | string;

/** 'UpsertLockObserved' parameters type */
export interface IUpsertLockObservedParams {
  amount: NumberOrString;
  block_height: number;
  recipient: string;
  sender: string;
  source_id: NumberOrString;
  src_ref: string;
}

/** 'UpsertLockObserved' return type */
export type IUpsertLockObservedResult = void;

/** 'UpsertLockObserved' query type */
export interface IUpsertLockObservedQuery {
  params: IUpsertLockObservedParams;
  result: IUpsertLockObservedResult;
}

const upsertLockObservedIR: any = {"usedParamSet":{"source_id":true,"amount":true,"recipient":true,"sender":true,"src_ref":true,"block_height":true},"params":[{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":127,"b":137}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":147}]},{"name":"recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":150,"b":160}]},{"name":"sender","required":true,"transform":{"type":"scalar"},"locs":[{"a":163,"b":170}]},{"name":"src_ref","required":true,"transform":{"type":"scalar"},"locs":[{"a":185,"b":193}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":196,"b":209}]}],"statement":"INSERT INTO bridge_transfers (direction, source_id, amount, recipient, sender, status, src_ref, observed_block)\nVALUES ('s2m', :source_id!, :amount!, :recipient!, :sender!, 'observed', :src_ref!, :block_height!)\nON CONFLICT (direction, source_id) DO UPDATE\n  SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),\n      sender = COALESCE(bridge_transfers.sender, EXCLUDED.sender),\n      src_ref = COALESCE(bridge_transfers.src_ref, EXCLUDED.src_ref)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO bridge_transfers (direction, source_id, amount, recipient, sender, status, src_ref, observed_block)
 * VALUES ('s2m', :source_id!, :amount!, :recipient!, :sender!, 'observed', :src_ref!, :block_height!)
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),
 *       sender = COALESCE(bridge_transfers.sender, EXCLUDED.sender),
 *       src_ref = COALESCE(bridge_transfers.src_ref, EXCLUDED.src_ref)
 * ```
 */
export const upsertLockObserved = new PreparedQuery<IUpsertLockObservedParams,IUpsertLockObservedResult>(upsertLockObservedIR);


/** 'UpsertMintCompleted' parameters type */
export interface IUpsertMintCompletedParams {
  amount: NumberOrString;
  block_height: number;
  dst_ref: string;
  source_id: NumberOrString;
}

/** 'UpsertMintCompleted' return type */
export type IUpsertMintCompletedResult = void;

/** 'UpsertMintCompleted' query type */
export interface IUpsertMintCompletedQuery {
  params: IUpsertMintCompletedParams;
  result: IUpsertMintCompletedResult;
}

const upsertMintCompletedIR: any = {"usedParamSet":{"source_id":true,"amount":true,"dst_ref":true,"block_height":true},"params":[{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":139,"b":149}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":152,"b":159}]},{"name":"dst_ref","required":true,"transform":{"type":"scalar"},"locs":[{"a":175,"b":183}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":186,"b":199},{"a":202,"b":215}]}],"statement":"INSERT INTO bridge_transfers (direction, source_id, amount, status, dst_ref, observed_block, completed_block, completed_at)\nVALUES ('s2m', :source_id!, :amount!, 'completed', :dst_ref!, :block_height!, :block_height!, NOW())\nON CONFLICT (direction, source_id) DO UPDATE\n  SET status = 'completed',\n      dst_ref = EXCLUDED.dst_ref,\n      completed_block = EXCLUDED.completed_block,\n      completed_at = NOW()\n  WHERE bridge_transfers.status <> 'completed'"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO bridge_transfers (direction, source_id, amount, status, dst_ref, observed_block, completed_block, completed_at)
 * VALUES ('s2m', :source_id!, :amount!, 'completed', :dst_ref!, :block_height!, :block_height!, NOW())
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET status = 'completed',
 *       dst_ref = EXCLUDED.dst_ref,
 *       completed_block = EXCLUDED.completed_block,
 *       completed_at = NOW()
 *   WHERE bridge_transfers.status <> 'completed'
 * ```
 */
export const upsertMintCompleted = new PreparedQuery<IUpsertMintCompletedParams,IUpsertMintCompletedResult>(upsertMintCompletedIR);


/** 'UpsertWithdrawalObserved' parameters type */
export interface IUpsertWithdrawalObservedParams {
  amount: NumberOrString;
  block_height: number;
  recipient: string;
  source_id: NumberOrString;
  src_ref: string;
}

/** 'UpsertWithdrawalObserved' return type */
export type IUpsertWithdrawalObservedResult = void;

/** 'UpsertWithdrawalObserved' query type */
export interface IUpsertWithdrawalObservedQuery {
  params: IUpsertWithdrawalObservedParams;
  result: IUpsertWithdrawalObservedResult;
}

const upsertWithdrawalObservedIR: any = {"usedParamSet":{"source_id":true,"amount":true,"recipient":true,"src_ref":true,"block_height":true},"params":[{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":119,"b":129}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":132,"b":139}]},{"name":"recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":142,"b":152}]},{"name":"src_ref","required":true,"transform":{"type":"scalar"},"locs":[{"a":167,"b":175}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":178,"b":191}]}],"statement":"INSERT INTO bridge_transfers (direction, source_id, amount, recipient, status, src_ref, observed_block)\nVALUES ('m2s', :source_id!, :amount!, :recipient!, 'observed', :src_ref!, :block_height!)\nON CONFLICT (direction, source_id) DO UPDATE\n  SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),\n      src_ref = COALESCE(bridge_transfers.src_ref, EXCLUDED.src_ref)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO bridge_transfers (direction, source_id, amount, recipient, status, src_ref, observed_block)
 * VALUES ('m2s', :source_id!, :amount!, :recipient!, 'observed', :src_ref!, :block_height!)
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),
 *       src_ref = COALESCE(bridge_transfers.src_ref, EXCLUDED.src_ref)
 * ```
 */
export const upsertWithdrawalObserved = new PreparedQuery<IUpsertWithdrawalObservedParams,IUpsertWithdrawalObservedResult>(upsertWithdrawalObservedIR);


/** 'UpsertReleaseCompleted' parameters type */
export interface IUpsertReleaseCompletedParams {
  amount: NumberOrString;
  block_height: number;
  dst_ref: string;
  recipient: string;
  source_id: NumberOrString;
}

/** 'UpsertReleaseCompleted' return type */
export type IUpsertReleaseCompletedResult = void;

/** 'UpsertReleaseCompleted' query type */
export interface IUpsertReleaseCompletedQuery {
  params: IUpsertReleaseCompletedParams;
  result: IUpsertReleaseCompletedResult;
}

const upsertReleaseCompletedIR: any = {"usedParamSet":{"source_id":true,"amount":true,"recipient":true,"dst_ref":true,"block_height":true},"params":[{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":150,"b":160}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":163,"b":170}]},{"name":"recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":173,"b":183}]},{"name":"dst_ref","required":true,"transform":{"type":"scalar"},"locs":[{"a":199,"b":207}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":210,"b":223},{"a":226,"b":239}]}],"statement":"INSERT INTO bridge_transfers (direction, source_id, amount, recipient, status, dst_ref, observed_block, completed_block, completed_at)\nVALUES ('m2s', :source_id!, :amount!, :recipient!, 'completed', :dst_ref!, :block_height!, :block_height!, NOW())\nON CONFLICT (direction, source_id) DO UPDATE\n  SET status = 'completed',\n      dst_ref = EXCLUDED.dst_ref,\n      recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),\n      completed_block = EXCLUDED.completed_block,\n      completed_at = NOW()\n  WHERE bridge_transfers.status <> 'completed'"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO bridge_transfers (direction, source_id, amount, recipient, status, dst_ref, observed_block, completed_block, completed_at)
 * VALUES ('m2s', :source_id!, :amount!, :recipient!, 'completed', :dst_ref!, :block_height!, :block_height!, NOW())
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET status = 'completed',
 *       dst_ref = EXCLUDED.dst_ref,
 *       recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),
 *       completed_block = EXCLUDED.completed_block,
 *       completed_at = NOW()
 *   WHERE bridge_transfers.status <> 'completed'
 * ```
 */
export const upsertReleaseCompleted = new PreparedQuery<IUpsertReleaseCompletedParams,IUpsertReleaseCompletedResult>(upsertReleaseCompletedIR);


/** 'GetTransfer' parameters type */
export interface IGetTransferParams {
  direction: string;
  source_id: NumberOrString;
}

/** 'GetTransfer' return type */
export interface IGetTransferResult {
  amount: string;
  attempts: number;
  completed_at: Date | null;
  completed_block: number | null;
  direction: string;
  dst_ref: string | null;
  last_attempt_at: Date | null;
  last_error: string | null;
  last_tx: string | null;
  observed_at: Date;
  observed_block: number;
  recipient: string | null;
  sender: string | null;
  source_id: string;
  src_ref: string | null;
  state: string | null;
  status: string;
  submitted_at: Date | null;
}

/** 'GetTransfer' query type */
export interface IGetTransferQuery {
  params: IGetTransferParams;
  result: IGetTransferResult;
}

const getTransferIR: any = {"usedParamSet":{"direction":true,"source_id":true},"params":[{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":539,"b":549}]},{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":569,"b":579}]}],"statement":"SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,\n       t.observed_block, t.completed_block, t.observed_at, t.completed_at,\n       CASE WHEN t.status = 'completed' THEN 'completed'\n            WHEN j.submitted_at IS NOT NULL THEN 'submitted'\n            ELSE 'observed' END AS state,\n       j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx\nFROM bridge_transfers t\nLEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id\nWHERE t.direction = :direction! AND t.source_id = :source_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,
 *        t.observed_block, t.completed_block, t.observed_at, t.completed_at,
 *        CASE WHEN t.status = 'completed' THEN 'completed'
 *             WHEN j.submitted_at IS NOT NULL THEN 'submitted'
 *             ELSE 'observed' END AS state,
 *        j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx
 * FROM bridge_transfers t
 * LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
 * WHERE t.direction = :direction! AND t.source_id = :source_id!
 * ```
 */
export const getTransfer = new PreparedQuery<IGetTransferParams,IGetTransferResult>(getTransferIR);


/** 'ListTransfers' parameters type */
export interface IListTransfersParams {
  direction?: string | null | void;
  limit: NumberOrString;
  state?: string | null | void;
}

/** 'ListTransfers' return type */
export interface IListTransfersResult {
  amount: string;
  attempts: number;
  completed_at: Date | null;
  completed_block: number | null;
  direction: string;
  dst_ref: string | null;
  last_attempt_at: Date | null;
  last_error: string | null;
  last_tx: string | null;
  observed_at: Date;
  observed_block: number;
  recipient: string | null;
  sender: string | null;
  source_id: string;
  src_ref: string | null;
  state: string | null;
  status: string;
  submitted_at: Date | null;
}

/** 'ListTransfers' query type */
export interface IListTransfersQuery {
  params: IListTransfersParams;
  result: IListTransfersResult;
}

const listTransfersIR: any = {"usedParamSet":{"direction":true,"state":true,"limit":true},"params":[{"name":"direction","required":false,"transform":{"type":"scalar"},"locs":[{"a":567,"b":576},{"a":612,"b":621}]},{"name":"state","required":false,"transform":{"type":"scalar"},"locs":[{"a":636,"b":641},{"a":673,"b":678}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":749,"b":755}]}],"statement":"SELECT * FROM (\n  SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,\n         t.observed_block, t.completed_block, t.observed_at, t.completed_at,\n         CASE WHEN t.status = 'completed' THEN 'completed'\n              WHEN j.submitted_at IS NOT NULL THEN 'submitted'\n              ELSE 'observed' END AS state,\n         j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx\n  FROM bridge_transfers t\n  LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id\n) v\nWHERE (CAST(:direction AS TEXT) IS NULL OR v.direction = :direction)\n  AND (CAST(:state AS TEXT) IS NULL OR v.state = :state)\nORDER BY v.observed_block DESC, v.direction, v.source_id DESC\nLIMIT :limit!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM (
 *   SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,
 *          t.observed_block, t.completed_block, t.observed_at, t.completed_at,
 *          CASE WHEN t.status = 'completed' THEN 'completed'
 *               WHEN j.submitted_at IS NOT NULL THEN 'submitted'
 *               ELSE 'observed' END AS state,
 *          j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx
 *   FROM bridge_transfers t
 *   LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
 * ) v
 * WHERE (CAST(:direction AS TEXT) IS NULL OR v.direction = :direction)
 *   AND (CAST(:state AS TEXT) IS NULL OR v.state = :state)
 * ORDER BY v.observed_block DESC, v.direction, v.source_id DESC
 * LIMIT :limit!
 * ```
 */
export const listTransfers = new PreparedQuery<IListTransfersParams,IListTransfersResult>(listTransfersIR);


/** 'ListRelayerCandidates' parameters type */
export interface IListRelayerCandidatesParams {
  limit: NumberOrString;
}

/** 'ListRelayerCandidates' return type */
export interface IListRelayerCandidatesResult {
  amount: string;
  attempts: number;
  direction: string;
  last_attempt_at: Date | null;
  last_error: string | null;
  last_tx: string | null;
  recipient: string | null;
  source_id: string;
}

/** 'ListRelayerCandidates' query type */
export interface IListRelayerCandidatesQuery {
  params: IListRelayerCandidatesParams;
  result: IListRelayerCandidatesResult;
}

const listRelayerCandidatesIR: any = {"usedParamSet":{"limit":true},"params":[{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":322,"b":328}]}],"statement":"SELECT t.direction, t.source_id, t.amount, t.recipient,\n       j.attempts, j.last_attempt_at, j.last_tx, j.last_error\nFROM bridge_transfers t\nLEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id\nWHERE t.status = 'observed' AND t.recipient IS NOT NULL\nORDER BY t.direction, t.source_id\nLIMIT :limit!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT t.direction, t.source_id, t.amount, t.recipient,
 *        j.attempts, j.last_attempt_at, j.last_tx, j.last_error
 * FROM bridge_transfers t
 * LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
 * WHERE t.status = 'observed' AND t.recipient IS NOT NULL
 * ORDER BY t.direction, t.source_id
 * LIMIT :limit!
 * ```
 */
export const listRelayerCandidates = new PreparedQuery<IListRelayerCandidatesParams,IListRelayerCandidatesResult>(listRelayerCandidatesIR);


/** 'RecordRelayerAttempt' parameters type */
export interface IRecordRelayerAttemptParams {
  direction: string;
  now: DateOrString;
  source_id: NumberOrString;
}

/** 'RecordRelayerAttempt' return type */
export type IRecordRelayerAttemptResult = void;

/** 'RecordRelayerAttempt' query type */
export interface IRecordRelayerAttemptQuery {
  params: IRecordRelayerAttemptParams;
  result: IRecordRelayerAttemptResult;
}

const recordRelayerAttemptIR: any = {"usedParamSet":{"direction":true,"source_id":true,"now":true},"params":[{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":97,"b":107}]},{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":110,"b":120}]},{"name":"now","required":true,"transform":{"type":"scalar"},"locs":[{"a":123,"b":127},{"a":133,"b":137}]}],"statement":"INSERT INTO relayer_jobs (direction, source_id, submitted_at, attempts, last_attempt_at)\nVALUES (:direction!, :source_id!, :now!, 1, :now!)\nON CONFLICT (direction, source_id) DO UPDATE\n  SET attempts = relayer_jobs.attempts + 1,\n      submitted_at = COALESCE(relayer_jobs.submitted_at, EXCLUDED.submitted_at),\n      last_attempt_at = EXCLUDED.last_attempt_at"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO relayer_jobs (direction, source_id, submitted_at, attempts, last_attempt_at)
 * VALUES (:direction!, :source_id!, :now!, 1, :now!)
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET attempts = relayer_jobs.attempts + 1,
 *       submitted_at = COALESCE(relayer_jobs.submitted_at, EXCLUDED.submitted_at),
 *       last_attempt_at = EXCLUDED.last_attempt_at
 * ```
 */
export const recordRelayerAttempt = new PreparedQuery<IRecordRelayerAttemptParams,IRecordRelayerAttemptResult>(recordRelayerAttemptIR);


/** 'RecordRelayerResult' parameters type */
export interface IRecordRelayerResultParams {
  direction: string;
  last_error?: string | null | void;
  last_tx?: string | null | void;
  source_id: NumberOrString;
}

/** 'RecordRelayerResult' return type */
export type IRecordRelayerResultResult = void;

/** 'RecordRelayerResult' query type */
export interface IRecordRelayerResultQuery {
  params: IRecordRelayerResultParams;
  result: IRecordRelayerResultResult;
}

const recordRelayerResultIR: any = {"usedParamSet":{"last_tx":true,"last_error":true,"direction":true,"source_id":true},"params":[{"name":"last_tx","required":false,"transform":{"type":"scalar"},"locs":[{"a":43,"b":50}]},{"name":"last_error","required":false,"transform":{"type":"scalar"},"locs":[{"a":80,"b":90}]},{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":110,"b":120}]},{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":138,"b":148}]}],"statement":"UPDATE relayer_jobs\nSET last_tx = COALESCE(:last_tx, last_tx),\n    last_error = :last_error\nWHERE direction = :direction! AND source_id = :source_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE relayer_jobs
 * SET last_tx = COALESCE(:last_tx, last_tx),
 *     last_error = :last_error
 * WHERE direction = :direction! AND source_id = :source_id!
 * ```
 */
export const recordRelayerResult = new PreparedQuery<IRecordRelayerResultParams,IRecordRelayerResultResult>(recordRelayerResultIR);


