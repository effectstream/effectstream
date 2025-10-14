/** Types generated for queries found in "src/sql/sm_example.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

/** 'EvmMidnightTableExists' parameters type */
export type IEvmMidnightTableExistsParams = void;

/** 'EvmMidnightTableExists' return type */
export interface IEvmMidnightTableExistsResult {
  exists: boolean | null;
}

/** 'EvmMidnightTableExists' query type */
export interface IEvmMidnightTableExistsQuery {
  params: IEvmMidnightTableExistsParams;
  result: IEvmMidnightTableExistsResult;
}

const evmMidnightTableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables \n    WHERE  table_schema = 'public'\n    AND    table_name   = 'evm_midnight'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables 
 *     WHERE  table_schema = 'public'
 *     AND    table_name   = 'evm_midnight'
 * )
 * ```
 */
export const evmMidnightTableExists = new PreparedQuery<IEvmMidnightTableExistsParams,IEvmMidnightTableExistsResult>(evmMidnightTableExistsIR);


/** 'InsertEvmMidnight' parameters type */
export interface IInsertEvmMidnightParams {
  amount: NumberOrString;
  block_height: number;
  chain: string;
  contract_address: string;
  owner: string;
  token_id: string;
}

/** 'InsertEvmMidnight' return type */
export type IInsertEvmMidnightResult = void;

/** 'InsertEvmMidnight' query type */
export interface IInsertEvmMidnightQuery {
  params: IInsertEvmMidnightParams;
  result: IInsertEvmMidnightResult;
}

const insertEvmMidnightIR: any = {"usedParamSet":{"contract_address":true,"chain":true,"token_id":true,"amount":true,"owner":true,"block_height":true},"params":[{"name":"contract_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":126}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":129,"b":135}]},{"name":"token_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":138,"b":147}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":150,"b":157}]},{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":160,"b":166}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":182}]}],"statement":"INSERT INTO evm_midnight \n    (contract_address, chain, token_id, amount, owner, block_height) \nVALUES \n    (:contract_address!, :chain!, :token_id!, :amount!, :owner!, :block_height!) \nON CONFLICT (contract_address, token_id, owner) \nDO UPDATE SET \n    chain = EXCLUDED.chain,\n    block_height = EXCLUDED.block_height,\n    amount = EXCLUDED.amount"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO evm_midnight 
 *     (contract_address, chain, token_id, amount, owner, block_height) 
 * VALUES 
 *     (:contract_address!, :chain!, :token_id!, :amount!, :owner!, :block_height!) 
 * ON CONFLICT (contract_address, token_id, owner) 
 * DO UPDATE SET 
 *     chain = EXCLUDED.chain,
 *     block_height = EXCLUDED.block_height,
 *     amount = EXCLUDED.amount
 * ```
 */
export const insertEvmMidnight = new PreparedQuery<IInsertEvmMidnightParams,IInsertEvmMidnightResult>(insertEvmMidnightIR);


/** 'GetEvmMidnight' parameters type */
export type IGetEvmMidnightParams = void;

/** 'GetEvmMidnight' return type */
export interface IGetEvmMidnightResult {
  amount: string;
  block_height: number;
  chain: string;
  contract_address: string;
  id: number;
  owner: string;
  token_id: string;
}

/** 'GetEvmMidnight' query type */
export interface IGetEvmMidnightQuery {
  params: IGetEvmMidnightParams;
  result: IGetEvmMidnightResult;
}

const getEvmMidnightIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM evm_midnight"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM evm_midnight
 * ```
 */
export const getEvmMidnight = new PreparedQuery<IGetEvmMidnightParams,IGetEvmMidnightResult>(getEvmMidnightIR);


/** 'GetEvmMidnightByTokenId' parameters type */
export interface IGetEvmMidnightByTokenIdParams {
  contract_address: string;
  token_id: string;
}

/** 'GetEvmMidnightByTokenId' return type */
export interface IGetEvmMidnightByTokenIdResult {
  amount: string;
  block_height: number;
  chain: string;
  contract_address: string;
  id: number;
  owner: string;
  token_id: string;
}

/** 'GetEvmMidnightByTokenId' query type */
export interface IGetEvmMidnightByTokenIdQuery {
  params: IGetEvmMidnightByTokenIdParams;
  result: IGetEvmMidnightByTokenIdResult;
}

const getEvmMidnightByTokenIdIR: any = {"usedParamSet":{"token_id":true,"contract_address":true},"params":[{"name":"token_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":58,"b":67}]},{"name":"contract_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":105,"b":122}]}],"statement":"SELECT * FROM evm_midnight \nWHERE evm_midnight.token_id = :token_id!\nAND evm_midnight.contract_address = :contract_address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM evm_midnight 
 * WHERE evm_midnight.token_id = :token_id!
 * AND evm_midnight.contract_address = :contract_address!
 * ```
 */
export const getEvmMidnightByTokenId = new PreparedQuery<IGetEvmMidnightByTokenIdParams,IGetEvmMidnightByTokenIdResult>(getEvmMidnightByTokenIdIR);


/** 'GetEvmMidnightByOwner' parameters type */
export interface IGetEvmMidnightByOwnerParams {
  contract_address: string;
  owner: string;
}

/** 'GetEvmMidnightByOwner' return type */
export interface IGetEvmMidnightByOwnerResult {
  amount: string;
  block_height: number;
  chain: string;
  contract_address: string;
  id: number;
  owner: string;
  token_id: string;
}

/** 'GetEvmMidnightByOwner' query type */
export interface IGetEvmMidnightByOwnerQuery {
  params: IGetEvmMidnightByOwnerParams;
  result: IGetEvmMidnightByOwnerResult;
}

const getEvmMidnightByOwnerIR: any = {"usedParamSet":{"owner":true,"contract_address":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":61}]},{"name":"contract_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":99,"b":116}]}],"statement":"SELECT * FROM evm_midnight \nWHERE evm_midnight.owner = :owner!\nAND evm_midnight.contract_address = :contract_address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM evm_midnight 
 * WHERE evm_midnight.owner = :owner!
 * AND evm_midnight.contract_address = :contract_address!
 * ```
 */
export const getEvmMidnightByOwner = new PreparedQuery<IGetEvmMidnightByOwnerParams,IGetEvmMidnightByOwnerResult>(getEvmMidnightByOwnerIR);


