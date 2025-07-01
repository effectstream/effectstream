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

const insertStateMachineInputIR: any = {"usedParamSet":{"inputs":true,"block_height":true},"params":[{"name":"inputs","required":true,"transform":{"type":"scalar"},"locs":[{"a":66,"b":73}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":76,"b":89}]}],"statement":"INSERT INTO paima_state_machine \n(inputs, block_height) \nVALUES \n(:inputs!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima_state_machine 
 * (inputs, block_height) 
 * VALUES 
 * (:inputs!, :block_height!)
 * ```
 */
export const insertStateMachineInput = new PreparedQuery<IInsertStateMachineInputParams,IInsertStateMachineInputResult>(insertStateMachineInputIR);


