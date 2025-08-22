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

const getAchievementProgressIR: any = {"usedParamSet":{"account_id":true,"names":true},"params":[{"name":"names","required":false,"transform":{"type":"array_spread"},"locs":[{"a":85,"b":90},{"a":103,"b":108}]},{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":71}]}],"statement":"SELECT * FROM paima.achievement_progress\nWHERE account_id = :account_id!\nAND ('*' in :names OR name IN :names)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.achievement_progress
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

const setAchievementProgressIR: any = {"usedParamSet":{"account_id":true,"name":true,"completed_date":true,"progress":true,"total":true},"params":[{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":99,"b":110}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":118}]},{"name":"completed_date","required":false,"transform":{"type":"scalar"},"locs":[{"a":121,"b":135}]},{"name":"progress","required":false,"transform":{"type":"scalar"},"locs":[{"a":138,"b":146}]},{"name":"total","required":false,"transform":{"type":"scalar"},"locs":[{"a":149,"b":154}]}],"statement":"INSERT INTO paima.achievement_progress (account_id, name, completed_date, progress, total)\nVALUES (:account_id!, :name!, :completed_date, :progress, :total)\nON CONFLICT (account_id, name)\nDO UPDATE SET\n  completed_date = EXCLUDED.completed_date,\n  progress = EXCLUDED.progress,\n  total = EXCLUDED.total"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima.achievement_progress (account_id, name, completed_date, progress, total)
 * VALUES (:account_id!, :name!, :completed_date, :progress, :total)
 * ON CONFLICT (account_id, name)
 * DO UPDATE SET
 *   completed_date = EXCLUDED.completed_date,
 *   progress = EXCLUDED.progress,
 *   total = EXCLUDED.total
 * ```
 */
export const setAchievementProgress = new PreparedQuery<ISetAchievementProgressParams,ISetAchievementProgressResult>(setAchievementProgressIR);


