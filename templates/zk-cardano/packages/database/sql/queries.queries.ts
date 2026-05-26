/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'UpsertEligibleVoter' parameters type */
export interface IUpsertEligibleVoterParams {
  staking_credential: string;
  pool: string;
  epoch: number;
  block_height: number;
}

/** 'UpsertEligibleVoter' return type */
export type IUpsertEligibleVoterResult = void;

/** 'UpsertEligibleVoter' query type */
export interface IUpsertEligibleVoterQuery {
  params: IUpsertEligibleVoterParams;
  result: IUpsertEligibleVoterResult;
}

const upsertEligibleVoterIR: any = {"usedParamSet":{"staking_credential":true,"pool":true,"epoch":true,"block_height":true},"params":[{"name":"staking_credential","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":111}]},{"name":"pool","required":true,"transform":{"type":"scalar"},"locs":[{"a":114,"b":119}]},{"name":"epoch","required":true,"transform":{"type":"scalar"},"locs":[{"a":122,"b":128}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":131,"b":144}]}],"statement":"INSERT INTO eligible_voters\n    (staking_credential, pool, epoch, block_height)\nVALUES\n    (:staking_credential!, :pool!, :epoch!, :block_height!)\nON CONFLICT (staking_credential)\nDO UPDATE SET\n    pool = EXCLUDED.pool,\n    epoch = EXCLUDED.epoch,\n    block_height = EXCLUDED.block_height"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO eligible_voters
 *     (staking_credential, pool, epoch, block_height)
 * VALUES
 *     (:staking_credential!, :pool!, :epoch!, :block_height!)
 * ON CONFLICT (staking_credential)
 * DO UPDATE SET
 *     pool = EXCLUDED.pool,
 *     epoch = EXCLUDED.epoch,
 *     block_height = EXCLUDED.block_height
 * ```
 */
export const upsertEligibleVoter = new PreparedQuery<IUpsertEligibleVoterParams,IUpsertEligibleVoterResult>(upsertEligibleVoterIR);


/** 'GetEligibleVoter' parameters type */
export interface IGetEligibleVoterParams {
  staking_credential: string;
}

/** 'GetEligibleVoter' return type */
export interface IGetEligibleVoterResult {
  id: number;
  staking_credential: string;
  pool: string;
  epoch: number;
  block_height: number;
  registered_at: Date | null;
}

/** 'GetEligibleVoter' query type */
export interface IGetEligibleVoterQuery {
  params: IGetEligibleVoterParams;
  result: IGetEligibleVoterResult;
}

const getEligibleVoterIR: any = {"usedParamSet":{"staking_credential":true},"params":[{"name":"staking_credential","required":true,"transform":{"type":"scalar"},"locs":[{"a":57,"b":76}]}],"statement":"SELECT * FROM eligible_voters\nWHERE staking_credential = :staking_credential!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM eligible_voters
 * WHERE staking_credential = :staking_credential!
 * ```
 */
export const getEligibleVoter = new PreparedQuery<IGetEligibleVoterParams,IGetEligibleVoterResult>(getEligibleVoterIR);


/** 'UpsertProposal' parameters type */
export interface IUpsertProposalParams {
  id: number;
  title: string | null | void;
  active: boolean;
  block_height: number;
}

/** 'UpsertProposal' return type */
export type IUpsertProposalResult = void;

/** 'UpsertProposal' query type */
export interface IUpsertProposalQuery {
  params: IUpsertProposalParams;
  result: IUpsertProposalResult;
}

const upsertProposalIR: any = {"usedParamSet":{"id":true,"title":true,"active":true,"block_height":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":75}]},{"name":"title","required":false,"transform":{"type":"scalar"},"locs":[{"a":78,"b":83}]},{"name":"active","required":true,"transform":{"type":"scalar"},"locs":[{"a":86,"b":93}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":96,"b":109}]}],"statement":"INSERT INTO proposals\n    (id, title, active, block_height)\nVALUES\n    (:id!, :title, :active!, :block_height!)\nON CONFLICT (id)\nDO UPDATE SET\n    title = COALESCE(EXCLUDED.title, proposals.title),\n    active = EXCLUDED.active,\n    block_height = EXCLUDED.block_height,\n    updated_at = NOW()"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO proposals
 *     (id, title, active, block_height)
 * VALUES
 *     (:id!, :title, :active!, :block_height!)
 * ON CONFLICT (id)
 * DO UPDATE SET
 *     title = COALESCE(EXCLUDED.title, proposals.title),
 *     active = EXCLUDED.active,
 *     block_height = EXCLUDED.block_height,
 *     updated_at = NOW()
 * ```
 */
export const upsertProposal = new PreparedQuery<IUpsertProposalParams,IUpsertProposalResult>(upsertProposalIR);


/** 'UpsertVoteTally' parameters type */
export interface IUpsertVoteTallyParams {
  proposal_id: number;
  yes_count: number;
  no_count: number;
  block_height: number;
}

/** 'UpsertVoteTally' return type */
export type IUpsertVoteTallyResult = void;

/** 'UpsertVoteTally' query type */
export interface IUpsertVoteTallyQuery {
  params: IUpsertVoteTallyParams;
  result: IUpsertVoteTallyResult;
}

const upsertVoteTallyIR: any = {"usedParamSet":{"proposal_id":true,"yes_count":true,"no_count":true,"block_height":true},"params":[{"name":"proposal_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":90,"b":102}]},{"name":"yes_count","required":true,"transform":{"type":"scalar"},"locs":[{"a":105,"b":115}]},{"name":"no_count","required":true,"transform":{"type":"scalar"},"locs":[{"a":118,"b":127}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":130,"b":143}]}],"statement":"INSERT INTO vote_tallies\n    (proposal_id, yes_count, no_count, block_height)\nVALUES\n    (:proposal_id!, :yes_count!, :no_count!, :block_height!)\nON CONFLICT (proposal_id)\nDO UPDATE SET\n    yes_count = EXCLUDED.yes_count,\n    no_count = EXCLUDED.no_count,\n    block_height = EXCLUDED.block_height,\n    updated_at = NOW()"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO vote_tallies
 *     (proposal_id, yes_count, no_count, block_height)
 * VALUES
 *     (:proposal_id!, :yes_count!, :no_count!, :block_height!)
 * ON CONFLICT (proposal_id)
 * DO UPDATE SET
 *     yes_count = EXCLUDED.yes_count,
 *     no_count = EXCLUDED.no_count,
 *     block_height = EXCLUDED.block_height,
 *     updated_at = NOW()
 * ```
 */
