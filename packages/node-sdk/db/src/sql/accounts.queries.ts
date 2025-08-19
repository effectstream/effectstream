/** Types generated for queries found in "src/sql/accounts.sql" */
import { PreparedQuery } from "@pgtyped/runtime";

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

const newAddressIR: any = {
  "usedParamSet": { "address": true },
  "params": [{
    "name": "address",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 41, "b": 49 }],
  }],
  "statement": "INSERT INTO addresses (address) \nVALUES (:address!)",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO addresses (address)
 * VALUES (:address!)
 * ```
 */
export const newAddress = new PreparedQuery<
  INewAddressParams,
  INewAddressResult
>(newAddressIR);

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

const newAddressWithIdIR: any = {
  "usedParamSet": { "address": true, "account_id": true },
  "params": [{
    "name": "address",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 53, "b": 61 }],
  }, {
    "name": "account_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 64, "b": 75 }],
  }],
  "statement":
    "INSERT INTO addresses (address, account_id) \nVALUES (:address!, :account_id!)",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO addresses (address, account_id)
 * VALUES (:address!, :account_id!)
 * ```
 */
export const newAddressWithId = new PreparedQuery<
  INewAddressWithIdParams,
  INewAddressWithIdResult
>(newAddressWithIdIR);

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

const newAccountIR: any = {
  "usedParamSet": { "primary_address": true },
  "params": [{
    "name": "primary_address",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 48, "b": 63 }],
  }],
  "statement":
    "INSERT INTO accounts (primary_address) \nVALUES (:primary_address)\nRETURNING id",
};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO accounts (primary_address)
 * VALUES (:primary_address)
 * RETURNING id
 * ```
 */
export const newAccount = new PreparedQuery<
  INewAccountParams,
  INewAccountResult
>(newAccountIR);

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

const updateAddressAccountIR: any = {
  "usedParamSet": { "account_id": true, "address": true },
  "params": [{
    "name": "account_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 34, "b": 45 }],
  }, {
    "name": "address",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 63, "b": 71 }],
  }],
  "statement":
    "UPDATE addresses\nSET account_id = :account_id!\nWHERE address = :address!",
};

/**
 * Query generated from SQL:
 * ```
 * UPDATE addresses
 * SET account_id = :account_id!
 * WHERE address = :address!
 * ```
 */
export const updateAddressAccount = new PreparedQuery<
  IUpdateAddressAccountParams,
  IUpdateAddressAccountResult
>(updateAddressAccountIR);

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

const removeAddressAccountIR: any = {
  "usedParamSet": { "address": true },
  "params": [{
    "name": "address",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 55, "b": 63 }],
  }],
  "statement":
    "UPDATE addresses\nSET account_id = NULL\nWHERE address = :address!",
};

/**
 * Query generated from SQL:
 * ```
 * UPDATE addresses
 * SET account_id = NULL
 * WHERE address = :address!
 * ```
 */
export const removeAddressAccount = new PreparedQuery<
  IRemoveAddressAccountParams,
  IRemoveAddressAccountResult
>(removeAddressAccountIR);

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

const updatePrimaryAddressIR: any = {
  "usedParamSet": { "primary_address": true, "account_id": true },
  "params": [{
    "name": "primary_address",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 38, "b": 53 }],
  }, {
    "name": "account_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 66, "b": 77 }],
  }],
  "statement":
    "UPDATE accounts\nSET primary_address = :primary_address\nWHERE id = :account_id!",
};

/**
 * Query generated from SQL:
 * ```
 * UPDATE accounts
 * SET primary_address = :primary_address
 * WHERE id = :account_id!
 * ```
 */
export const updatePrimaryAddress = new PreparedQuery<
  IUpdatePrimaryAddressParams,
  IUpdatePrimaryAddressResult
>(updatePrimaryAddressIR);

/** 'GetAddressByAddress' parameters type */
export interface IGetAddressByAddressParams {
  address: string;
}

/** 'GetAddressByAddress' return type */
export interface IGetAddressByAddressResult {
  account_id: number | null;
  address: string;
}

/** 'GetAddressByAddress' query type */
export interface IGetAddressByAddressQuery {
  params: IGetAddressByAddressParams;
  result: IGetAddressByAddressResult;
}

const getAddressByAddressIR: any = {
  "usedParamSet": { "address": true },
  "params": [{
    "name": "address",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 40, "b": 48 }],
  }],
  "statement": "SELECT * FROM addresses\nWHERE address = :address!",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM addresses
 * WHERE address = :address!
 * ```
 */
export const getAddressByAddress = new PreparedQuery<
  IGetAddressByAddressParams,
  IGetAddressByAddressResult
>(getAddressByAddressIR);

