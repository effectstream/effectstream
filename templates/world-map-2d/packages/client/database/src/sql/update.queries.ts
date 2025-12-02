/** Types generated for queries found in "src/sql/update.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'UpdateWorldStateCounter' parameters type */
export interface IUpdateWorldStateCounterParams {
  x: number;
  y: number;
}

/** 'UpdateWorldStateCounter' return type */
export type IUpdateWorldStateCounterResult = void;

/** 'UpdateWorldStateCounter' query type */
export interface IUpdateWorldStateCounterQuery {
  params: IUpdateWorldStateCounterParams;
  result: IUpdateWorldStateCounterResult;
}

const updateWorldStateCounterIR: any = {"usedParamSet":{"x":true,"y":true},"params":[{"name":"x","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":86}]},{"name":"y","required":true,"transform":{"type":"scalar"},"locs":[{"a":96,"b":98}]}],"statement":"UPDATE global_world_state\nSET counter = counter + 1\nWHERE can_visit = TRUE \nAND x = :x!\nAND y = :y!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_world_state
 * SET counter = counter + 1
 * WHERE can_visit = TRUE 
 * AND x = :x!
 * AND y = :y!
 * ```
 */
export const updateWorldStateCounter = new PreparedQuery<IUpdateWorldStateCounterParams,IUpdateWorldStateCounterResult>(updateWorldStateCounterIR);


/** 'UpdateWorldStateVisit' parameters type */
export interface IUpdateWorldStateVisitParams {
  can_visit: boolean;
  x: number;
  y: number;
}

/** 'UpdateWorldStateVisit' return type */
export type IUpdateWorldStateVisitResult = void;

/** 'UpdateWorldStateVisit' query type */
export interface IUpdateWorldStateVisitQuery {
  params: IUpdateWorldStateVisitParams;
  result: IUpdateWorldStateVisitResult;
}

const updateWorldStateVisitIR: any = {"usedParamSet":{"can_visit":true,"x":true,"y":true},"params":[{"name":"can_visit","required":true,"transform":{"type":"scalar"},"locs":[{"a":42,"b":52}]},{"name":"x","required":true,"transform":{"type":"scalar"},"locs":[{"a":62,"b":64}]},{"name":"y","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":76}]}],"statement":"UPDATE global_world_state\nSET can_visit = :can_visit!\nAND x = :x!\nAND y = :y!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_world_state
 * SET can_visit = :can_visit!
 * AND x = :x!
 * AND y = :y!
 * ```
 */
export const updateWorldStateVisit = new PreparedQuery<IUpdateWorldStateVisitParams,IUpdateWorldStateVisitResult>(updateWorldStateVisitIR);


/** 'UpdateUserGlobalPosition' parameters type */
export interface IUpdateUserGlobalPositionParams {
  wallet: string;
  x: number;
  y: number;
}

/** 'UpdateUserGlobalPosition' return type */
export type IUpdateUserGlobalPositionResult = void;

/** 'UpdateUserGlobalPosition' query type */
export interface IUpdateUserGlobalPositionQuery {
  params: IUpdateUserGlobalPositionParams;
  result: IUpdateUserGlobalPositionResult;
}

const updateUserGlobalPositionIR: any = {"usedParamSet":{"x":true,"y":true,"wallet":true},"params":[{"name":"x","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":36}]},{"name":"y","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":45}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":62,"b":69}]}],"statement":"UPDATE global_user_state\nSET \nx = :x!,\ny = :y!\nWHERE wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE global_user_state
 * SET 
 * x = :x!,
 * y = :y!
 * WHERE wallet = :wallet!
 * ```
 */
export const updateUserGlobalPosition = new PreparedQuery<IUpdateUserGlobalPositionParams,IUpdateUserGlobalPositionResult>(updateUserGlobalPositionIR);


