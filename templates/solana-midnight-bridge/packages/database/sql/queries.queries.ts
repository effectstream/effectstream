/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type NumberOrString = number | string;

/** 'UpsertLockObserved' parameters type */
export interface IUpsertLockObservedParams {
  amount: NumberOrString;
  block_height: number;
  recipient: string;
  recipient_kind: string;
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

const upsertLockObservedIR: any = {"usedParamSet":{"source_id":true,"amount":true,"recipient":true,"recipient_kind":true,"sender":true,"src_ref":true,"block_height":true},"params":[{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":143,"b":153}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":156,"b":163}]},{"name":"recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":166,"b":176}]},{"name":"recipient_kind","required":true,"transform":{"type":"scalar"},"locs":[{"a":179,"b":194}]},{"name":"sender","required":true,"transform":{"type":"scalar"},"locs":[{"a":197,"b":204}]},{"name":"src_ref","required":true,"transform":{"type":"scalar"},"locs":[{"a":219,"b":227}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":230,"b":243}]}],"statement":"INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, src_ref, observed_block)\nVALUES ('s2m', :source_id!, :amount!, :recipient!, :recipient_kind!, :sender!, 'observed', :src_ref!, :block_height!)\nON CONFLICT (direction, source_id) DO UPDATE\n  SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),\n      recipient_kind = COALESCE(bridge_transfers.recipient_kind, EXCLUDED.recipient_kind),\n      sender = COALESCE(bridge_transfers.sender, EXCLUDED.sender),\n      src_ref = COALESCE(bridge_transfers.src_ref, EXCLUDED.src_ref)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO bridge_transfers (direction, source_id, amount, recipient, recipient_kind, sender, status, src_ref, observed_block)
 * VALUES ('s2m', :source_id!, :amount!, :recipient!, :recipient_kind!, :sender!, 'observed', :src_ref!, :block_height!)
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET recipient = COALESCE(bridge_transfers.recipient, EXCLUDED.recipient),
 *       recipient_kind = COALESCE(bridge_transfers.recipient_kind, EXCLUDED.recipient_kind),
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
  delivery: Json | null;
  direction: string;
  dst_ref: string | null;
  last_attempt_at: Date | null;
  last_error: string | null;
  last_tx: string | null;
  observed_at: Date;
  observed_block: number;
  recipient: string | null;
  recipient_kind: string | null;
  sender: string | null;
  source_id: string;
  src_ref: string | null;
  state: string | null;
  status: string;
  submitted_at: Date | null;
  undeliverable_at: Date | null;
  undeliverable_code: string | null;
  undeliverable_reason: string | null;
}

/** 'GetTransfer' query type */
export interface IGetTransferQuery {
  params: IGetTransferParams;
  result: IGetTransferResult;
}

const getTransferIR: any = {"usedParamSet":{"direction":true,"source_id":true},"params":[{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":791,"b":801}]},{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":821,"b":831}]}],"statement":"SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,\n       t.observed_block, t.completed_block, t.observed_at, t.completed_at,\n       CASE WHEN t.status = 'completed' THEN 'completed'\n            WHEN j.undeliverable_code IS NOT NULL THEN 'undeliverable'\n            WHEN j.submitted_at IS NOT NULL THEN 'submitted'\n            ELSE 'observed' END AS state,\n       CASE WHEN t.direction = 'm2s' THEN 'solana' ELSE t.recipient_kind END AS recipient_kind,\n       j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx,\n       j.undeliverable_code, j.undeliverable_reason, j.undeliverable_at, j.delivery\nFROM bridge_transfers t\nLEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id\nWHERE t.direction = :direction! AND t.source_id = :source_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,
 *        t.observed_block, t.completed_block, t.observed_at, t.completed_at,
 *        CASE WHEN t.status = 'completed' THEN 'completed'
 *             WHEN j.undeliverable_code IS NOT NULL THEN 'undeliverable'
 *             WHEN j.submitted_at IS NOT NULL THEN 'submitted'
 *             ELSE 'observed' END AS state,
 *        CASE WHEN t.direction = 'm2s' THEN 'solana' ELSE t.recipient_kind END AS recipient_kind,
 *        j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx,
 *        j.undeliverable_code, j.undeliverable_reason, j.undeliverable_at, j.delivery
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
  recipient_kind?: string | null | void;
  state?: string | null | void;
}

