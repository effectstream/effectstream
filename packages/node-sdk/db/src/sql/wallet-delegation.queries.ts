/** Types generated for queries found in "src/sql/wallet-delegation.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'NewAddress' parameters type */
export interface INewAddressParams {
  address: string;
}

/** 'NewAddress' return type */
export type INewAddressResult = void;

/** 'NewAddress' query type */
export interface INewAddressQuery {
  params: INewAddressParams;
  result: INewAddressResult;
}

const newAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":49}]}],"statement":"INSERT INTO addresses (address) \nVALUES (:address!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO addresses (address) 
 * VALUES (:address!)
 * ```
 */
export const newAddress = new PreparedQuery<INewAddressParams,INewAddressResult>(newAddressIR);


/** 'NewAddressWithId' parameters type */
export interface INewAddressWithIdParams {
  account_id: number;
  address: string;
}

/** 'NewAddressWithId' return type */
export type INewAddressWithIdResult = void;

/** 'NewAddressWithId' query type */
export interface INewAddressWithIdQuery {
  params: INewAddressWithIdParams;
  result: INewAddressWithIdResult;
}

const newAddressWithIdIR: any = {"usedParamSet":{"address":true,"account_id":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":53,"b":61}]},{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":75}]}],"statement":"INSERT INTO addresses (address, account_id) \nVALUES (:address!, :account_id!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO addresses (address, account_id) 
 * VALUES (:address!, :account_id!)
 * ```
 */
export const newAddressWithId = new PreparedQuery<INewAddressWithIdParams,INewAddressWithIdResult>(newAddressWithIdIR);


/** 'NewAccount' parameters type */
export interface INewAccountParams {
  primary_address?: string | null | void;
}

/** 'NewAccount' return type */
export interface INewAccountResult {
  id: number;
}

/** 'NewAccount' query type */
export interface INewAccountQuery {
  params: INewAccountParams;
  result: INewAccountResult;
}

const newAccountIR: any = {"usedParamSet":{"primary_address":true},"params":[{"name":"primary_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":48,"b":63}]}],"statement":"INSERT INTO accounts (primary_address) \nVALUES (:primary_address)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO accounts (primary_address) 
 * VALUES (:primary_address)
 * RETURNING id
 * ```
 */
export const newAccount = new PreparedQuery<INewAccountParams,INewAccountResult>(newAccountIR);


/** 'UpdateAddressAccount' parameters type */
export interface IUpdateAddressAccountParams {
  account_id: number;
  address: string;
}

/** 'UpdateAddressAccount' return type */
export type IUpdateAddressAccountResult = void;

/** 'UpdateAddressAccount' query type */
export interface IUpdateAddressAccountQuery {
  params: IUpdateAddressAccountParams;
  result: IUpdateAddressAccountResult;
}

const updateAddressAccountIR: any = {"usedParamSet":{"account_id":true,"address":true},"params":[{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":45}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":63,"b":71}]}],"statement":"UPDATE addresses\nSET account_id = :account_id!\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE addresses
 * SET account_id = :account_id!
 * WHERE address = :address!
 * ```
 */
export const updateAddressAccount = new PreparedQuery<IUpdateAddressAccountParams,IUpdateAddressAccountResult>(updateAddressAccountIR);


/** 'RemoveAddressAccount' parameters type */
export interface IRemoveAddressAccountParams {
  address: string;
}

/** 'RemoveAddressAccount' return type */
export type IRemoveAddressAccountResult = void;

/** 'RemoveAddressAccount' query type */
export interface IRemoveAddressAccountQuery {
  params: IRemoveAddressAccountParams;
  result: IRemoveAddressAccountResult;
}

const removeAddressAccountIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":63}]}],"statement":"UPDATE addresses\nSET account_id = NULL\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE addresses
 * SET account_id = NULL
 * WHERE address = :address!
 * ```
 */
export const removeAddressAccount = new PreparedQuery<IRemoveAddressAccountParams,IRemoveAddressAccountResult>(removeAddressAccountIR);


/** 'UpdatePrimaryAddress' parameters type */
export interface IUpdatePrimaryAddressParams {
  account_id: number;
  primary_address?: string | null | void;
}

/** 'UpdatePrimaryAddress' return type */
export type IUpdatePrimaryAddressResult = void;

/** 'UpdatePrimaryAddress' query type */
export interface IUpdatePrimaryAddressQuery {
  params: IUpdatePrimaryAddressParams;
  result: IUpdatePrimaryAddressResult;
}

const updatePrimaryAddressIR: any = {"usedParamSet":{"primary_address":true,"account_id":true},"params":[{"name":"primary_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":38,"b":53}]},{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":66,"b":77}]}],"statement":"UPDATE accounts\nSET primary_address = :primary_address\nWHERE id = :account_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE accounts
 * SET primary_address = :primary_address
 * WHERE id = :account_id!
 * ```
 */
export const updatePrimaryAddress = new PreparedQuery<IUpdatePrimaryAddressParams,IUpdatePrimaryAddressResult>(updatePrimaryAddressIR);


/** 'GetAddressWithAddress' parameters type */
export interface IGetAddressWithAddressParams {
  address: string;
}

/** 'GetAddressWithAddress' return type */
export interface IGetAddressWithAddressResult {
  account_id: number | null;
  address: string;
}

/** 'GetAddressWithAddress' query type */
export interface IGetAddressWithAddressQuery {
  params: IGetAddressWithAddressParams;
  result: IGetAddressWithAddressResult;
}

const getAddressWithAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":48}]}],"statement":"SELECT * FROM addresses\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM addresses
 * WHERE address = :address!
 * ```
 */
export const getAddressWithAddress = new PreparedQuery<IGetAddressWithAddressParams,IGetAddressWithAddressResult>(getAddressWithAddressIR);


/** 'GetAccountById' parameters type */
export interface IGetAccountByIdParams {
  account_id: number;
}

/** 'GetAccountById' return type */
export interface IGetAccountByIdResult {
  id: number;
  primary_address: string | null;
}

/** 'GetAccountById' query type */
export interface IGetAccountByIdQuery {
  params: IGetAccountByIdParams;
  result: IGetAccountByIdResult;
}

const getAccountByIdIR: any = {"usedParamSet":{"account_id":true},"params":[{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":45}]}],"statement":"SELECT * FROM accounts\nWHERE id = :account_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM accounts
 * WHERE id = :account_id!
 * ```
 */
export const getAccountById = new PreparedQuery<IGetAccountByIdParams,IGetAccountByIdResult>(getAccountByIdIR);


/** 'GetAllAddresses' parameters type */
export type IGetAllAddressesParams = void;

/** 'GetAllAddresses' return type */
export interface IGetAllAddressesResult {
  address: string;
  primary_address: string | null;
}

/** 'GetAllAddresses' query type */
export interface IGetAllAddressesQuery {
  params: IGetAllAddressesParams;
  result: IGetAllAddressesResult;
}

const getAllAddressesIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT \n    addresses.address as \"address\", \n    accounts.primary_address as \"primary_address\" \nFROM addresses\nLEFT JOIN accounts ON accounts.primary_address = addresses.address"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 *     addresses.address as "address", 
 *     accounts.primary_address as "primary_address" 
 * FROM addresses
 * LEFT JOIN accounts ON accounts.primary_address = addresses.address
 * ```
 */
export const getAllAddresses = new PreparedQuery<IGetAllAddressesParams,IGetAllAddressesResult>(getAllAddressesIR);


