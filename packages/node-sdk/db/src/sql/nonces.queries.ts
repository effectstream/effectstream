/** Types generated for queries found in "src/sql/nonces.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'FindNonce' parameters type */
export interface IFindNonceParams {
  nonce?: string | null | void;
}

/** 'FindNonce' return type */
export interface IFindNonceResult {
  block_height: number;
  nonce: string;
}

/** 'FindNonce' query type */
export interface IFindNonceQuery {
  params: IFindNonceParams;
  result: IFindNonceResult;
}

const findNonceIR: any = {"usedParamSet":{"nonce":true},"params":[{"name":"nonce","required":false,"transform":{"type":"scalar"},"locs":[{"a":35,"b":40}]}],"statement":"SELECT * FROM nonces\nWHERE nonce = :nonce"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM nonces
 * WHERE nonce = :nonce
 * ```
 */
export const findNonce = new PreparedQuery<IFindNonceParams,IFindNonceResult>(findNonceIR);


/** 'DeleteNonces' parameters type */
export interface IDeleteNoncesParams {
  limit_block_height: number;
}

/** 'DeleteNonces' return type */
export type IDeleteNoncesResult = void;

/** 'DeleteNonces' query type */
export interface IDeleteNoncesQuery {
  params: IDeleteNoncesParams;
  result: IDeleteNoncesResult;
}

const deleteNoncesIR: any = {"usedParamSet":{"limit_block_height":true},"params":[{"name":"limit_block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":60}]}],"statement":"DELETE FROM nonces\nWHERE block_height <= :limit_block_height!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM nonces
 * WHERE block_height <= :limit_block_height!
 * ```
 */
export const deleteNonces = new PreparedQuery<IDeleteNoncesParams,IDeleteNoncesResult>(deleteNoncesIR);


/** 'InsertNonce' parameters type */
export interface IInsertNonceParams {
  block_height: number;
  nonce: string;
}

/** 'InsertNonce' return type */
export type IInsertNonceResult = void;

/** 'InsertNonce' query type */
export interface IInsertNonceQuery {
  params: IInsertNonceParams;
  result: IInsertNonceResult;
}

const insertNonceIR: any = {"usedParamSet":{"nonce":true,"block_height":true},"params":[{"name":"nonce","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":54}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":57,"b":70}]}],"statement":"INSERT INTO nonces(nonce, block_height)\nVALUES (:nonce!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO nonces(nonce, block_height)
 * VALUES (:nonce!, :block_height!)
 * ```
 */
export const insertNonce = new PreparedQuery<IInsertNonceParams,IInsertNonceResult>(insertNonceIR);


