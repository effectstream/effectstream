/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetUser' parameters type */
export interface IGetUserParams {
  wallet: string;
}

/** 'GetUser' return type */
export interface IGetUserResult {
  experience: number;
  wallet: string;
}

/** 'GetUser' query type */
export interface IGetUserQuery {
  params: IGetUserParams;
  result: IGetUserResult;
}

const getUserIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":48}]}],"statement":"SELECT * FROM users\nWHERE users.wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM users
 * WHERE users.wallet = :wallet!
 * ```
 */
export const getUser = new PreparedQuery<IGetUserParams,IGetUserResult>(getUserIR);


/** 'UpsertUser' parameters type */
export interface IUpsertUserParams {
  stats: {
    wallet: string,
    experience: number
  };
}

/** 'UpsertUser' return type */
export type IUpsertUserResult = void;

/** 'UpsertUser' query type */
export interface IUpsertUserQuery {
  params: IUpsertUserParams;
  result: IUpsertUserResult;
}

const upsertUserIR: any = {"usedParamSet":{"stats":true},"params":[{"name":"stats","required":false,"transform":{"type":"pick_tuple","keys":[{"name":"wallet","required":true},{"name":"experience","required":true}]},"locs":[{"a":25,"b":30}]}],"statement":"INSERT INTO users\nVALUES :stats\nON CONFLICT (wallet)\nDO UPDATE SET\nexperience = EXCLUDED.experience"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO users
 * VALUES :stats
 * ON CONFLICT (wallet)
 * DO UPDATE SET
 * experience = EXCLUDED.experience
 * ```
 */
export const upsertUser = new PreparedQuery<IUpsertUserParams,IUpsertUserResult>(upsertUserIR);


