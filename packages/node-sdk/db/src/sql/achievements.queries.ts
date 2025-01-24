/** Types generated for queries found in "src/sql/achievements.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'GetAchievementProgress' parameters type */
export interface IGetAchievementProgressParams {
  names: readonly (string | null | void)[];
  wallet: number;
}

/** 'GetAchievementProgress' return type */
export interface IGetAchievementProgressResult {
  completed_date: Date | null;
  name: string;
  progress: number | null;
  total: number | null;
  wallet: number;
}

/** 'GetAchievementProgress' query type */
export interface IGetAchievementProgressQuery {
  params: IGetAchievementProgressParams;
  result: IGetAchievementProgressResult;
}

const getAchievementProgressIR: any = {"usedParamSet":{"wallet":true,"names":true},"params":[{"name":"names","required":false,"transform":{"type":"array_spread"},"locs":[{"a":71,"b":76},{"a":89,"b":94}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":50,"b":57}]}],"statement":"SELECT * FROM achievement_progress\nWHERE wallet = :wallet!\nAND ('*' in :names OR name IN :names)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM achievement_progress
 * WHERE wallet = :wallet!
 * AND ('*' in :names OR name IN :names)
 * ```
 */
export const getAchievementProgress = new PreparedQuery<IGetAchievementProgressParams,IGetAchievementProgressResult>(getAchievementProgressIR);


/** 'SetAchievementProgress' parameters type */
export interface ISetAchievementProgressParams {
  completed_date?: DateOrString | null | void;
  name: string;
  progress?: number | null | void;
  total?: number | null | void;
  wallet: number;
}

/** 'SetAchievementProgress' return type */
export type ISetAchievementProgressResult = void;

/** 'SetAchievementProgress' query type */
export interface ISetAchievementProgressQuery {
  params: ISetAchievementProgressParams;
  result: ISetAchievementProgressResult;
}

const setAchievementProgressIR: any = {"usedParamSet":{"wallet":true,"name":true,"completed_date":true,"progress":true,"total":true},"params":[{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":89,"b":96}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":99,"b":104}]},{"name":"completed_date","required":false,"transform":{"type":"scalar"},"locs":[{"a":107,"b":121}]},{"name":"progress","required":false,"transform":{"type":"scalar"},"locs":[{"a":124,"b":132}]},{"name":"total","required":false,"transform":{"type":"scalar"},"locs":[{"a":135,"b":140}]}],"statement":"INSERT INTO achievement_progress (wallet, name, completed_date, progress, total)\nVALUES (:wallet!, :name!, :completed_date, :progress, :total)\nON CONFLICT (wallet, name)\nDO UPDATE SET\n  completed_date = EXCLUDED.completed_date,\n  progress = EXCLUDED.progress,\n  total = EXCLUDED.total"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO achievement_progress (wallet, name, completed_date, progress, total)
 * VALUES (:wallet!, :name!, :completed_date, :progress, :total)
 * ON CONFLICT (wallet, name)
 * DO UPDATE SET
 *   completed_date = EXCLUDED.completed_date,
 *   progress = EXCLUDED.progress,
 *   total = EXCLUDED.total
 * ```
 */
export const setAchievementProgress = new PreparedQuery<ISetAchievementProgressParams,ISetAchievementProgressResult>(setAchievementProgressIR);


