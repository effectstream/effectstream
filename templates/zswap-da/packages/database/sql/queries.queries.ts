/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

export type NumberOrString = number | string;

/** 'InsertKnownToken' parameters type */
export interface IInsertKnownTokenParams {
  kind: string;
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

const insertKnownTokenIR: any = {"usedParamSet":{"token_color":true,"name":true,"kind":true},"params":[{"name":"token_color","required":true,"transform":{"type":"scalar"},"locs":[{"a":59,"b":71}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":79}]},{"name":"kind","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":87}]}],"statement":"INSERT INTO known_tokens (token_color, name, kind)\nVALUES (:token_color!, :name!, :kind!)\nON CONFLICT (token_color) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO known_tokens (token_color, name, kind)
 * VALUES (:token_color!, :name!, :kind!)
 * ON CONFLICT (token_color) DO NOTHING
 * ```
 */
export const insertKnownToken = new PreparedQuery<IInsertKnownTokenParams,IInsertKnownTokenResult>(insertKnownTokenIR);


/** 'GetKnownTokens' parameters type */
export type IGetKnownTokensParams = void;

/** 'GetKnownTokens' return type */
export interface IGetKnownTokensResult {
  id: number;
  kind: string;
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
  ttl_seconds?: number | null | void;
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

const insertOfferFileIR: any = {"usedParamSet":{"celestia_height":true,"transaction_hex":true,"metadata_created_at":true,"metadata_expires_at":true,"metadata_maker_note":true,"auth_signer_public_key":true,"auth_signature":true,"auth_scheme":true,"ttl_seconds":true},"params":[{"name":"celestia_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":238,"b":254}]},{"name":"transaction_hex","required":true,"transform":{"type":"scalar"},"locs":[{"a":261,"b":277}]},{"name":"metadata_created_at","required":false,"transform":{"type":"scalar"},"locs":[{"a":284,"b":303}]},{"name":"metadata_expires_at","required":false,"transform":{"type":"scalar"},"locs":[{"a":310,"b":329}]},{"name":"metadata_maker_note","required":false,"transform":{"type":"scalar"},"locs":[{"a":336,"b":355}]},{"name":"auth_signer_public_key","required":false,"transform":{"type":"scalar"},"locs":[{"a":362,"b":384}]},{"name":"auth_signature","required":false,"transform":{"type":"scalar"},"locs":[{"a":391,"b":405}]},{"name":"auth_scheme","required":false,"transform":{"type":"scalar"},"locs":[{"a":412,"b":423}]},{"name":"ttl_seconds","required":false,"transform":{"type":"scalar"},"locs":[{"a":439,"b":450}]}],"statement":"INSERT INTO offer_file (\n    celestia_height,\n    transaction_hex,\n    metadata_created_at,\n    metadata_expires_at,\n    metadata_maker_note,\n    auth_signer_public_key,\n    auth_signature,\n    auth_scheme,\n    ttl_seconds\n) VALUES (\n    :celestia_height!,\n    :transaction_hex!,\n    :metadata_created_at,\n    :metadata_expires_at,\n    :metadata_maker_note,\n    :auth_signer_public_key,\n    :auth_signature,\n    :auth_scheme,\n    COALESCE(:ttl_seconds, 3600)\n) RETURNING id"};

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
 *     auth_scheme,
 *     ttl_seconds
 * ) VALUES (
 *     :celestia_height!,
 *     :transaction_hex!,
 *     :metadata_created_at,
 *     :metadata_expires_at,
 *     :metadata_maker_note,
 *     :auth_signer_public_key,
 *     :auth_signature,
 *     :auth_scheme,
 *     COALESCE(:ttl_seconds, 3600)
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
export interface IGetOfferFilesParams {
  direction: string;
  limit: NumberOrString;
  offset: NumberOrString;
  token: string;
}

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
  ttl_seconds: string;
}

/** 'GetOfferFiles' query type */
export interface IGetOfferFilesQuery {
  params: IGetOfferFilesParams;
  result: IGetOfferFilesResult;
}

const getOfferFilesIR: any = {"usedParamSet":{"token":true,"direction":true,"limit":true,"offset":true},"params":[{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":110,"b":115},{"a":143,"b":149}]},{"name":"direction","required":true,"transform":{"type":"scalar"},"locs":[{"a":159,"b":168},{"a":197,"b":207}]},{"name":"limit","required":true,"transform":{"type":"scalar"},"locs":[{"a":244,"b":250}]},{"name":"offset","required":true,"transform":{"type":"scalar"},"locs":[{"a":259,"b":266}]}],"statement":"SELECT DISTINCT of.*\nFROM offer_file of\nLEFT JOIN offer_file_tokens oft ON oft.offer_file_id = of.id\nWHERE\n  (:token = '' OR oft.token_color = :token!)\n  AND (:direction = 'ANY' OR oft.direction = :direction!)\nORDER BY of.created_at DESC\nLIMIT :limit!\nOFFSET :offset!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT DISTINCT of.*
 * FROM offer_file of
 * LEFT JOIN offer_file_tokens oft ON oft.offer_file_id = of.id
 * WHERE
 *   (:token = '' OR oft.token_color = :token!)
 *   AND (:direction = 'ANY' OR oft.direction = :direction!)
 * ORDER BY of.created_at DESC
 * LIMIT :limit!
 * OFFSET :offset!
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

const insertOfferFileNullifierIR: any = {"usedParamSet":{"offer_file_id":true,"nullifier":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":98}]},{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":105,"b":115}]}],"statement":"INSERT INTO offer_file_nullifiers (\n    offer_file_id,\n    nullifier\n) VALUES (\n    :offer_file_id!,\n    :nullifier!\n) ON CONFLICT (offer_file_id, nullifier) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offer_file_nullifiers (
 *     offer_file_id,
 *     nullifier
 * ) VALUES (
 *     :offer_file_id!,
 *     :nullifier!
 * ) ON CONFLICT (offer_file_id, nullifier) DO NOTHING
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


/** 'InsertOfferFileUnshieldedSpend' parameters type */
export interface IInsertOfferFileUnshieldedSpendParams {
  intent_hash: string;
  offer_file_id: number;
  output_no: number;
  owner: string;
}

/** 'InsertOfferFileUnshieldedSpend' return type */
export type IInsertOfferFileUnshieldedSpendResult = void;

/** 'InsertOfferFileUnshieldedSpend' query type */
export interface IInsertOfferFileUnshieldedSpendQuery {
  params: IInsertOfferFileUnshieldedSpendParams;
  result: IInsertOfferFileUnshieldedSpendResult;
}

const insertOfferFileUnshieldedSpendIR: any = {"usedParamSet":{"offer_file_id":true,"owner":true,"intent_hash":true,"output_no":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":119,"b":133}]},{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":146}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":153,"b":165}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":172,"b":182}]}],"statement":"INSERT INTO offer_file_unshielded_spends (\n    offer_file_id,\n    owner,\n    intent_hash,\n    output_no\n) VALUES (\n    :offer_file_id!,\n    :owner!,\n    :intent_hash!,\n    :output_no!\n) ON CONFLICT (offer_file_id, owner, intent_hash, output_no) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offer_file_unshielded_spends (
 *     offer_file_id,
 *     owner,
 *     intent_hash,
 *     output_no
 * ) VALUES (
 *     :offer_file_id!,
 *     :owner!,
 *     :intent_hash!,
 *     :output_no!
 * ) ON CONFLICT (offer_file_id, owner, intent_hash, output_no) DO NOTHING
 * ```
 */
export const insertOfferFileUnshieldedSpend = new PreparedQuery<IInsertOfferFileUnshieldedSpendParams,IInsertOfferFileUnshieldedSpendResult>(insertOfferFileUnshieldedSpendIR);


/** 'GetOfferFileUnshieldedSpends' parameters type */
export interface IGetOfferFileUnshieldedSpendsParams {
  offer_file_id: number;
}

/** 'GetOfferFileUnshieldedSpends' return type */
export interface IGetOfferFileUnshieldedSpendsResult {
  id: number;
  intent_hash: string;
  offer_file_id: number;
  output_no: number;
  owner: string;
}

/** 'GetOfferFileUnshieldedSpends' query type */
export interface IGetOfferFileUnshieldedSpendsQuery {
  params: IGetOfferFileUnshieldedSpendsParams;
  result: IGetOfferFileUnshieldedSpendsResult;
}

const getOfferFileUnshieldedSpendsIR: any = {"usedParamSet":{"offer_file_id":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":79}]}],"statement":"SELECT * FROM offer_file_unshielded_spends WHERE offer_file_id = :offer_file_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offer_file_unshielded_spends WHERE offer_file_id = :offer_file_id!
 * ```
 */
export const getOfferFileUnshieldedSpends = new PreparedQuery<IGetOfferFileUnshieldedSpendsParams,IGetOfferFileUnshieldedSpendsResult>(getOfferFileUnshieldedSpendsIR);


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

const archiveOfferByNullifierIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":289,"b":299}]}],"statement":"-- Archive every offer that referenced this nullifier. A single coin can\n-- back multiple competing offers (different counter-asset, etc.) — all of\n-- them die when the coin is spent.\nWITH matched AS (\n    SELECT DISTINCT offer_file_id\n    FROM offer_file_nullifiers\n    WHERE nullifier = :nullifier!\n),\narchived_offer AS (\n    INSERT INTO offer_file_history (\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at,\n        ttl_seconds,\n        archive_reason\n    )\n    SELECT\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at,\n        ttl_seconds,\n        'CONSUMED'\n    FROM offer_file\n    WHERE id IN (SELECT offer_file_id FROM matched)\n    RETURNING id\n),\narchived_tokens AS (\n    INSERT INTO offer_file_tokens_history (\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    )\n    SELECT\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    FROM offer_file_tokens\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n),\narchived_nullifiers AS (\n    INSERT INTO offer_file_nullifiers_history (\n        offer_file_id,\n        nullifier\n    )\n    SELECT\n        offer_file_id,\n        nullifier\n    FROM offer_file_nullifiers\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n),\narchived_unshielded_spends AS (\n    INSERT INTO offer_file_unshielded_spends_history (\n        offer_file_id,\n        owner,\n        intent_hash,\n        output_no\n    )\n    SELECT\n        offer_file_id,\n        owner,\n        intent_hash,\n        output_no\n    FROM offer_file_unshielded_spends\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n)\nDELETE FROM offer_file\nWHERE id IN (SELECT offer_file_id FROM matched)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * -- Archive every offer that referenced this nullifier. A single coin can
 * -- back multiple competing offers (different counter-asset, etc.) — all of
 * -- them die when the coin is spent.
 * WITH matched AS (
 *     SELECT DISTINCT offer_file_id
 *     FROM offer_file_nullifiers
 *     WHERE nullifier = :nullifier!
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
 *         created_at,
 *         ttl_seconds,
 *         archive_reason
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
 *         created_at,
 *         ttl_seconds,
 *         'CONSUMED'
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
 * ),
 * archived_unshielded_spends AS (
 *     INSERT INTO offer_file_unshielded_spends_history (
 *         offer_file_id,
 *         owner,
 *         intent_hash,
 *         output_no
 *     )
 *     SELECT
 *         offer_file_id,
 *         owner,
 *         intent_hash,
 *         output_no
 *     FROM offer_file_unshielded_spends
 *     WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
 * )
 * DELETE FROM offer_file
 * WHERE id IN (SELECT offer_file_id FROM matched)
 * RETURNING id
 * ```
 */
export const archiveOfferByNullifier = new PreparedQuery<IArchiveOfferByNullifierParams,IArchiveOfferByNullifierResult>(archiveOfferByNullifierIR);


/** 'ArchiveOfferByUnshieldedSpend' parameters type */
export interface IArchiveOfferByUnshieldedSpendParams {
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'ArchiveOfferByUnshieldedSpend' return type */
export interface IArchiveOfferByUnshieldedSpendResult {
  id: number;
}

/** 'ArchiveOfferByUnshieldedSpend' query type */
export interface IArchiveOfferByUnshieldedSpendQuery {
  params: IArchiveOfferByUnshieldedSpendParams;
  result: IArchiveOfferByUnshieldedSpendResult;
}

const archiveOfferByUnshieldedSpendIR: any = {"usedParamSet":{"owner":true,"intent_hash":true,"output_no":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":247,"b":253}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":279,"b":291}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":315,"b":325}]}],"statement":"-- Archive every offer that referenced this unshielded UTXO. Same rule as\n-- nullifiers: a single UTXO can back multiple competing offers.\nWITH matched AS (\n    SELECT DISTINCT offer_file_id\n    FROM offer_file_unshielded_spends\n    WHERE owner = :owner!\n      AND intent_hash = :intent_hash!\n      AND output_no = :output_no!\n),\narchived_offer AS (\n    INSERT INTO offer_file_history (\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at,\n        ttl_seconds,\n        archive_reason\n    )\n    SELECT\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at,\n        ttl_seconds,\n        'CONSUMED'\n    FROM offer_file\n    WHERE id IN (SELECT offer_file_id FROM matched)\n    RETURNING id\n),\narchived_tokens AS (\n    INSERT INTO offer_file_tokens_history (\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    )\n    SELECT\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    FROM offer_file_tokens\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n),\narchived_nullifiers AS (\n    INSERT INTO offer_file_nullifiers_history (\n        offer_file_id,\n        nullifier\n    )\n    SELECT\n        offer_file_id,\n        nullifier\n    FROM offer_file_nullifiers\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n),\narchived_unshielded_spends AS (\n    INSERT INTO offer_file_unshielded_spends_history (\n        offer_file_id,\n        owner,\n        intent_hash,\n        output_no\n    )\n    SELECT\n        offer_file_id,\n        owner,\n        intent_hash,\n        output_no\n    FROM offer_file_unshielded_spends\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n)\nDELETE FROM offer_file\nWHERE id IN (SELECT offer_file_id FROM matched)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * -- Archive every offer that referenced this unshielded UTXO. Same rule as
 * -- nullifiers: a single UTXO can back multiple competing offers.
 * WITH matched AS (
 *     SELECT DISTINCT offer_file_id
 *     FROM offer_file_unshielded_spends
 *     WHERE owner = :owner!
 *       AND intent_hash = :intent_hash!
 *       AND output_no = :output_no!
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
 *         created_at,
 *         ttl_seconds,
 *         archive_reason
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
 *         created_at,
 *         ttl_seconds,
 *         'CONSUMED'
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
 * ),
 * archived_unshielded_spends AS (
 *     INSERT INTO offer_file_unshielded_spends_history (
 *         offer_file_id,
 *         owner,
 *         intent_hash,
 *         output_no
 *     )
 *     SELECT
 *         offer_file_id,
 *         owner,
 *         intent_hash,
 *         output_no
 *     FROM offer_file_unshielded_spends
 *     WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
 * )
 * DELETE FROM offer_file
 * WHERE id IN (SELECT offer_file_id FROM matched)
 * RETURNING id
 * ```
 */
export const archiveOfferByUnshieldedSpend = new PreparedQuery<IArchiveOfferByUnshieldedSpendParams,IArchiveOfferByUnshieldedSpendResult>(archiveOfferByUnshieldedSpendIR);


/** 'ArchiveOfferByIdTtl' parameters type */
export interface IArchiveOfferByIdTtlParams {
  offer_file_id: number;
}

/** 'ArchiveOfferByIdTtl' return type */
export interface IArchiveOfferByIdTtlResult {
  id: number;
}

/** 'ArchiveOfferByIdTtl' query type */
export interface IArchiveOfferByIdTtlQuery {
  params: IArchiveOfferByIdTtlParams;
  result: IArchiveOfferByIdTtlResult;
}

const archiveOfferByIdTtlIR: any = {"usedParamSet":{"offer_file_id":true},"params":[{"name":"offer_file_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":98}]}],"statement":"WITH matched AS (\n    SELECT id AS offer_file_id\n    FROM offer_file\n    WHERE id = :offer_file_id!\n    LIMIT 1\n),\narchived_offer AS (\n    INSERT INTO offer_file_history (\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at,\n        ttl_seconds,\n        archive_reason\n    )\n    SELECT\n        id,\n        celestia_height,\n        transaction_hex,\n        metadata_created_at,\n        metadata_expires_at,\n        metadata_maker_note,\n        auth_signer_public_key,\n        auth_signature,\n        auth_scheme,\n        created_at,\n        ttl_seconds,\n        'TTL'\n    FROM offer_file\n    WHERE id IN (SELECT offer_file_id FROM matched)\n    RETURNING id\n),\narchived_tokens AS (\n    INSERT INTO offer_file_tokens_history (\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    )\n    SELECT\n        offer_file_id,\n        token_color,\n        amount,\n        direction\n    FROM offer_file_tokens\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n),\narchived_nullifiers AS (\n    INSERT INTO offer_file_nullifiers_history (\n        offer_file_id,\n        nullifier\n    )\n    SELECT\n        offer_file_id,\n        nullifier\n    FROM offer_file_nullifiers\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n),\narchived_unshielded_spends AS (\n    INSERT INTO offer_file_unshielded_spends_history (\n        offer_file_id,\n        owner,\n        intent_hash,\n        output_no\n    )\n    SELECT\n        offer_file_id,\n        owner,\n        intent_hash,\n        output_no\n    FROM offer_file_unshielded_spends\n    WHERE offer_file_id IN (SELECT offer_file_id FROM matched)\n)\nDELETE FROM offer_file\nWHERE id IN (SELECT offer_file_id FROM matched)\nRETURNING id"};

/**
 * Query generated from SQL:
 * ```
 * WITH matched AS (
 *     SELECT id AS offer_file_id
 *     FROM offer_file
 *     WHERE id = :offer_file_id!
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
 *         created_at,
 *         ttl_seconds,
 *         archive_reason
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
 *         created_at,
 *         ttl_seconds,
 *         'TTL'
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
 * ),
 * archived_unshielded_spends AS (
 *     INSERT INTO offer_file_unshielded_spends_history (
 *         offer_file_id,
 *         owner,
 *         intent_hash,
 *         output_no
 *     )
 *     SELECT
 *         offer_file_id,
 *         owner,
 *         intent_hash,
 *         output_no
 *     FROM offer_file_unshielded_spends
 *     WHERE offer_file_id IN (SELECT offer_file_id FROM matched)
 * )
 * DELETE FROM offer_file
 * WHERE id IN (SELECT offer_file_id FROM matched)
 * RETURNING id
 * ```
 */
export const archiveOfferByIdTtl = new PreparedQuery<IArchiveOfferByIdTtlParams,IArchiveOfferByIdTtlResult>(archiveOfferByIdTtlIR);


/** 'UpsertSeenNullifier' parameters type */
export interface IUpsertSeenNullifierParams {
  first_seen_height: NumberOrString;
  nullifier: string;
}

/** 'UpsertSeenNullifier' return type */
export type IUpsertSeenNullifierResult = void;

/** 'UpsertSeenNullifier' query type */
export interface IUpsertSeenNullifierQuery {
  params: IUpsertSeenNullifierParams;
  result: IUpsertSeenNullifierResult;
}

const upsertSeenNullifierIR: any = {"usedParamSet":{"nullifier":true,"first_seen_height":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":204,"b":214}]},{"name":"first_seen_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":217,"b":235}]}],"statement":"-- Persist a nullifier event that did not (yet) match any indexed offer,\n-- so a later-arriving Celestia offer can reconcile against it.\nINSERT INTO seen_nullifiers (nullifier, first_seen_height)\nVALUES (:nullifier!, :first_seen_height!)\nON CONFLICT (nullifier) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * -- Persist a nullifier event that did not (yet) match any indexed offer,
 * -- so a later-arriving Celestia offer can reconcile against it.
 * INSERT INTO seen_nullifiers (nullifier, first_seen_height)
 * VALUES (:nullifier!, :first_seen_height!)
 * ON CONFLICT (nullifier) DO NOTHING
 * ```
 */
export const upsertSeenNullifier = new PreparedQuery<IUpsertSeenNullifierParams,IUpsertSeenNullifierResult>(upsertSeenNullifierIR);


/** 'FindSeenNullifier' parameters type */
export interface IFindSeenNullifierParams {
  nullifier: string;
}

/** 'FindSeenNullifier' return type */
export interface IFindSeenNullifierResult {
  first_seen_height: string;
  nullifier: string;
}

/** 'FindSeenNullifier' query type */
export interface IFindSeenNullifierQuery {
  params: IFindSeenNullifierParams;
  result: IFindSeenNullifierResult;
}

const findSeenNullifierIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":75,"b":85}]}],"statement":"SELECT nullifier, first_seen_height\nFROM seen_nullifiers\nWHERE nullifier = :nullifier!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT nullifier, first_seen_height
 * FROM seen_nullifiers
 * WHERE nullifier = :nullifier!
 * ```
 */
export const findSeenNullifier = new PreparedQuery<IFindSeenNullifierParams,IFindSeenNullifierResult>(findSeenNullifierIR);


/** 'DeleteSeenNullifier' parameters type */
export interface IDeleteSeenNullifierParams {
  nullifier: string;
}

/** 'DeleteSeenNullifier' return type */
export type IDeleteSeenNullifierResult = void;

/** 'DeleteSeenNullifier' query type */
export interface IDeleteSeenNullifierQuery {
  params: IDeleteSeenNullifierParams;
  result: IDeleteSeenNullifierResult;
}

const deleteSeenNullifierIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":56}]}],"statement":"DELETE FROM seen_nullifiers WHERE nullifier = :nullifier!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM seen_nullifiers WHERE nullifier = :nullifier!
 * ```
 */
export const deleteSeenNullifier = new PreparedQuery<IDeleteSeenNullifierParams,IDeleteSeenNullifierResult>(deleteSeenNullifierIR);


/** 'UpsertSeenUnshieldedSpend' parameters type */
export interface IUpsertSeenUnshieldedSpendParams {
  first_seen_height: NumberOrString;
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'UpsertSeenUnshieldedSpend' return type */
export type IUpsertSeenUnshieldedSpendResult = void;

/** 'UpsertSeenUnshieldedSpend' query type */
export interface IUpsertSeenUnshieldedSpendQuery {
  params: IUpsertSeenUnshieldedSpendParams;
  result: IUpsertSeenUnshieldedSpendResult;
}

const upsertSeenUnshieldedSpendIR: any = {"usedParamSet":{"owner":true,"intent_hash":true,"output_no":true,"first_seen_height":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":94,"b":100}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":115}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":118,"b":128}]},{"name":"first_seen_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":131,"b":149}]}],"statement":"INSERT INTO seen_unshielded_spends (owner, intent_hash, output_no, first_seen_height)\nVALUES (:owner!, :intent_hash!, :output_no!, :first_seen_height!)\nON CONFLICT (owner, intent_hash, output_no) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO seen_unshielded_spends (owner, intent_hash, output_no, first_seen_height)
 * VALUES (:owner!, :intent_hash!, :output_no!, :first_seen_height!)
 * ON CONFLICT (owner, intent_hash, output_no) DO NOTHING
 * ```
 */
export const upsertSeenUnshieldedSpend = new PreparedQuery<IUpsertSeenUnshieldedSpendParams,IUpsertSeenUnshieldedSpendResult>(upsertSeenUnshieldedSpendIR);


/** 'FindSeenUnshieldedSpend' parameters type */
export interface IFindSeenUnshieldedSpendParams {
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'FindSeenUnshieldedSpend' return type */
export interface IFindSeenUnshieldedSpendResult {
  first_seen_height: string;
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'FindSeenUnshieldedSpend' query type */
export interface IFindSeenUnshieldedSpendQuery {
  params: IFindSeenUnshieldedSpendParams;
  result: IFindSeenUnshieldedSpendResult;
}

const findSeenUnshieldedSpendIR: any = {"usedParamSet":{"owner":true,"intent_hash":true,"output_no":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":104}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":126,"b":138}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":168}]}],"statement":"SELECT owner, intent_hash, output_no, first_seen_height\nFROM seen_unshielded_spends\nWHERE owner = :owner!\n  AND intent_hash = :intent_hash!\n  AND output_no = :output_no!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT owner, intent_hash, output_no, first_seen_height
 * FROM seen_unshielded_spends
 * WHERE owner = :owner!
 *   AND intent_hash = :intent_hash!
 *   AND output_no = :output_no!
 * ```
 */
export const findSeenUnshieldedSpend = new PreparedQuery<IFindSeenUnshieldedSpendParams,IFindSeenUnshieldedSpendResult>(findSeenUnshieldedSpendIR);


/** 'DeleteSeenUnshieldedSpend' parameters type */
export interface IDeleteSeenUnshieldedSpendParams {
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'DeleteSeenUnshieldedSpend' return type */
export type IDeleteSeenUnshieldedSpendResult = void;

/** 'DeleteSeenUnshieldedSpend' query type */
export interface IDeleteSeenUnshieldedSpendQuery {
  params: IDeleteSeenUnshieldedSpendParams;
  result: IDeleteSeenUnshieldedSpendResult;
}

const deleteSeenUnshieldedSpendIR: any = {"usedParamSet":{"owner":true,"intent_hash":true,"output_no":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":49,"b":55}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":77,"b":89}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":119}]}],"statement":"DELETE FROM seen_unshielded_spends\nWHERE owner = :owner!\n  AND intent_hash = :intent_hash!\n  AND output_no = :output_no!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM seen_unshielded_spends
 * WHERE owner = :owner!
 *   AND intent_hash = :intent_hash!
 *   AND output_no = :output_no!
 * ```
 */
export const deleteSeenUnshieldedSpend = new PreparedQuery<IDeleteSeenUnshieldedSpendParams,IDeleteSeenUnshieldedSpendResult>(deleteSeenUnshieldedSpendIR);