/** 'ListTransfers' return type */
export interface IListTransfersResult {
  amount: string;
  attempts: number;
  completed_at: Date | null;
  completed_block: number | null;
  delivery: Json | null;
  direction: string;
  dst_ref: string | null;
  last_attempt_at: Date | null;
  last_error: string | null;
  last_tx: string | null;
  observed_at: Date;
  observed_block: number;
  recipient: string | null;
  recipient_kind: string | null;
  sender: string | null;
  source_id: string;
  src_ref: string | null;
  state: string | null;
  status: string;
  submitted_at: Date | null;
  undeliverable_at: Date | null;
  undeliverable_code: string | null;
  undeliverable_reason: string | null;
}

/** 'ListTransfers' query type */
export interface IListTransfersQuery {
  params: IListTransfersParams;
  result: IListTransfersResult;
}

const listTransfersIR: any = {"usedParamSet":{"direction":true,"state":true,"recipient_kind":true,"limit":true},"params":[{"name":"direction","required":false,"transform":{"type":"scalar"},"locs":[{"a":825,"b":834},{"a":870,"b":879}]},{"name":"state","required":false,"transform":{"type":"scalar"},"locs":[{"a":894,"b":899},{"a":931,"b":936}]},{"name":"recipient_kind","required":false,"transform":{"type":"scalar"},"locs":[{"a":951,"b":965},{"a":1006,"b":1020}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":1091,"b":1097}]}],"statement":"SELECT * FROM (\n  SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,\n         t.observed_block, t.completed_block, t.observed_at, t.completed_at,\n         CASE WHEN t.status = 'completed' THEN 'completed'\n              WHEN j.undeliverable_code IS NOT NULL THEN 'undeliverable'\n              WHEN j.submitted_at IS NOT NULL THEN 'submitted'\n              ELSE 'observed' END AS state,\n         CASE WHEN t.direction = 'm2s' THEN 'solana' ELSE t.recipient_kind END AS recipient_kind,\n         j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx,\n         j.undeliverable_code, j.undeliverable_reason, j.undeliverable_at, j.delivery\n  FROM bridge_transfers t\n  LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id\n) v\nWHERE (CAST(:direction AS TEXT) IS NULL OR v.direction = :direction)\n  AND (CAST(:state AS TEXT) IS NULL OR v.state = :state)\n  AND (CAST(:recipient_kind AS TEXT) IS NULL OR v.recipient_kind = :recipient_kind)\nORDER BY v.observed_block DESC, v.direction, v.source_id DESC\nLIMIT :limit!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM (
 *   SELECT t.direction, t.source_id, t.amount, t.recipient, t.sender, t.status, t.src_ref, t.dst_ref,
 *          t.observed_block, t.completed_block, t.observed_at, t.completed_at,
 *          CASE WHEN t.status = 'completed' THEN 'completed'
 *               WHEN j.undeliverable_code IS NOT NULL THEN 'undeliverable'
 *               WHEN j.submitted_at IS NOT NULL THEN 'submitted'
 *               ELSE 'observed' END AS state,
 *          CASE WHEN t.direction = 'm2s' THEN 'solana' ELSE t.recipient_kind END AS recipient_kind,
 *          j.attempts, j.submitted_at, j.last_attempt_at, j.last_error, j.last_tx,
 *          j.undeliverable_code, j.undeliverable_reason, j.undeliverable_at, j.delivery
 *   FROM bridge_transfers t
 *   LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
 * ) v
 * WHERE (CAST(:direction AS TEXT) IS NULL OR v.direction = :direction)
 *   AND (CAST(:state AS TEXT) IS NULL OR v.state = :state)
 *   AND (CAST(:recipient_kind AS TEXT) IS NULL OR v.recipient_kind = :recipient_kind)
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
  recipient_kind: string | null;
  source_id: string;
  submitted_at: Date | null;
}

/** 'ListRelayerCandidates' query type */
export interface IListRelayerCandidatesQuery {
  params: IListRelayerCandidatesParams;
  result: IListRelayerCandidatesResult;
}

const listRelayerCandidatesIR: any = {"usedParamSet":{"limit":true},"params":[{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":389,"b":395}]}],"statement":"SELECT t.direction, t.source_id, t.amount, t.recipient, t.recipient_kind,\n       j.attempts, j.last_attempt_at, j.last_tx, j.last_error, j.submitted_at\nFROM bridge_transfers t\nLEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id\nWHERE t.status = 'observed' AND t.recipient IS NOT NULL AND j.undeliverable_code IS NULL\nORDER BY t.direction, t.source_id\nLIMIT :limit!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT t.direction, t.source_id, t.amount, t.recipient, t.recipient_kind,
 *        j.attempts, j.last_attempt_at, j.last_tx, j.last_error, j.submitted_at
 * FROM bridge_transfers t
 * LEFT JOIN relayer_jobs j ON j.direction = t.direction AND j.source_id = t.source_id
 * WHERE t.status = 'observed' AND t.recipient IS NOT NULL AND j.undeliverable_code IS NULL
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


/** 'RecordUndeliverable' parameters type */
export interface IRecordUndeliverableParams {
  code: string;
  direction: string;
  now: DateOrString;
  reason: string;
  source_id: NumberOrString;
}

/** 'RecordUndeliverable' return type */
export type IRecordUndeliverableResult = void;

/** 'RecordUndeliverable' query type */
export interface IRecordUndeliverableQuery {
  params: IRecordUndeliverableParams;
  result: IRecordUndeliverableResult;
}

const recordUndeliverableIR: any = {"usedParamSet":{"direction":true,"source_id":true,"code":true,"reason":true,"now":true},"params":[{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":320,"b":330}]},{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":333,"b":343}]},{"name":"code","required":true,"transform":{"type":"scalar"},"locs":[{"a":349,"b":354}]},{"name":"reason","required":true,"transform":{"type":"scalar"},"locs":[{"a":357,"b":364}]},{"name":"now","required":true,"transform":{"type":"scalar"},"locs":[{"a":367,"b":371}]}],"statement":"-- 00058: a contract recipient the delivery router refused, BEFORE any operator signature.\n-- It never sets submitted_at, and never marks a submitted job (a signed mint is never undeliverable).\nINSERT INTO relayer_jobs (direction, source_id, attempts, undeliverable_code, undeliverable_reason, undeliverable_at)\nVALUES (:direction!, :source_id!, 0, :code!, :reason!, :now!)\nON CONFLICT (direction, source_id) DO UPDATE\n  SET undeliverable_code = EXCLUDED.undeliverable_code,\n      undeliverable_reason = EXCLUDED.undeliverable_reason,\n      undeliverable_at = EXCLUDED.undeliverable_at\n  WHERE relayer_jobs.submitted_at IS NULL"};

/**
 * Query generated from SQL:
 * ```
 * -- 00058: a contract recipient the delivery router refused, BEFORE any operator signature.
 * -- It never sets submitted_at, and never marks a submitted job (a signed mint is never undeliverable).
 * INSERT INTO relayer_jobs (direction, source_id, attempts, undeliverable_code, undeliverable_reason, undeliverable_at)
 * VALUES (:direction!, :source_id!, 0, :code!, :reason!, :now!)
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET undeliverable_code = EXCLUDED.undeliverable_code,
 *       undeliverable_reason = EXCLUDED.undeliverable_reason,
 *       undeliverable_at = EXCLUDED.undeliverable_at
 *   WHERE relayer_jobs.submitted_at IS NULL
 * ```
 */
export const recordUndeliverable = new PreparedQuery<IRecordUndeliverableParams,IRecordUndeliverableResult>(recordUndeliverableIR);


/** 'RecordRelayerCheck' parameters type */
export interface IRecordRelayerCheckParams {
  direction: string;
  last_error?: string | null | void;
  now: DateOrString;
  source_id: NumberOrString;
}

/** 'RecordRelayerCheck' return type */
export type IRecordRelayerCheckResult = void;

/** 'RecordRelayerCheck' query type */
export interface IRecordRelayerCheckQuery {
  params: IRecordRelayerCheckParams;
  result: IRecordRelayerCheckResult;
}

const recordRelayerCheckIR: any = {"usedParamSet":{"direction":true,"source_id":true,"now":true,"last_error":true},"params":[{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":251,"b":261}]},{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":264,"b":274}]},{"name":"now","required":true,"transform":{"type":"scalar"},"locs":[{"a":280,"b":284}]},{"name":"last_error","required":false,"transform":{"type":"scalar"},"locs":[{"a":287,"b":297}]}],"statement":"-- 00058: a recognition to retry (indexer down, contract not indexed yet): one more attempt\n-- with its error, for the backoff. It never sets submitted_at.\nINSERT INTO relayer_jobs (direction, source_id, attempts, last_attempt_at, last_error)\nVALUES (:direction!, :source_id!, 1, :now!, :last_error)\nON CONFLICT (direction, source_id) DO UPDATE\n  SET attempts = relayer_jobs.attempts + 1,\n      last_attempt_at = EXCLUDED.last_attempt_at,\n      last_error = EXCLUDED.last_error"};

/**
 * Query generated from SQL:
 * ```
 * -- 00058: a recognition to retry (indexer down, contract not indexed yet): one more attempt
 * -- with its error, for the backoff. It never sets submitted_at.
 * INSERT INTO relayer_jobs (direction, source_id, attempts, last_attempt_at, last_error)
 * VALUES (:direction!, :source_id!, 1, :now!, :last_error)
 * ON CONFLICT (direction, source_id) DO UPDATE
 *   SET attempts = relayer_jobs.attempts + 1,
 *       last_attempt_at = EXCLUDED.last_attempt_at,
 *       last_error = EXCLUDED.last_error
 * ```
 */
export const recordRelayerCheck = new PreparedQuery<IRecordRelayerCheckParams,IRecordRelayerCheckResult>(recordRelayerCheckIR);


/** 'RecordDelivery' parameters type */
export interface IRecordDeliveryParams {
  delivery: Json;
  direction: string;
  source_id: NumberOrString;
}

/** 'RecordDelivery' return type */
export type IRecordDeliveryResult = void;

/** 'RecordDelivery' query type */
export interface IRecordDeliveryQuery {
  params: IRecordDeliveryParams;
  result: IRecordDeliveryResult;
}

const recordDeliveryIR: any = {"usedParamSet":{"delivery":true,"direction":true,"source_id":true},"params":[{"name":"delivery","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":121}]},{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":141,"b":151}]},{"name":"source_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":179}]}],"statement":"-- 00058: the last submitted delivery attempt: {adapter, account, coin, tx}.\nUPDATE relayer_jobs\nSET delivery = :delivery!\nWHERE direction = :direction! AND source_id = :source_id!"};

/**
 * Query generated from SQL:
 * ```
 * -- 00058: the last submitted delivery attempt: {adapter, account, coin, tx}.
 * UPDATE relayer_jobs
 * SET delivery = :delivery!
 * WHERE direction = :direction! AND source_id = :source_id!
 * ```
 */
export const recordDelivery = new PreparedQuery<IRecordDeliveryParams,IRecordDeliveryResult>(recordDeliveryIR);


