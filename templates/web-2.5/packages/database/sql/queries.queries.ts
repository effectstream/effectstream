/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetUser' parameters type */
export interface IGetUserParams {
  wallet: string;
}

/** 'GetUser' return type */
export interface IGetUserResult {
  experience: number;
  name: string | null;
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


/** 'GetAllUsers' parameters type */
export type IGetAllUsersParams = void;

/** 'GetAllUsers' return type */
export interface IGetAllUsersResult {
  experience: number;
  name: string | null;
  wallet: string;
}

/** 'GetAllUsers' query type */
export interface IGetAllUsersQuery {
  params: IGetAllUsersParams;
  result: IGetAllUsersResult;
}

const getAllUsersIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM users ORDER BY experience DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM users ORDER BY experience DESC
 * ```
 */
export const getAllUsers = new PreparedQuery<IGetAllUsersParams,IGetAllUsersResult>(getAllUsersIR);


/** 'UpsertUser' parameters type */
export interface IUpsertUserParams {
  experience: number;
  name?: string | null | void;
  wallet: string;
}

/** 'UpsertUser' return type */
export type IUpsertUserResult = void;

/** 'UpsertUser' query type */
export interface IUpsertUserQuery {
  params: IUpsertUserParams;
  result: IUpsertUserResult;
}

const upsertUserIR: any = {"usedParamSet":{"wallet":true,"name":true,"experience":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":52,"b":59}]},{"name":"name","required":false,"transform":{"type":"scalar"},"locs":[{"a":62,"b":66}]},{"name":"experience","required":true,"transform":{"type":"scalar"},"locs":[{"a":69,"b":80}]}],"statement":"INSERT INTO users(wallet, name, experience)\nVALUES (:wallet!, :name, :experience!)\nON CONFLICT (wallet)\nDO UPDATE SET\nexperience = EXCLUDED.experience,\nname = EXCLUDED.name"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO users(wallet, name, experience)
 * VALUES (:wallet!, :name, :experience!)
 * ON CONFLICT (wallet)
 * DO UPDATE SET
 * experience = EXCLUDED.experience,
 * name = EXCLUDED.name
 * ```
 */
export const upsertUser = new PreparedQuery<IUpsertUserParams,IUpsertUserResult>(upsertUserIR);


