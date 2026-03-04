/** Types generated for queries found in "src/sql/example-queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

export type NumberOrString = number | string;

/** 'InsertKnownToken' parameters type */
export interface IInsertKnownTokenParams {
  name: string;
  token_color: string;
}

/** 'InsertKnownToken' return type */
export type IInsertKnownTokenResult = void;

/** 'InsertKnownToken' query type */
export interface IInsertKnownTokenQuery {
  params: IInsertKnownTokenParams;
  result: IInsertKnownTokenResult;
}

const insertKnownTokenIR: any = {"usedParamSet":{"token_color":true,"name":true},"params":[{"name":"token_color","required":true,"transform":{"type":"scalar"},"locs":[{"a":53,"b":65}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":68,"b":73}]}],"statement":"INSERT INTO known_tokens (token_color, name)\nVALUES (:token_color!, :name!)\nON CONFLICT (token_color) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO known_tokens (token_color, name)
 * VALUES (:token_color!, :name!)
 * ON CONFLICT (token_color) DO NOTHING
 * ```
 */
export const insertKnownToken = new PreparedQuery<IInsertKnownTokenParams,IInsertKnownTokenResult>(insertKnownTokenIR);


/** 'GetKnownTokens' parameters type */
export type IGetKnownTokensParams = void;

/** 'GetKnownTokens' return type */
export interface IGetKnownTokensResult {
  id: number;
  name: string;
  token_color: string;
}

/** 'GetKnownTokens' query type */
export interface IGetKnownTokensQuery {
  params: IGetKnownTokensParams;
  result: IGetKnownTokensResult;
}

const getKnownTokensIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM known_tokens"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM known_tokens
 * ```
 */
export const getKnownTokens = new PreparedQuery<IGetKnownTokensParams,IGetKnownTokensResult>(getKnownTokensIR);


/** 'InsertOfferFile' parameters type */
export interface IInsertOfferFileParams {
  auth_scheme?: string | null | void;
  auth_signature?: string | null | void;
  auth_signer_public_key?: string | null | void;
  celestia_height: NumberOrString;
  metadata_created_at?: DateOrString | null | void;
  metadata_expires_at?: DateOrString | null | void;
  metadata_maker_note?: string | null | void;
  transaction_hex: string;
}

/** 'InsertOfferFile' return type */
export interface IInsertOfferFileResult {
  id: number;
}

/** 'InsertOfferFile' query type */
export interface IInsertOfferFileQuery {
  params: IInsertOfferFileParams;
  result: IInsertOfferFileResult;
}

const insertOfferFileIR: any = {"usedParamSet":{"celestia_height":true,"transaction_hex":true,"metadata_created_at":true,"metadata_expires_at":true,"metadata_maker_note":true,"auth_signer_public_key":true,"auth_signature":true,"auth_scheme":true},"params":[{"name":"celestia_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":221,"b":237}]},{"name":"transaction_hex","required":true,"transform":{"type":"scalar"},"locs":[{"a":244,"b":260}]},{"name":"metadata_created_at","required":false,"transform":{"type":"scalar"},"locs":[{"a":267,"b":286}]},{"name":"metadata_expires_at","required":false,"transform":{"type":"scalar"},"locs":[{"a":293,"b":312}]},{"name":"metadata_maker_note","required":false,"transform":{"type":"scalar"},"locs":[{"a":319,"b":338}]},{"name":"auth_signer_public_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":345,"b":367}]},{"name":"auth_signature","required":false,"transform":{"type":"scalar"},"locs":[{"a":374,"b":388}]},{"name":"auth_scheme","required":false,"transform":{"type":"scalar"},"locs":[{"a":395,"b":406}]}],"statement":"INSERT INTO offer_file (\n    celestia_height,\n    transaction_hex,\n    metadata_created_at,\n    metadata_expires_at,\n    metadata_maker_note,\n    auth_signer_public_key,\n    auth_signature,\n    auth_scheme\n) VALUES (\n    :celestia_height!,\n    :transaction_hex!,\n    :metadata_created_at,\n    :metadata_expires_at,\n    :metadata_maker_note,\n    :auth_signer_public_key,\n    :auth_signature,\n    :auth_scheme\n) RETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offer_file (
 *     celestia_height,
 *     transaction_hex,
 *     metadata_created_at,
 *     metadata_expires_at,
 *     metadata_maker_note,
 *     auth_signer_public_key,
 *     auth_signature,
 *     auth_scheme
 * ) VALUES (
 *     :celestia_height!,
 *     :transaction_hex!,
 *     :metadata_created_at,
 *     :metadata_expires_at,
 *     :metadata_maker_note,
 *     :auth_signer_public_key,
 *     :auth_signature,
 *     :auth_scheme
 * ) RETURNING id
 * ```
 */
export const insertOfferFile = new PreparedQuery<IInsertOfferFileParams,IInsertOfferFileResult>(insertOfferFileIR);


/** 'InsertOfferFileToken' parameters type */
export interface IInsertOfferFileTokenParams {
  amount: string;
  direction: string;
  offer_file_id: number;
  token_color: string;
}

/** 'InsertOfferFileToken' return type */
export type IInsertOfferFileTokenResult = void;

/** 'InsertOfferFileToken' query type */
export interface IInsertOfferFileTokenQuery {
  params: IInsertOfferFileTokenParams;
  result: IInsertOfferFileTokenResult;
}

const insertOfferFileTokenIR: any = {"usedParamSet":{"offer_file_id":true,"token_color":true,"amount":true,"direction":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":123}]},{"name":"token_color","required":true,"transform":{"type":"scalar"},"locs":[{"a":130,"b":142}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":149,"b":156}]},{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":163,"b":173}]}],"statement":"INSERT INTO offer_file_tokens (\n    offer_file_id,\n    token_color,\n    amount,\n    direction\n) VALUES (\n    :offer_file_id!,\n    :token_color!,\n    :amount!,\n    :direction!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offer_file_tokens (
 *     offer_file_id,
 *     token_color,
 *     amount,
 *     direction
 * ) VALUES (
 *     :offer_file_id!,
 *     :token_color!,
 *     :amount!,
 *     :direction!
 * )
 * ```
 */
