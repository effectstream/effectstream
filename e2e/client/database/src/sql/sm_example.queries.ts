/** Types generated for queries found in "src/sql/sm_example.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

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

const getStateMachineInputIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM user_state_machine\nORDER BY id ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM user_state_machine
 * ORDER BY id ASC
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

const getStateMachineInputByBlockHeightIR: any = {"usedParamSet":{"block_height":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":67}]}],"statement":"SELECT * FROM user_state_machine\nWHERE block_height = :block_height!\nORDER BY id ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM user_state_machine
 * WHERE block_height = :block_height!
 * ORDER BY id ASC
 * ```
 */
export const getStateMachineInputByBlockHeight = new PreparedQuery<IGetStateMachineInputByBlockHeightParams,IGetStateMachineInputByBlockHeightResult>(getStateMachineInputByBlockHeightIR);


/** 'GetLastSumFromExampleTable' parameters type */
export type IGetLastSumFromExampleTableParams = void;

/** 'GetLastSumFromExampleTable' return type */
export interface IGetLastSumFromExampleTableResult {
  sum: number;
}

/** 'GetLastSumFromExampleTable' query type */
export interface IGetLastSumFromExampleTableQuery {
  params: IGetLastSumFromExampleTableParams;
  result: IGetLastSumFromExampleTableResult;
}

const getLastSumFromExampleTableIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT sum FROM another_example_table \nORDER BY block_height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT sum FROM another_example_table 
 * ORDER BY block_height DESC
 * LIMIT 1
 * ```
 */
export const getLastSumFromExampleTable = new PreparedQuery<IGetLastSumFromExampleTableParams,IGetLastSumFromExampleTableResult>(getLastSumFromExampleTableIR);


/** 'InsertSumIntoExampleTable' parameters type */
export interface IInsertSumIntoExampleTableParams {
  block_height: number;
  sum: number;
}

/** 'InsertSumIntoExampleTable' return type */
export type IInsertSumIntoExampleTableResult = void;

/** 'InsertSumIntoExampleTable' query type */
export interface IInsertSumIntoExampleTableQuery {
  params: IInsertSumIntoExampleTableParams;
  result: IInsertSumIntoExampleTableResult;
}

const insertSumIntoExampleTableIR: any = {"usedParamSet":{"sum":true,"block_height":true},"params":[{"name":"sum","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":69}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":85}]}],"statement":"INSERT INTO another_example_table \n(sum, block_height) \nVALUES \n(:sum!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO another_example_table 
 * (sum, block_height) 
 * VALUES 
 * (:sum!, :block_height!)
 * ```
 */
export const insertSumIntoExampleTable = new PreparedQuery<IInsertSumIntoExampleTableParams,IInsertSumIntoExampleTableResult>(insertSumIntoExampleTableIR);


/** 'InsertAvailMessage' parameters type */
export interface IInsertAvailMessageParams {
  height: number;
  message: string;
}

/** 'InsertAvailMessage' return type */
export type IInsertAvailMessageResult = void;

/** 'InsertAvailMessage' query type */
export interface IInsertAvailMessageQuery {
  params: IInsertAvailMessageParams;
  result: IInsertAvailMessageResult;
}

const insertAvailMessageIR: any = {"usedParamSet":{"message":true,"height":true},"params":[{"name":"message","required":true,"transform":{"type":"scalar"},"locs":[{"a":56,"b":64}]},{"name":"height","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":74}]}],"statement":"INSERT INTO avail_messages \n(message, height) \nVALUES \n(:message!, :height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO avail_messages 
 * (message, height) 
 * VALUES 
 * (:message!, :height!)
 * ```
 */
export const insertAvailMessage = new PreparedQuery<IInsertAvailMessageParams,IInsertAvailMessageResult>(insertAvailMessageIR);


/** 'GetLatestAvailMessage' parameters type */
export type IGetLatestAvailMessageParams = void;

/** 'GetLatestAvailMessage' return type */
export interface IGetLatestAvailMessageResult {
  height: number;
  id: number;
  message: string;
}

/** 'GetLatestAvailMessage' query type */
export interface IGetLatestAvailMessageQuery {
  params: IGetLatestAvailMessageParams;
  result: IGetLatestAvailMessageResult;
}

const getLatestAvailMessageIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM avail_messages \nORDER BY height DESC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM avail_messages 
 * ORDER BY height DESC
 * LIMIT 1
 * ```
 */