/** 'GetAddressByAccountId' parameters type */
export interface IGetAddressByAccountIdParams {
  account_id: number;
}

/** 'GetAddressByAccountId' return type */
export interface IGetAddressByAccountIdResult {
  account_id: number | null;
  address: string;
}

/** 'GetAddressByAccountId' query type */
export interface IGetAddressByAccountIdQuery {
  params: IGetAddressByAccountIdParams;
  result: IGetAddressByAccountIdResult;
}

const getAddressByAccountIdIR: any = {
  "usedParamSet": { "account_id": true },
  "params": [{
    "name": "account_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 43, "b": 54 }],
  }],
  "statement": "SELECT * FROM addresses\nWHERE account_id = :account_id!",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM addresses
 * WHERE account_id = :account_id!
 * ```
 */
export const getAddressByAccountId = new PreparedQuery<
  IGetAddressByAccountIdParams,
  IGetAddressByAccountIdResult
>(getAddressByAccountIdIR);

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

const getAccountByIdIR: any = {
  "usedParamSet": { "account_id": true },
  "params": [{
    "name": "account_id",
    "required": true,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 34, "b": 45 }],
  }],
  "statement": "SELECT * FROM accounts\nWHERE id = :account_id!",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM accounts
 * WHERE id = :account_id!
 * ```
 */
export const getAccountById = new PreparedQuery<
  IGetAccountByIdParams,
  IGetAccountByIdResult
>(getAccountByIdIR);

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
  primary_address: string | null;
}

/** 'GetAllAddresses' query type */
export interface IGetAllAddressesQuery {
  params: IGetAllAddressesParams;
  result: IGetAllAddressesResult;
}

const getAllAddressesIR: any = {
  "usedParamSet": {
    "after_account_id": true,
    "after_address": true,
    "limit": true,
  },
  "params": [{
    "name": "after_account_id",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [
      { "a": 304, "b": 320 },
      { "a": 659, "b": 675 },
      { "a": 720, "b": 736 },
      { "a": 1046, "b": 1062 },
      { "a": 1106, "b": 1122 },
    ],
  }, {
    "name": "after_address",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 339, "b": 352 }, { "a": 1180, "b": 1193 }],
  }, {
    "name": "limit",
    "required": false,
    "transform": { "type": "scalar" },
    "locs": [{ "a": 1291, "b": 1296 }],
  }],
  "statement":
    'SELECT \n    addresses.address as "address", \n    addresses.account_id as "account_id",\n    accounts.primary_address as "primary_address"\nFROM addresses\nLEFT JOIN accounts ON accounts.primary_address = addresses.address\nWHERE\n    -- This clause is for the first page fetch when no cursor is provided\n    (:after_account_id::INT IS NULL AND :after_address::TEXT IS NULL)\n    OR\n    (\n        -- Case 1: The current row\'s account_id is "greater" than the cursor\'s.\n        -- This handles two sub-cases:\n        -- a) regular greater-than (e.g., 5 > 4)\n        -- b) current is NULL but cursor is NOT NULL (since NULLS sort LAST)\n        (addresses.account_id > :after_account_id::INT) OR (addresses.account_id IS NULL AND :after_account_id::INT IS NOT NULL)\n    )\n    OR\n    (\n        -- Case 2: The account_ids are equivalent, so we compare by the tie-breaker (address).\n        -- This handles two sub-cases for equivalence:\n        -- a) they are equal and not null (e.g., 5 = 5)\n        -- b) they are both null\n        (addresses.account_id = :after_account_id::INT OR (addresses.account_id IS NULL AND :after_account_id::INT IS NULL))\n        AND\n        (addresses.address > :after_address::TEXT)\n    )\nORDER BY addresses.account_id ASC NULLS LAST, addresses.address ASC\nLIMIT COALESCE(:limit, 1000)',
};

/**
 * Query generated from SQL:
 * ```
 * SELECT
 *     addresses.address as "address",
 *     addresses.account_id as "account_id",
 *     accounts.primary_address as "primary_address"
 * FROM addresses
 * LEFT JOIN accounts ON accounts.primary_address = addresses.address
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
export const getAllAddresses = new PreparedQuery<
  IGetAllAddressesParams,
  IGetAllAddressesResult
>(getAllAddressesIR);

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

const getAllAddressesCountIR: any = {
  "usedParamSet": {},
  "params": [],
  "statement": "SELECT COUNT(*) as total\nFROM addresses",
};

/**
 * Query generated from SQL:
 * ```
 * SELECT COUNT(*) as total
 * FROM addresses
 * ```
 */
export const getAllAddressesCount = new PreparedQuery<
  IGetAllAddressesCountParams,
  IGetAllAddressesCountResult
>(getAllAddressesCountIR);