export const insertOfferFileToken = new PreparedQuery<IInsertOfferFileTokenParams,IInsertOfferFileTokenResult>(insertOfferFileTokenIR);


/** 'GetOfferFiles' parameters type */
export type IGetOfferFilesParams = void;

/** 'GetOfferFiles' return type */
export interface IGetOfferFilesResult {
  auth_scheme: string | null;
  auth_signature: string | null;
  auth_signer_public_key: string | null;
  celestia_height: string;
  created_at: Date | null;
  id: number;
  metadata_created_at: Date | null;
  metadata_expires_at: Date | null;
  metadata_maker_note: string | null;
  transaction_hex: string;
}

/** 'GetOfferFiles' query type */
export interface IGetOfferFilesQuery {
  params: IGetOfferFilesParams;
  result: IGetOfferFilesResult;
}

const getOfferFilesIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM offer_file ORDER BY created_at DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offer_file ORDER BY created_at DESC
 * ```
 */
export const getOfferFiles = new PreparedQuery<IGetOfferFilesParams,IGetOfferFilesResult>(getOfferFilesIR);


/** 'GetOfferFileTokens' parameters type */
export interface IGetOfferFileTokensParams {
  offer_file_id: number;
}

/** 'GetOfferFileTokens' return type */
export interface IGetOfferFileTokensResult {
  amount: string;
  direction: string;
  id: number;
  offer_file_id: number;
  token_color: string;
}

/** 'GetOfferFileTokens' query type */
export interface IGetOfferFileTokensQuery {
  params: IGetOfferFileTokensParams;
  result: IGetOfferFileTokensResult;
}

const getOfferFileTokensIR: any = {"usedParamSet":{"offer_file_id":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":54,"b":68}]}],"statement":"SELECT * FROM offer_file_tokens WHERE offer_file_id = :offer_file_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offer_file_tokens WHERE offer_file_id = :offer_file_id!
 * ```
 */
export const getOfferFileTokens = new PreparedQuery<IGetOfferFileTokensParams,IGetOfferFileTokensResult>(getOfferFileTokensIR);


/** 'InsertOfferFileNullifier' parameters type */
export interface IInsertOfferFileNullifierParams {
  nullifier: string;
  offer_file_id: number;
}

/** 'InsertOfferFileNullifier' return type */
export type IInsertOfferFileNullifierResult = void;

/** 'InsertOfferFileNullifier' query type */
export interface IInsertOfferFileNullifierQuery {
  params: IInsertOfferFileNullifierParams;
  result: IInsertOfferFileNullifierResult;
}

