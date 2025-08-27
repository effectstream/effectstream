/** Types generated for queries found in "src/sql/sync-protocols/page.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 'GetPage' parameters type */
export interface IGetPageParams {
  protocol_name: string;
}

/** 'GetPage' return type */
export interface IGetPageResult {
  page: Json;
  page_number: number;
  protocol_name: string;
}

/** 'GetPage' query type */
export interface IGetPageQuery {
  params: IGetPageParams;
  result: IGetPageResult;
}

const getPageIR: any = {"usedParamSet":{"protocol_name":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":81}]}],"statement":"SELECT * FROM paima.sync_protocol_pagination\nWHERE protocol_name = :protocol_name!\nORDER BY page_number ASC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.sync_protocol_pagination
 * WHERE protocol_name = :protocol_name!
 * ORDER BY page_number ASC
 * LIMIT 1
 * ```
 */
export const getPage = new PreparedQuery<IGetPageParams,IGetPageResult>(getPageIR);


/** 'RemovePages' parameters type */
export interface IRemovePagesParams {
  page_number: number;
  protocol_name: string;
}

/** 'RemovePages' return type */
export type IRemovePagesResult = void;

/** 'RemovePages' query type */
export interface IRemovePagesQuery {
  params: IRemovePagesParams;
  result: IRemovePagesResult;
}

const removePagesIR: any = {"usedParamSet":{"protocol_name":true,"page_number":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":79}]},{"name":"page_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":99,"b":111}]}],"statement":"DELETE FROM paima.sync_protocol_pagination\nWHERE protocol_name = :protocol_name!\nAND page_number < :page_number!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM paima.sync_protocol_pagination
 * WHERE protocol_name = :protocol_name!
 * AND page_number < :page_number!
 * ```
 */
export const removePages = new PreparedQuery<IRemovePagesParams,IRemovePagesResult>(removePagesIR);


/** 'UpsertPage' parameters type */
export interface IUpsertPageParams {
  page: Json;
  page_number: number;
  protocol_name: string;
}

/** 'UpsertPage' return type */
export type IUpsertPageResult = void;

/** 'UpsertPage' query type */
export interface IUpsertPageQuery {
  params: IUpsertPageParams;
  result: IUpsertPageResult;
}

const upsertPageIR: any = {"usedParamSet":{"protocol_name":true,"page_number":true,"page":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":139}]},{"name":"page_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":146,"b":158}]},{"name":"page","required":true,"transform":{"type":"scalar"},"locs":[{"a":165,"b":170}]}],"statement":"INSERT INTO\n    paima.sync_protocol_pagination (\n        protocol_name,\n        page_number,\n        page\n    )\nVALUES (\n    :protocol_name!,\n    :page_number!,\n    :page!\n)\nON CONFLICT (protocol_name, page_number) DO UPDATE SET\n    page = EXCLUDED.page"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO
 *     paima.sync_protocol_pagination (
 *         protocol_name,
 *         page_number,
 *         page
 *     )
 * VALUES (
 *     :protocol_name!,
 *     :page_number!,
 *     :page!
 * )
 * ON CONFLICT (protocol_name, page_number) DO UPDATE SET
 *     page = EXCLUDED.page
 * ```
 */
export const upsertPage = new PreparedQuery<IUpsertPageParams,IUpsertPageResult>(upsertPageIR);


