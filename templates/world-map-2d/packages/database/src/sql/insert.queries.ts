/** Types generated for queries found in "src/sql/insert.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'CreateGlobalWorldState' parameters type */
export interface ICreateGlobalWorldStateParams {
  can_visit: boolean;
  x: number;
  y: number;
}

/** 'CreateGlobalWorldState' return type */
export type ICreateGlobalWorldStateResult = void;

/** 'CreateGlobalWorldState' query type */
export interface ICreateGlobalWorldStateQuery {
  params: ICreateGlobalWorldStateParams;
  result: ICreateGlobalWorldStateResult;
}

const createGlobalWorldStateIR: any = {"usedParamSet":{"x":true,"y":true,"can_visit":true},"params":[{"name":"x","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":69}]},{"name":"y","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":75}]},{"name":"can_visit","required":true,"transform":{"type":"scalar"},"locs":[{"a":79,"b":89}]}],"statement":"INSERT INTO global_world_state (\n  x,\n  y,\n  can_visit\n) VALUES (\n :x!,\n :y!,\n :can_visit!\n) \nON CONFLICT(x, y)\nDO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_world_state (
 *   x,
 *   y,
 *   can_visit
 * ) VALUES (
 *  :x!,
 *  :y!,
 *  :can_visit!
 * ) 
 * ON CONFLICT(x, y)
 * DO NOTHING
 * ```
 */
export const createGlobalWorldState = new PreparedQuery<ICreateGlobalWorldStateParams,ICreateGlobalWorldStateResult>(createGlobalWorldStateIR);


/** 'CreateGlobalUserState' parameters type */
export interface ICreateGlobalUserStateParams {
  wallet: string;
  x: number;
  y: number;
}

/** 'CreateGlobalUserState' return type */
export type ICreateGlobalUserStateResult = void;

/** 'CreateGlobalUserState' query type */
export interface ICreateGlobalUserStateQuery {
  params: ICreateGlobalUserStateParams;
  result: ICreateGlobalUserStateResult;
}

const createGlobalUserStateIR: any = {"usedParamSet":{"wallet":true,"x":true,"y":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":72}]},{"name":"x","required":true,"transform":{"type":"scalar"},"locs":[{"a":77,"b":79}]},{"name":"y","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":86}]}],"statement":"INSERT INTO global_user_state (\n  wallet, \n  x,\n  y\n) VALUES (\n  :wallet!,\n  :x!,\n  :y!\n)\nON CONFLICT (wallet)\nDO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO global_user_state (
 *   wallet, 
 *   x,
 *   y
 * ) VALUES (
 *   :wallet!,
 *   :x!,
 *   :y!
 * )
 * ON CONFLICT (wallet)
 * DO NOTHING
 * ```
 */
export const createGlobalUserState = new PreparedQuery<ICreateGlobalUserStateParams,ICreateGlobalUserStateResult>(createGlobalUserStateIR);


