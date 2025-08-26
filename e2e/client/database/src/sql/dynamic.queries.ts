/** Types generated for queries found in "src/sql/dynamic.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetErc20BalanceA' parameters type */
export type IGetErc20BalanceAParams = void;

/** 'GetErc20BalanceA' return type */
export interface IGetErc20BalanceAResult {
  address: string | null;
  balance: string | null;
  primitive_name: string | null;
}

/** 'GetErc20BalanceA' query type */
export interface IGetErc20BalanceAQuery {
  params: IGetErc20BalanceAParams;
  result: IGetErc20BalanceAResult;
}

const getErc20BalanceAIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT primitive_name, address, balance\nFROM primitives.erc20_balances_view_aribitrum_token"};

/**
 * Query generated from SQL:
 * ```
 * SELECT primitive_name, address, balance
 * FROM primitives.erc20_balances_view_aribitrum_token
 * ```
 */
export const getErc20BalanceA = new PreparedQuery<IGetErc20BalanceAParams,IGetErc20BalanceAResult>(getErc20BalanceAIR);


/** 'GetErc20BalanceB' parameters type */
export type IGetErc20BalanceBParams = void;

/** 'GetErc20BalanceB' return type */
export interface IGetErc20BalanceBResult {
  address: string | null;
  balance: string | null;
  primitive_name: string | null;
}

/** 'GetErc20BalanceB' query type */
export interface IGetErc20BalanceBQuery {
  params: IGetErc20BalanceBParams;
  result: IGetErc20BalanceBResult;
}

const getErc20BalanceBIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT primitive_name, address, balance\nFROM primitives.erc20_balances_view_eth_l1_erc20"};

/**
 * Query generated from SQL:
 * ```
 * SELECT primitive_name, address, balance
 * FROM primitives.erc20_balances_view_eth_l1_erc20
 * ```
 */
export const getErc20BalanceB = new PreparedQuery<IGetErc20BalanceBParams,IGetErc20BalanceBResult>(getErc20BalanceBIR);


/** 'GetErc721OwnershipA' parameters type */
export type IGetErc721OwnershipAParams = void;

/** 'GetErc721OwnershipA' return type */
export interface IGetErc721OwnershipAResult {
  current_owner: string | null;
  primitive_name: string | null;
  token_id: string | null;
}

/** 'GetErc721OwnershipA' query type */
export interface IGetErc721OwnershipAQuery {
  params: IGetErc721OwnershipAParams;
  result: IGetErc721OwnershipAResult;
}

const getErc721OwnershipAIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT primitive_name, token_id, current_owner\nFROM primitives.erc721_ownership_view_arbitrum_erc721"};

/**
 * Query generated from SQL:
 * ```
 * SELECT primitive_name, token_id, current_owner
 * FROM primitives.erc721_ownership_view_arbitrum_erc721
 * ```
 */
export const getErc721OwnershipA = new PreparedQuery<IGetErc721OwnershipAParams,IGetErc721OwnershipAResult>(getErc721OwnershipAIR);


/** 'GetErc721OwnershipB' parameters type */
export type IGetErc721OwnershipBParams = void;

/** 'GetErc721OwnershipB' return type */
export interface IGetErc721OwnershipBResult {
  current_owner: string | null;
  primitive_name: string | null;
  token_id: string | null;
}

/** 'GetErc721OwnershipB' query type */
export interface IGetErc721OwnershipBQuery {
  params: IGetErc721OwnershipBParams;
  result: IGetErc721OwnershipBResult;
}

const getErc721OwnershipBIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT primitive_name, token_id, current_owner\nFROM primitives.erc721_ownership_view_l1_erc721_token"};

/**
 * Query generated from SQL:
 * ```
 * SELECT primitive_name, token_id, current_owner
 * FROM primitives.erc721_ownership_view_l1_erc721_token
 * ```
 */
export const getErc721OwnershipB = new PreparedQuery<IGetErc721OwnershipBParams,IGetErc721OwnershipBResult>(getErc721OwnershipBIR);