const insertOfferFileNullifierIR: any = {"usedParamSet":{"offer_file_id":true,"nullifier":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":98}]},{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":105,"b":115}]}],"statement":"INSERT INTO offer_file_nullifiers (\n    offer_file_id,\n    nullifier\n) VALUES (\n    :offer_file_id!,\n    :nullifier!\n) ON CONFLICT (nullifier) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offer_file_nullifiers (
 *     offer_file_id,
 *     nullifier
 * ) VALUES (
 *     :offer_file_id!,
 *     :nullifier!
 * ) ON CONFLICT (nullifier) DO NOTHING
 * ```
 */
export const insertOfferFileNullifier = new PreparedQuery<IInsertOfferFileNullifierParams,IInsertOfferFileNullifierResult>(insertOfferFileNullifierIR);


/** 'GetOfferFileNullifiers' parameters type */
export interface IGetOfferFileNullifiersParams {
  offer_file_id: number;
}

/** 'GetOfferFileNullifiers' return type */
export interface IGetOfferFileNullifiersResult {
  id: number;
  nullifier: string;
  offer_file_id: number;
}

/** 'GetOfferFileNullifiers' query type */
export interface IGetOfferFileNullifiersQuery {
  params: IGetOfferFileNullifiersParams;
  result: IGetOfferFileNullifiersResult;
}

const getOfferFileNullifiersIR: any = {"usedParamSet":{"offer_file_id":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":58,"b":72}]}],"statement":"SELECT * FROM offer_file_nullifiers WHERE offer_file_id = :offer_file_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offer_file_nullifiers WHERE offer_file_id = :offer_file_id!
 * ```
 */
export const getOfferFileNullifiers = new PreparedQuery<IGetOfferFileNullifiersParams,IGetOfferFileNullifiersResult>(getOfferFileNullifiersIR);


/** 'ArchiveOfferByNullifier' parameters type */
export interface IArchiveOfferByNullifierParams {
  nullifier: string;
}

/** 'ArchiveOfferByNullifier' return type */
export interface IArchiveOfferByNullifierResult {
  id: number;
}

/** 'ArchiveOfferByNullifier' query type */
export interface IArchiveOfferByNullifierQuery {
  params: IArchiveOfferByNullifierParams;
  result: IArchiveOfferByNullifierResult;
}

const archiveOfferByNullifierIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":96,"b":106}]}],"statement":"WITH matched AS (\n    SELECT offer_file_id\n    FROM offer_file_nullifiers\n    WHERE nullifier = :nullifier!\n    LIMIT 1\n),\narchived_offer AS (\n    INSERT INTO offer_file_history (\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at\n    )\n    SELECT\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at\n    FROM offer_file\n    WHERE id IN (SELECT offer_file_id FROM matched)\n    RETURNING id\n),\narchived_tokens AS (\n    INSERT INTO offer_file_tokens_history (\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    )\n    SELECT\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    FROM offer_file_tokens\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n),\narchived_nullifiers AS (\n    INSERT INTO offer_file_nullifiers_history (\n        offer_file_id,\n        nullifier\n    )\n    SELECT\n        offer_file_id,\n        nullifier\n    FROM offer_file_nullifiers\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n)\nDELETE FROM offer_file\nWHERE id IN (SELECT offer_file_id FROM matched)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * WITH matched AS (
 *     SELECT offer_file_id
 *     FROM offer_file_nullifiers
 *     WHERE nullifier = :nullifier!
 *     LIMIT 1
 * ),
 * archived_offer AS (
 *     INSERT INTO offer_file_history (
 *         id,
 *         celestia_height,
 *         transaction_hex,
 *         metadata_created_at,
 *         metadata_expires_at,
 *         metadata_maker_note,
 *         auth_signer_public_key,
 *         auth_signature,
 *         auth_scheme,
 *         created_at
 *     )
 *     SELECT
 *         id,
 *         celestia_height,
 *         transaction_hex,
 *         metadata_created_at,
 *         metadata_expires_at,
 *         metadata_maker_note,
 *         auth_signer_public_key,
 *         auth_signature,
 *         auth_scheme,
 *         created_at
 *     FROM offer_file
 *     WHERE id IN (SELECT offer_file_id FROM matched)
 *     RETURNING id
 * ),
 * archived_tokens AS (
 *     INSERT INTO offer_file_tokens_history (
 *         offer_file_id,
 *         token_color,
 *         amount,
 *         direction
 *     )
 *     SELECT
 *         offer_file_id,
 *         token_color,
 *         amount,
 *         direction
 *     FROM offer_file_tokens
 *     WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
 * ),
 * archived_nullifiers AS (
 *     INSERT INTO offer_file_nullifiers_history (
 *         offer_file_id,
 *         nullifier
 *     )
 *     SELECT
 *         offer_file_id,
 *         nullifier
 *     FROM offer_file_nullifiers
 *     WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
 * )
 * DELETE FROM offer_file
 * WHERE id IN (SELECT offer_file_id FROM matched)
 * RETURNING id
 * ```
 */
export const archiveOfferByNullifier = new PreparedQuery<IArchiveOfferByNullifierParams,IArchiveOfferByNullifierResult>(archiveOfferByNullifierIR);


