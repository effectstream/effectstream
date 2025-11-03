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

const getPageIR: any = {"usedParamSet":{"protocol_name":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":88}]}],"statement":"SELECT * FROM effectstream.sync_protocol_pagination\nWHERE protocol_name = :protocol_name!\nORDER BY page_number ASC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM effectstream.sync_protocol_pagination
 * WHERE protocol_name = :protocol_name!
 * ORDER BY page_number ASC
 * LIMIT 1
 * ```
 */
export const getPage = new PreparedQuery<IGetPageParams,IGetPageResult>(getPageIR);


/** 'GetSyncAndLastPage' parameters type */
export type IGetSyncAndLastPageParams = void;

/** 'GetSyncAndLastPage' return type */
export interface IGetSyncAndLastPageResult {
  fetched_page: number | null;
  protocol_name: string;
  synced_page: number | null;
}

/** 'GetSyncAndLastPage' query type */
export interface IGetSyncAndLastPageQuery {
  params: IGetSyncAndLastPageParams;
  result: IGetSyncAndLastPageResult;
}

const getSyncAndLastPageIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT\n  protocol_name,\n  MIN(page_number) AS synced_page,\n  MAX(page_number) AS fetched_page\nFROM\n effectstream.sync_protocol_pagination\nGROUP BY\n  protocol_name\nORDER BY\n  protocol_name"};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *   protocol_name,
 *   MIN(page_number) AS synced_page,
 *   MAX(page_number) AS fetched_page
 * FROM
 *  effectstream.sync_protocol_pagination
 * GROUP BY
 *   protocol_name
 * ORDER BY
 *   protocol_name
 * ```
 */
export const getSyncAndLastPage = new PreparedQuery<IGetSyncAndLastPageParams,IGetSyncAndLastPageResult>(getSyncAndLastPageIR);


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

const removePagesIR: any = {"usedParamSet":{"protocol_name":true,"page_number":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":86}]},{"name":"page_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":106,"b":118}]}],"statement":"DELETE FROM effectstream.sync_protocol_pagination\nWHERE protocol_name = :protocol_name!\nAND page_number < :page_number!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM effectstream.sync_protocol_pagination
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

const upsertPageIR: any = {"usedParamSet":{"protocol_name":true,"page_number":true,"page":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":131,"b":145}]},{"name":"page_number","required":true,"transform":{"type":"scalar"},"locs":[{"a":152,"b":164}]},{"name":"page","required":true,"transform":{"type":"scalar"},"locs":[{"a":171,"b":176}]}],"statement":"INSERT INTO\n   effectstream.sync_protocol_pagination (\n        protocol_name,\n        page_number,\n        page\n    )\nVALUES (\n    :protocol_name!,\n    :page_number!,\n    :page!\n)\nON CONFLICT (protocol_name, page_number) DO UPDATE SET\n    page = EXCLUDED.page"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO
 *    effectstream.sync_protocol_pagination (
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


