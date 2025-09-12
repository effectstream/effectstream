/** Types generated for queries found in "src/sql/accounts.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'NewAddress' parameters type */
export interface INewAddressParams {
  address: string;
  address_type?: number | null | void;
}

/** 'NewAddress' return type */
export type INewAddressResult = void;

/** 'NewAddress' query type */
export interface INewAddressQuery {
  params: INewAddressParams;
  result: INewAddressResult;
}

const newAddressIR: any = {"usedParamSet":{"address":true,"address_type":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":69}]},{"name":"address_type","required":false,"transform":{"type":"scalar"},"locs":[{"a":72,"b":84}]}],"statement":"INSERT INTO paima.addresses (address, address_type) \nVALUES (:address!, :address_type)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima.addresses (address, address_type) 
 * VALUES (:address!, :address_type)
 * ```
 */
export const newAddress = new PreparedQuery<INewAddressParams,INewAddressResult>(newAddressIR);


/** 'NewAddressWithId' parameters type */
export interface INewAddressWithIdParams {
  account_id: number;
  address: string;
  address_type: number;
}

/** 'NewAddressWithId' return type */
export type INewAddressWithIdResult = void;

/** 'NewAddressWithId' query type */
export interface INewAddressWithIdQuery {
  params: INewAddressWithIdParams;
  result: INewAddressWithIdResult;
}

const newAddressWithIdIR: any = {"usedParamSet":{"address":true,"address_type":true,"account_id":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":81}]},{"name":"address_type","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":97}]},{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":111}]}],"statement":"INSERT INTO paima.addresses (address, address_type, account_id) \nVALUES (:address!, :address_type!, :account_id!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima.addresses (address, address_type, account_id) 
 * VALUES (:address!, :address_type!, :account_id!)
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

const newAccountIR: any = {"usedParamSet":{"primary_address":true},"params":[{"name":"primary_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":54,"b":69}]}],"statement":"INSERT INTO paima.accounts (primary_address) \nVALUES (:primary_address)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO paima.accounts (primary_address) 
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

const updateAddressAccountIR: any = {"usedParamSet":{"account_id":true,"address":true},"params":[{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":51}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":69,"b":77}]}],"statement":"UPDATE paima.addresses\nSET account_id = :account_id!\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE paima.addresses
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

const removeAddressAccountIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":69}]}],"statement":"UPDATE paima.addresses\nSET account_id = NULL\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE paima.addresses
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

const updatePrimaryAddressIR: any = {"usedParamSet":{"primary_address":true,"account_id":true},"params":[{"name":"primary_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":44,"b":59}]},{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":83}]}],"statement":"UPDATE paima.accounts\nSET primary_address = :primary_address\nWHERE id = :account_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE paima.accounts
 * SET primary_address = :primary_address
 * WHERE id = :account_id!
 * ```
 */
export const updatePrimaryAddress = new PreparedQuery<IUpdatePrimaryAddressParams,IUpdatePrimaryAddressResult>(updatePrimaryAddressIR);


/** 'GetAddressByAddress' parameters type */
export interface IGetAddressByAddressParams {
  address: string;
}

/** 'GetAddressByAddress' return type */
export interface IGetAddressByAddressResult {
  account_id: number | null;
  address: string;
  address_type: number;
}

/** 'GetAddressByAddress' query type */
export interface IGetAddressByAddressQuery {
  params: IGetAddressByAddressParams;
  result: IGetAddressByAddressResult;
}

const getAddressByAddressIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":54}]}],"statement":"SELECT * FROM paima.addresses\nWHERE address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.addresses
 * WHERE address = :address!
 * ```
 */
export const getAddressByAddress = new PreparedQuery<IGetAddressByAddressParams,IGetAddressByAddressResult>(getAddressByAddressIR);


/** 'GetAddressByAccountId' parameters type */
export interface IGetAddressByAccountIdParams {
  account_id: number;
}

/** 'GetAddressByAccountId' return type */
export interface IGetAddressByAccountIdResult {
  account_id: number | null;
  address: string;
  address_type: number;
}

/** 'GetAddressByAccountId' query type */
export interface IGetAddressByAccountIdQuery {
  params: IGetAddressByAccountIdParams;
  result: IGetAddressByAccountIdResult;
}

const getAddressByAccountIdIR: any = {"usedParamSet":{"account_id":true},"params":[{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":49,"b":60}]}],"statement":"SELECT * FROM paima.addresses\nWHERE account_id = :account_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM paima.addresses
 * WHERE account_id = :account_id!
 * ```
 */
export const getAddressByAccountId = new PreparedQuery<IGetAddressByAccountIdParams,IGetAddressByAccountIdResult>(getAddressByAccountIdIR);


/** 'GetAccountById' parameters type */
export interface IGetAccountByIdParams {
  account_id: number;
}

/** 'GetAccountById' return type */
export interface IGetAccountByIdResult {
  account_id: number | null;
  address: string;
  address_id: number;
  address_type: number;
  primary_address: string | null;
}

/** 'GetAccountById' query type */
export interface IGetAccountByIdQuery {
  params: IGetAccountByIdParams;
  result: IGetAccountByIdResult;
}

const getAccountByIdIR: any = {"usedParamSet":{"account_id":true},"params":[{"name":"account_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":193,"b":204}]}],"statement":"SELECT account_id, address, address_type, primary_address, id as address_id FROM paima.accounts\nLEFT JOIN paima.addresses ON paima.accounts.primary_address = paima.addresses.address\nWHERE id = :account_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT account_id, address, address_type, primary_address, id as address_id FROM paima.accounts
 * LEFT JOIN paima.addresses ON paima.accounts.primary_address = paima.addresses.address
 * WHERE id = :account_id!
 * ```
 */
export const getAccountById = new PreparedQuery<IGetAccountByIdParams,IGetAccountByIdResult>(getAccountByIdIR);


/** 'GetAllAddresses' parameters type */
export interface IGetAllAddressesParams {
  after_account_id?: number | null | void;
  after_address?: string | null | void;
  limit?: number | null | void;
}

/** 'GetAllAddresses' return type */
export interface IGetAllAddressesResult {
  account_id: number | null;
  address: string;
  address_type: number;
  primary_address: string | null;
}

/** 'GetAllAddresses' query type */
export interface IGetAllAddressesQuery {
  params: IGetAllAddressesParams;
  result: IGetAllAddressesResult;
}

const getAllAddressesIR: any = {"usedParamSet":{"after_account_id":true,"after_address":true,"limit":true},"params":[{"name":"after_account_id","required":false,"transform":{"type":"scalar"},"locs":[{"a":374,"b":390},{"a":729,"b":745},{"a":790,"b":806},{"a":1116,"b":1132},{"a":1176,"b":1192}]},{"name":"after_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":409,"b":422},{"a":1250,"b":1263}]},{"name":"limit","required":false,"transform":{"type":"scalar"},"locs":[{"a":1361,"b":1366}]}],"statement":"SELECT \n    addresses.address as \"address\", \n    addresses.address_type as \"address_type\",\n    addresses.account_id as \"account_id\",\n    accounts.primary_address as \"primary_address\"\nFROM paima.addresses\nLEFT JOIN paima.accounts ON paima.accounts.primary_address = paima.addresses.address\nWHERE\n    -- This clause is for the first page fetch when no cursor is provided\n    (:after_account_id::INT IS NULL AND :after_address::TEXT IS NULL)\n    OR\n    (\n        -- Case 1: The current row's account_id is \"greater\" than the cursor's.\n        -- This handles two sub-cases:\n        -- a) regular greater-than (e.g., 5 > 4)\n        -- b) current is NULL but cursor is NOT NULL (since NULLS sort LAST)\n        (addresses.account_id > :after_account_id::INT) OR (addresses.account_id IS NULL AND :after_account_id::INT IS NOT NULL)\n    )\n    OR\n    (\n        -- Case 2: The account_ids are equivalent, so we compare by the tie-breaker (address).\n        -- This handles two sub-cases for equivalence:\n        -- a) they are equal and not null (e.g., 5 = 5)\n        -- b) they are both null\n        (addresses.account_id = :after_account_id::INT OR (addresses.account_id IS NULL AND :after_account_id::INT IS NULL))\n        AND\n        (addresses.address > :after_address::TEXT)\n    )\nORDER BY addresses.account_id ASC NULLS LAST, addresses.address ASC\nLIMIT COALESCE(:limit, 1000)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 
 *     addresses.address as "address", 
 *     addresses.address_type as "address_type",
 *     addresses.account_id as "account_id",
 *     accounts.primary_address as "primary_address"
 * FROM paima.addresses
 * LEFT JOIN paima.accounts ON paima.accounts.primary_address = paima.addresses.address
 * WHERE
 *     -- This clause is for the first page fetch when no cursor is provided
 *     (:after_account_id::INT IS NULL AND :after_address::TEXT IS NULL)
 *     OR
 *     (
 *         -- Case 1: The current row's account_id is "greater" than the cursor's.
 *         -- This handles two sub-cases:
 *         -- a) regular greater-than (e.g., 5 > 4)
 *         -- b) current is NULL but cursor is NOT NULL (since NULLS sort LAST)
 *         (addresses.account_id > :after_account_id::INT) OR (addresses.account_id IS NULL AND :after_account_id::INT IS NOT NULL)
 *     )
 *     OR
 *     (
 *         -- Case 2: The account_ids are equivalent, so we compare by the tie-breaker (address).
 *         -- This handles two sub-cases for equivalence:
 *         -- a) they are equal and not null (e.g., 5 = 5)
 *         -- b) they are both null
 *         (addresses.account_id = :after_account_id::INT OR (addresses.account_id IS NULL AND :after_account_id::INT IS NULL))
 *         AND
 *         (addresses.address > :after_address::TEXT)
 *     )
 * ORDER BY addresses.account_id ASC NULLS LAST, addresses.address ASC
 * LIMIT COALESCE(:limit, 1000)
 * ```
 */
export const getAllAddresses = new PreparedQuery<IGetAllAddressesParams,IGetAllAddressesResult>(getAllAddressesIR);


/** 'GetAllAddressesCount' parameters type */
export type IGetAllAddressesCountParams = void;

/** 'GetAllAddressesCount' return type */
export interface IGetAllAddressesCountResult {
  total: string | null;
}

/** 'GetAllAddressesCount' query type */
export interface IGetAllAddressesCountQuery {
  params: IGetAllAddressesCountParams;
  result: IGetAllAddressesCountResult;
}

const getAllAddressesCountIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT COUNT(*) as total\nFROM paima.addresses"};

/**
 * Query generated from SQL:
 * ```
 * SELECT COUNT(*) as total
 * FROM paima.addresses
 * ```
 */
export const getAllAddressesCount = new PreparedQuery<IGetAllAddressesCountParams,IGetAllAddressesCountResult>(getAllAddressesCountIR);


