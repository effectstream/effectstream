/** Types generated for queries found in "src/sql/select.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetUserStats' parameters type */
export interface IGetUserStatsParams {
  wallet?: string | null | void;
}

/** 'GetUserStats' return type */
export interface IGetUserStatsResult {
  wallet: string;
  x: number;
  y: number;
}

/** 'GetUserStats' query type */
export interface IGetUserStatsQuery {
  params: IGetUserStatsParams;
  result: IGetUserStatsResult;
}

const getUserStatsIR: any = {"usedParamSet":{"wallet":true},"params":[{"name":"wallet","required":false,"transform":{"type":"scalar"},"locs":[{"a":47,"b":53}]}],"statement":"SELECT * FROM global_user_state\nWHERE wallet = :wallet"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_user_state
 * WHERE wallet = :wallet
 * ```
 */
export const getUserStats = new PreparedQuery<IGetUserStatsParams,IGetUserStatsResult>(getUserStatsIR);


/** 'GetWorldStats' parameters type */
export interface IGetWorldStatsParams {
  x?: number | null | void;
  y?: number | null | void;
}

/** 'GetWorldStats' return type */
export interface IGetWorldStatsResult {
  can_visit: boolean;
  counter: number;
  x: number;
  y: number;
}

/** 'GetWorldStats' query type */
export interface IGetWorldStatsQuery {
  params: IGetWorldStatsParams;
  result: IGetWorldStatsResult;
}

const getWorldStatsIR: any = {"usedParamSet":{"x":true,"y":true},"params":[{"name":"x","required":false,"transform":{"type":"scalar"},"locs":[{"a":43,"b":44}]},{"name":"y","required":false,"transform":{"type":"scalar"},"locs":[{"a":54,"b":55}]}],"statement":"SELECT * FROM global_world_state\nWHERE x = :x AND y = :y"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_world_state
 * WHERE x = :x AND y = :y
 * ```
 */
export const getWorldStats = new PreparedQuery<IGetWorldStatsParams,IGetWorldStatsResult>(getWorldStatsIR);


/** 'GetAllWorldStats' parameters type */
export type IGetAllWorldStatsParams = void;

/** 'GetAllWorldStats' return type */
export interface IGetAllWorldStatsResult {
  can_visit: boolean;
  counter: number;
  x: number;
  y: number;
}

/** 'GetAllWorldStats' query type */
export interface IGetAllWorldStatsQuery {
  params: IGetAllWorldStatsParams;
  result: IGetAllWorldStatsResult;
}

const getAllWorldStatsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM global_world_state\nWHERE can_visit = TRUE"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM global_world_state
 * WHERE can_visit = TRUE
 * ```
 */
export const getAllWorldStats = new PreparedQuery<IGetAllWorldStatsParams,IGetAllWorldStatsResult>(getAllWorldStatsIR);