export const upsertVoteTally = new PreparedQuery<IUpsertVoteTallyParams,IUpsertVoteTallyResult>(upsertVoteTallyIR);


/** 'GetProposals' parameters type */
export type IGetProposalsParams = void;

/** 'GetProposals' return type */
export interface IGetProposalsResult {
  id: number;
  title: string | null;
  active: boolean;
  block_height: number;
  yes_count: number;
  no_count: number;
}

/** 'GetProposals' query type */
export interface IGetProposalsQuery {
  params: IGetProposalsParams;
  result: IGetProposalsResult;
}

const getProposalsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT\n    p.id,\n    p.title,\n    p.active,\n    p.block_height,\n    COALESCE(vt.yes_count, 0) as yes_count,\n    COALESCE(vt.no_count, 0) as no_count\nFROM proposals p\nLEFT JOIN vote_tallies vt ON p.id = vt.proposal_id\nORDER BY p.id ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *     p.id,
 *     p.title,
 *     p.active,
 *     p.block_height,
 *     COALESCE(vt.yes_count, 0) as yes_count,
 *     COALESCE(vt.no_count, 0) as no_count
 * FROM proposals p
 * LEFT JOIN vote_tallies vt ON p.id = vt.proposal_id
 * ORDER BY p.id ASC
 * ```
 */
export const getProposals = new PreparedQuery<IGetProposalsParams,IGetProposalsResult>(getProposalsIR);


/** 'GetAllEligibleVoters' parameters type */
export type IGetAllEligibleVotersParams = void;

/** 'GetAllEligibleVoters' return type */
export interface IGetAllEligibleVotersResult {
  id: number;
  staking_credential: string;
  pool: string;
  epoch: number;
  block_height: number;
  registered_at: Date | null;
}

/** 'GetAllEligibleVoters' query type */
export interface IGetAllEligibleVotersQuery {
  params: IGetAllEligibleVotersParams;
  result: IGetAllEligibleVotersResult;
}

const getAllEligibleVotersIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM eligible_voters ORDER BY id ASC"};

export const getAllEligibleVoters = new PreparedQuery<IGetAllEligibleVotersParams,IGetAllEligibleVotersResult>(getAllEligibleVotersIR);


/** 'EligibleVotersTableExists' parameters type */
export type IEligibleVotersTableExistsParams = void;

/** 'EligibleVotersTableExists' return type */
export interface IEligibleVotersTableExistsResult {
  exists: boolean | null;
}

/** 'EligibleVotersTableExists' query type */
export interface IEligibleVotersTableExistsQuery {
  params: IEligibleVotersTableExistsParams;
  result: IEligibleVotersTableExistsResult;
}

const eligibleVotersTableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables\n    WHERE  table_schema = 'public'\n    AND    table_name   = 'eligible_voters'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables
 *     WHERE  table_schema = 'public'
 *     AND    table_name   = 'eligible_voters'
 * )
 * ```
 */
export const eligibleVotersTableExists = new PreparedQuery<IEligibleVotersTableExistsParams,IEligibleVotersTableExistsResult>(eligibleVotersTableExistsIR);
