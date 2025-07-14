/** Types generated for queries found in "src/sql/sm_example.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'InsertStateMachineInput' parameters type */
export interface IInsertStateMachineInputParams {
  block_height: number;
  inputs: string;
}

/** 'InsertStateMachineInput' return type */
export type IInsertStateMachineInputResult = void;

/** 'InsertStateMachineInput' query type */
export interface IInsertStateMachineInputQuery {
  params: IInsertStateMachineInputParams;
  result: IInsertStateMachineInputResult;
}

const insertStateMachineInputIR: any = {"usedParamSet":{"inputs":true,"block_height":true},"params":[{"name":"inputs","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":72}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":75,"b":88}]}],"statement":"INSERT INTO user_state_machine \n(inputs, block_height) \nVALUES \n(:inputs!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO user_state_machine 
 * (inputs, block_height) 
 * VALUES 
 * (:inputs!, :block_height!)
 * ```
 */
export const insertStateMachineInput = new PreparedQuery<IInsertStateMachineInputParams,IInsertStateMachineInputResult>(insertStateMachineInputIR);


/** 'GetStateMachineInput' parameters type */
export type IGetStateMachineInputParams = void;

/** 'GetStateMachineInput' return type */
export interface IGetStateMachineInputResult {
  block_height: number;
  id: number;
  inputs: string;
}

/** 'GetStateMachineInput' query type */
export interface IGetStateMachineInputQuery {
  params: IGetStateMachineInputParams;
  result: IGetStateMachineInputResult;
}

const getStateMachineInputIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM user_state_machine"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM user_state_machine
 * ```
 */
export const getStateMachineInput = new PreparedQuery<IGetStateMachineInputParams,IGetStateMachineInputResult>(getStateMachineInputIR);


/** 'GetStateMachineInputByBlockHeight' parameters type */
export interface IGetStateMachineInputByBlockHeightParams {
  block_height: number;
}

/** 'GetStateMachineInputByBlockHeight' return type */
export interface IGetStateMachineInputByBlockHeightResult {
  block_height: number;
  id: number;
  inputs: string;
}

/** 'GetStateMachineInputByBlockHeight' query type */
export interface IGetStateMachineInputByBlockHeightQuery {
  params: IGetStateMachineInputByBlockHeightParams;
  result: IGetStateMachineInputByBlockHeightResult;
}

const getStateMachineInputByBlockHeightIR: any = {"usedParamSet":{"block_height":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":68}]}],"statement":"SELECT * FROM user_state_machine \nWHERE block_height = :block_height!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM user_state_machine 
 * WHERE block_height = :block_height!
 * ```
 */
export const getStateMachineInputByBlockHeight = new PreparedQuery<IGetStateMachineInputByBlockHeightParams,IGetStateMachineInputByBlockHeightResult>(getStateMachineInputByBlockHeightIR);