export const getLatestAvailMessage = new PreparedQuery<IGetLatestAvailMessageParams,IGetLatestAvailMessageResult>(getLatestAvailMessageIR);


/** 'InsertCounterInput' parameters type */
export interface IInsertCounterInputParams {
  block_height: number;
  counter: number;
}

/** 'InsertCounterInput' return type */
export type IInsertCounterInputResult = void;

/** 'InsertCounterInput' query type */
export interface IInsertCounterInputQuery {
  params: IInsertCounterInputParams;
  result: IInsertCounterInputResult;
}

const insertCounterInputIR: any = {"usedParamSet":{"counter":true,"block_height":true},"params":[{"name":"counter","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":69}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":85}]}],"statement":"INSERT INTO counter_inputs\n(counter, block_height) \nVALUES \n(:counter!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO counter_inputs
 * (counter, block_height) 
 * VALUES 
 * (:counter!, :block_height!)
 * ```
 */
export const insertCounterInput = new PreparedQuery<IInsertCounterInputParams,IInsertCounterInputResult>(insertCounterInputIR);


/** 'InsertBitcoinTransaction' parameters type */
export interface IInsertBitcoinTransactionParams {
  address: string;
  block_height: number;
  direction: string;
  index: number;
  label: string;
  transaction_id: string;
  utxo_txid: string;
  utxo_vout: number;
  value_sats: NumberOrString;
}

/** 'InsertBitcoinTransaction' return type */
export type IInsertBitcoinTransactionResult = void;

/** 'InsertBitcoinTransaction' query type */
export interface IInsertBitcoinTransactionQuery {
  params: IInsertBitcoinTransactionParams;
  result: IInsertBitcoinTransactionResult;
}

const insertBitcoinTransactionIR: any = {"usedParamSet":{"block_height":true,"direction":true,"address":true,"transaction_id":true,"index":true,"value_sats":true,"utxo_txid":true,"utxo_vout":true,"label":true},"params":[{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":153}]},{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":156,"b":166}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":177}]},{"name":"transaction_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":180,"b":195}]},{"name":"index","required":true,"transform":{"type":"scalar"},"locs":[{"a":198,"b":204}]},{"name":"value_sats","required":true,"transform":{"type":"scalar"},"locs":[{"a":207,"b":218}]},{"name":"utxo_txid","required":true,"transform":{"type":"scalar"},"locs":[{"a":221,"b":231}]},{"name":"utxo_vout","required":true,"transform":{"type":"scalar"},"locs":[{"a":234,"b":244}]},{"name":"label","required":true,"transform":{"type":"scalar"},"locs":[{"a":247,"b":253}]}],"statement":"INSERT INTO bitcoin_transactions\n(block_height, direction, address, transaction_id, index, value_sats, utxo_txid, utxo_vout, label)\nVALUES\n(:block_height!, :direction!, :address!, :transaction_id!, :index!, :value_sats!, :utxo_txid!, :utxo_vout!, :label!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO bitcoin_transactions
 * (block_height, direction, address, transaction_id, index, value_sats, utxo_txid, utxo_vout, label)
 * VALUES
 * (:block_height!, :direction!, :address!, :transaction_id!, :index!, :value_sats!, :utxo_txid!, :utxo_vout!, :label!)
 * ```
 */
export const insertBitcoinTransaction = new PreparedQuery<IInsertBitcoinTransactionParams,IInsertBitcoinTransactionResult>(insertBitcoinTransactionIR);


