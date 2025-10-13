/** Types generated for queries found in "src/sql/sm_example.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

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
  block_height: number;
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

const insertEvmMidnightIR: any = {"usedParamSet":{"contract_address":true,"token_id":true,"owner":true,"block_height":true},"params":[{"name":"contract_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":94,"b":111}]},{"name":"token_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":114,"b":123}]},{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":126,"b":132}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":148}]}],"statement":"INSERT INTO evm_midnight \n    (contract_address, token_id, owner, block_height) \nVALUES \n    (:contract_address!, :token_id!, :owner!, :block_height!) \nON CONFLICT (contract_address, token_id) \nDO UPDATE SET \n    owner = EXCLUDED.owner,\n    block_height = EXCLUDED.block_height"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO evm_midnight 
 *     (contract_address, token_id, owner, block_height) 
 * VALUES 
 *     (:contract_address!, :token_id!, :owner!, :block_height!) 
 * ON CONFLICT (contract_address, token_id) 
 * DO UPDATE SET 
 *     owner = EXCLUDED.owner,
 *     block_height = EXCLUDED.block_height
 * ```
 */
export const insertEvmMidnight = new PreparedQuery<IInsertEvmMidnightParams,IInsertEvmMidnightResult>(insertEvmMidnightIR);


/** 'InsertEvmMidnightProperty' parameters type */
export interface IInsertEvmMidnightPropertyParams {
  block_height: number;
  contract_address: string;
  property_name: string;
  token_id: string;
  value: string;
}

/** 'InsertEvmMidnightProperty' return type */
export type IInsertEvmMidnightPropertyResult = void;

/** 'InsertEvmMidnightProperty' query type */
export interface IInsertEvmMidnightPropertyQuery {
  params: IInsertEvmMidnightPropertyParams;
  result: IInsertEvmMidnightPropertyResult;
}

const insertEvmMidnightPropertyIR: any = {"usedParamSet":{"contract_address":true,"token_id":true,"property_name":true,"value":true,"block_height":true},"params":[{"name":"contract_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":120,"b":137}]},{"name":"token_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":149}]},{"name":"property_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":152,"b":166}]},{"name":"value","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":175}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":178,"b":191}]}],"statement":"INSERT INTO evm_midnight_properties \n    (contract_address, token_id, property_name, value, block_height) \nVALUES \n    (:contract_address!, :token_id!, :property_name!, :value!, :block_height!) \nON CONFLICT (contract_address, token_id, property_name) \nDO UPDATE SET \n    value = EXCLUDED.value,\n    block_height = EXCLUDED.block_height"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO evm_midnight_properties 
 *     (contract_address, token_id, property_name, value, block_height) 
 * VALUES 
 *     (:contract_address!, :token_id!, :property_name!, :value!, :block_height!) 
 * ON CONFLICT (contract_address, token_id, property_name) 
 * DO UPDATE SET 
 *     value = EXCLUDED.value,
 *     block_height = EXCLUDED.block_height
 * ```
 */
export const insertEvmMidnightProperty = new PreparedQuery<IInsertEvmMidnightPropertyParams,IInsertEvmMidnightPropertyResult>(insertEvmMidnightPropertyIR);


/** 'GetEvmMidnightByTokenId' parameters type */
export interface IGetEvmMidnightByTokenIdParams {
  contract_address: string;
  token_id: string;
}

/** 'GetEvmMidnightByTokenId' return type */
export interface IGetEvmMidnightByTokenIdResult {
  block_height: number;
  contract_address: string;
  id: number;
  owner: string | null;
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


/** 'GetEvmMidnight' parameters type */
export type IGetEvmMidnightParams = void;

/** 'GetEvmMidnight' return type */
export interface IGetEvmMidnightResult {
  block_height: number;
  owner: string | null;
  property_block_height: number;
  property_name: string;
  token_id: string;
  value: string;
}

/** 'GetEvmMidnight' query type */
export interface IGetEvmMidnightQuery {
  params: IGetEvmMidnightParams;
  result: IGetEvmMidnightResult;
}

const getEvmMidnightIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT \nevm_midnight.token_id, \nevm_midnight.owner, \nevm_midnight.block_height as block_height,\nevm_midnight_properties.property_name, \nevm_midnight_properties.value,\nevm_midnight_properties.block_height as property_block_height\nFROM evm_midnight \nLEFT JOIN evm_midnight_properties ON evm_midnight.token_id = evm_midnight_properties.token_id\nORDER BY evm_midnight.token_id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 * evm_midnight.token_id, 
 * evm_midnight.owner, 
 * evm_midnight.block_height as block_height,
 * evm_midnight_properties.property_name, 
 * evm_midnight_properties.value,
 * evm_midnight_properties.block_height as property_block_height
 * FROM evm_midnight 
 * LEFT JOIN evm_midnight_properties ON evm_midnight.token_id = evm_midnight_properties.token_id
 * ORDER BY evm_midnight.token_id DESC
 * ```
 */
export const getEvmMidnight = new PreparedQuery<IGetEvmMidnightParams,IGetEvmMidnightResult>(getEvmMidnightIR);


