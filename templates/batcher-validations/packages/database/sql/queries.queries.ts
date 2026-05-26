/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetGateStatus' parameters type */
export type IGetGateStatusParams = void;

/** 'GetGateStatus' return type */
export interface IGetGateStatusResult {
  accepting: boolean;
}

/** 'GetGateStatus' query type */
export interface IGetGateStatusQuery {
  params: IGetGateStatusParams;
  result: IGetGateStatusResult;
}

const getGateStatusIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT accepting FROM gate_config WHERE id = 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT accepting FROM gate_config WHERE id = 1
 * ```
 */
export const getGateStatus = new PreparedQuery<IGetGateStatusParams,IGetGateStatusResult>(getGateStatusIR);


/** 'SetGateStatus' parameters type */
export interface ISetGateStatusParams {
  accepting: boolean;
}

/** 'SetGateStatus' return type */
export type ISetGateStatusResult = void;

/** 'SetGateStatus' query type */
export interface ISetGateStatusQuery {
  params: ISetGateStatusParams;
  result: ISetGateStatusResult;
}

const setGateStatusIR: any = {"usedParamSet":{"accepting":true},"params":[{"name":"accepting","required":true,"transform":{"type":"scalar"},"locs":[{"a":35,"b":45}]}],"statement":"UPDATE gate_config SET accepting = :accepting! WHERE id = 1"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE gate_config SET accepting = :accepting! WHERE id = 1
 * ```
 */
export const setGateStatus = new PreparedQuery<ISetGateStatusParams,ISetGateStatusResult>(setGateStatusIR);


/** 'InsertCommand' parameters type */
export interface IInsertCommandParams {
  block_height: number;
  message: string;
  sender: string;
}

/** 'InsertCommand' return type */
export type IInsertCommandResult = void;

/** 'InsertCommand' query type */
export interface IInsertCommandQuery {
  params: IInsertCommandParams;
  result: IInsertCommandResult;
}

const insertCommandIR: any = {"usedParamSet":{"sender":true,"message":true,"block_height":true},"params":[{"name":"sender","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":68}]},{"name":"message","required":true,"transform":{"type":"scalar"},"locs":[{"a":71,"b":79}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":95}]}],"statement":"INSERT INTO commands (sender, message, block_height)\nVALUES (:sender!, :message!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO commands (sender, message, block_height)
 * VALUES (:sender!, :message!, :block_height!)
 * ```
 */
export const insertCommand = new PreparedQuery<IInsertCommandParams,IInsertCommandResult>(insertCommandIR);


/** 'GetCommands' parameters type */
export type IGetCommandsParams = void;

/** 'GetCommands' return type */
export interface IGetCommandsResult {
  block_height: number;
  created_at: Date | null;
  id: number;
  message: string;
  sender: string;
}

/** 'GetCommands' query type */
export interface IGetCommandsQuery {
  params: IGetCommandsParams;
  result: IGetCommandsResult;
}

const getCommandsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM commands ORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM commands ORDER BY id DESC
 * ```
 */
export const getCommands = new PreparedQuery<IGetCommandsParams,IGetCommandsResult>(getCommandsIR);


