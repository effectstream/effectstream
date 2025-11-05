/** Types generated for queries found in "src/sql/achievements.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'GetAchievementProgress' parameters type */
export interface IGetAchievementProgressParams {
  account_id: number;
  names: readonly (string | null | void)[];
}

/** 'GetAchievementProgress' return type */
export interface IGetAchievementProgressResult {
  account_id: number;
  completed_date: Date | null;
  name: string;
  progress: number | null;
  total: number | null;
}

/** 'GetAchievementProgress' query type */
export interface IGetAchievementProgressQuery {
  params: IGetAchievementProgressParams;
  result: IGetAchievementProgressResult;
}

const getAchievementProgressIR: any = {"usedParamSet":{"account_id":true,"names":true},"params":[{"name":"names","required":false,"transform":{"type":"array_spread"},"locs":[{"a":92,"b":97},{"a":110,"b":115}]},{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":78}]}],"statement":"SELECT * FROM effectstream.achievement_progress\nWHERE account_id = :account_id!\nAND ('*' in :names OR name IN :names)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.achievement_progress
 * WHERE account_id = :account_id!
 * AND ('*' in :names OR name IN :names)
 * ```
 */
export const getAchievementProgress = new PreparedQuery<IGetAchievementProgressParams,IGetAchievementProgressResult>(getAchievementProgressIR);


/** 'SetAchievementProgress' parameters type */
export interface ISetAchievementProgressParams {
  account_id: number;
  completed_date?: DateOrString | null | void;
  name: string;
  progress?: number | null | void;
  total?: number | null | void;
}

/** 'SetAchievementProgress' return type */
export type ISetAchievementProgressResult = void;

/** 'SetAchievementProgress' query type */
export interface ISetAchievementProgressQuery {
  params: ISetAchievementProgressParams;
  result: ISetAchievementProgressResult;
}

const setAchievementProgressIR: any = {"usedParamSet":{"account_id":true,"name":true,"completed_date":true,"progress":true,"total":true},"params":[{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":106,"b":117}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":125}]},{"name":"completed_date","required":false,"transform":{"type":"scalar"},"locs":[{"a":128,"b":142}]},{"name":"progress","required":false,"transform":{"type":"scalar"},"locs":[{"a":145,"b":153}]},{"name":"total","required":false,"transform":{"type":"scalar"},"locs":[{"a":156,"b":161}]}],"statement":"INSERT INTO effectstream.achievement_progress (account_id, name, completed_date, progress, total)\nVALUES (:account_id!, :name!, :completed_date, :progress, :total)\nON CONFLICT (account_id, name)\nDO UPDATE SET\n  completed_date = EXCLUDED.completed_date,\n  progress = EXCLUDED.progress,\n  total = EXCLUDED.total"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO effectstream.achievement_progress (account_id, name, completed_date, progress, total)
 * VALUES (:account_id!, :name!, :completed_date, :progress, :total)
 * ON CONFLICT (account_id, name)
 * DO UPDATE SET
 *   completed_date = EXCLUDED.completed_date,
 *   progress = EXCLUDED.progress,
 *   total = EXCLUDED.total
 * ```
 */
export const setAchievementProgress = new PreparedQuery<ISetAchievementProgressParams,ISetAchievementProgressResult>(setAchievementProgressIR);


