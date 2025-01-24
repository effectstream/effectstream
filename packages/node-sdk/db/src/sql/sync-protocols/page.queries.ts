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
  protocol_name: string;
}

/** 'GetPage' query type */
export interface IGetPageQuery {
  params: IGetPageParams;
  result: IGetPageResult;
}

const getPageIR: any = {"usedParamSet":{"protocol_name":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":75}]}],"statement":"SELECT * FROM sync_protocol_pagination\nWHERE protocol_name = :protocol_name!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM sync_protocol_pagination
 * WHERE protocol_name = :protocol_name!
 * ```
 */
export const getPage = new PreparedQuery<IGetPageParams,IGetPageResult>(getPageIR);


/** 'UpsertPage' parameters type */
export interface IUpsertPageParams {
  page: Json;
  protocol_name: string;
}

/** 'UpsertPage' return type */
export type IUpsertPageResult = void;

/** 'UpsertPage' query type */
export interface IUpsertPageQuery {
  params: IUpsertPageParams;
  result: IUpsertPageResult;
}

const upsertPageIR: any = {"usedParamSet":{"protocol_name":true,"page":true},"params":[{"name":"protocol_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":112}]},{"name":"page","required":true,"transform":{"type":"scalar"},"locs":[{"a":119,"b":124}]}],"statement":"INSERT INTO\n    sync_protocol_pagination (\n        protocol_name,\n        page\n    )\nVALUES (\n    :protocol_name!,\n    :page!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO
 *     sync_protocol_pagination (
 *         protocol_name,
 *         page
 *     )
 * VALUES (
 *     :protocol_name!,
 *     :page!
 * )
 * ```
 */
export const upsertPage = new PreparedQuery<IUpsertPageParams,IUpsertPageResult>(upsertPageIR);


