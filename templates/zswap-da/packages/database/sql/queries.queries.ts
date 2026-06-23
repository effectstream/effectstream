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


/** 'UpsertNullifier' parameters type */
export interface IUpsertNullifierParams {
  height: NumberOrString;
  nullifier: string;
}

/** 'UpsertNullifier' return type */
export type IUpsertNullifierResult = void;

/** 'UpsertNullifier' query type */
export interface IUpsertNullifierQuery {
  params: IUpsertNullifierParams;
  result: IUpsertNullifierResult;
}

const upsertNullifierIR: any = {"usedParamSet":{"nullifier":true,"height":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":51,"b":61}]},{"name":"height","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":71}]}],"statement":"INSERT INTO nullifiers (nullifier, height)\nVALUES (:nullifier!, :height!)\nON CONFLICT (nullifier) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO nullifiers (nullifier, height)
 * VALUES (:nullifier!, :height!)
 * ON CONFLICT (nullifier) DO NOTHING
 * ```
 */
export const upsertNullifier = new PreparedQuery<IUpsertNullifierParams,IUpsertNullifierResult>(upsertNullifierIR);


/** 'MarkNullifierMatched' parameters type */
export interface IMarkNullifierMatchedParams {
  nullifier: string;
}

/** 'MarkNullifierMatched' return type */
export type IMarkNullifierMatchedResult = void;

/** 'MarkNullifierMatched' query type */
export interface IMarkNullifierMatchedQuery {
  params: IMarkNullifierMatchedParams;
  result: IMarkNullifierMatchedResult;
}

const markNullifierMatchedIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":71}]}],"statement":"UPDATE nullifiers SET offer_matched = true WHERE nullifier = :nullifier!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE nullifiers SET offer_matched = true WHERE nullifier = :nullifier!
 * ```
 */
export const markNullifierMatched = new PreparedQuery<IMarkNullifierMatchedParams,IMarkNullifierMatchedResult>(markNullifierMatchedIR);


/** 'FindUnmatchedNullifier' parameters type */
export interface IFindUnmatchedNullifierParams {
  nullifier: string;
}

/** 'FindUnmatchedNullifier' return type */
export interface IFindUnmatchedNullifierResult {
  height: string;
  nullifier: string;
}

/** 'FindUnmatchedNullifier' query type */
export interface IFindUnmatchedNullifierQuery {
  params: IFindUnmatchedNullifierParams;
  result: IFindUnmatchedNullifierResult;
}

const findUnmatchedNullifierIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":59,"b":69}]}],"statement":"SELECT nullifier, height FROM nullifiers\nWHERE nullifier = :nullifier! AND offer_matched = false"};

/**
 * Query generated from SQL:
 * ```
 * SELECT nullifier, height FROM nullifiers
 * WHERE nullifier = :nullifier! AND offer_matched = false
 * ```
 */
export const findUnmatchedNullifier = new PreparedQuery<IFindUnmatchedNullifierParams,IFindUnmatchedNullifierResult>(findUnmatchedNullifierIR);


/** 'IsNullifierSpent' parameters type */
export interface IIsNullifierSpentParams {
  nullifier: string;
}

/** 'IsNullifierSpent' return type */
export interface IIsNullifierSpentResult {
  spent: number | null;
}

/** 'IsNullifierSpent' query type */
export interface IIsNullifierSpentQuery {
  params: IIsNullifierSpentParams;
  result: IIsNullifierSpentResult;
}

const isNullifierSpentIR: any = {"usedParamSet":{"nullifier":true},"params":[{"name":"nullifier","required":true,"transform":{"type":"scalar"},"locs":[{"a":52,"b":62}]}],"statement":"SELECT 1 AS spent FROM nullifiers WHERE nullifier = :nullifier!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 1 AS spent FROM nullifiers WHERE nullifier = :nullifier!
 * ```
 */
export const isNullifierSpent = new PreparedQuery<IIsNullifierSpentParams,IIsNullifierSpentResult>(isNullifierSpentIR);


/** 'PruneStaleNullifiers' parameters type */
export interface IPruneStaleNullifiersParams {
  cutoff_at: Date;
}

/** 'PruneStaleNullifiers' return type */
export type IPruneStaleNullifiersResult = void;

/** 'PruneStaleNullifiers' query type */
export interface IPruneStaleNullifiersQuery {
  params: IPruneStaleNullifiersParams;
  result: IPruneStaleNullifiersResult;
}

const pruneStaleNullifiersIR: any = {"usedParamSet":{"cutoff_at":true},"params":[{"name":"cutoff_at","required":true,"transform":{"type":"scalar"},"locs":[{"a":69,"b":79}]}],"statement":"DELETE FROM nullifiers WHERE offer_matched = false AND recorded_at < :cutoff_at!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM nullifiers WHERE offer_matched = false AND recorded_at < :cutoff_at!
 * ```
 */
export const pruneStaleNullifiers = new PreparedQuery<IPruneStaleNullifiersParams,IPruneStaleNullifiersResult>(pruneStaleNullifiersIR);


/** 'InsertCreatedUnshielded' parameters type */
export interface IInsertCreatedUnshieldedParams {
  height: NumberOrString;
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'InsertCreatedUnshielded' return type */
export type IInsertCreatedUnshieldedResult = void;

/** 'InsertCreatedUnshielded' query type */
export interface IInsertCreatedUnshieldedQuery {
  params: IInsertCreatedUnshieldedParams;
  result: IInsertCreatedUnshieldedResult;
}

const insertCreatedUnshieldedIR: any = {"usedParamSet":{"owner":true,"intent_hash":true,"output_no":true,"height":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":157,"b":163}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":166,"b":178}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":181,"b":191}]},{"name":"height","required":true,"transform":{"type":"scalar"},"locs":[{"a":194,"b":201}]}],"statement":"-- Append-only record of an unshielded UTXO created on chain (existence set).\nINSERT INTO created_unshielded (owner, intent_hash, output_no, height)\nVALUES (:owner!, :intent_hash!, :output_no!, :height!)\nON CONFLICT (owner, intent_hash, output_no) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * -- Append-only record of an unshielded UTXO created on chain (existence set).
 * INSERT INTO created_unshielded (owner, intent_hash, output_no, height)
 * VALUES (:owner!, :intent_hash!, :output_no!, :height!)
 * ON CONFLICT (owner, intent_hash, output_no) DO NOTHING
 * ```
 */
export const insertCreatedUnshielded = new PreparedQuery<IInsertCreatedUnshieldedParams,IInsertCreatedUnshieldedResult>(insertCreatedUnshieldedIR);


/** 'DeleteCreatedUnshielded' parameters type */
export interface IDeleteCreatedUnshieldedParams {
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'DeleteCreatedUnshielded' return type */
export type IDeleteCreatedUnshieldedResult = void;

/** 'DeleteCreatedUnshielded' query type */
export interface IDeleteCreatedUnshieldedQuery {
  params: IDeleteCreatedUnshieldedParams;
  result: IDeleteCreatedUnshieldedResult;
}

const deleteCreatedUnshieldedIR: any = {"usedParamSet":{"owner":true,"intent_hash":true,"output_no":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":51}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":85}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":105,"b":115}]}],"statement":"DELETE FROM created_unshielded\nWHERE owner = :owner!\n  AND intent_hash = :intent_hash!\n  AND output_no = :output_no!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM created_unshielded
 * WHERE owner = :owner!
 *   AND intent_hash = :intent_hash!
 *   AND output_no = :output_no!
 * ```
 */
export const deleteCreatedUnshielded = new PreparedQuery<IDeleteCreatedUnshieldedParams,IDeleteCreatedUnshieldedResult>(deleteCreatedUnshieldedIR);


/** 'IsUnshieldedCreated' parameters type */
export interface IIsUnshieldedCreatedParams {
  intent_hash: string;
  output_no: number;
  owner: string;
}

/** 'IsUnshieldedCreated' return type */
export interface IIsUnshieldedCreatedResult {
  present: number | null;
}

/** 'IsUnshieldedCreated' query type */
export interface IIsUnshieldedCreatedQuery {
  params: IIsUnshieldedCreatedParams;
  result: IIsUnshieldedCreatedResult;
}

const isUnshieldedCreatedIR: any = {"usedParamSet":{"owner":true,"intent_hash":true,"output_no":true},"params":[{"name":"owner","required":true,"transform":{"type":"scalar"},"locs":[{"a":58,"b":64}]},{"name":"intent_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":86,"b":98}]},{"name":"output_no","required":true,"transform":{"type":"scalar"},"locs":[{"a":118,"b":128}]}],"statement":"SELECT 1 AS present\nFROM created_unshielded\nWHERE owner = :owner!\n  AND intent_hash = :intent_hash!\n  AND output_no = :output_no!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 1 AS present
 * FROM created_unshielded
 * WHERE owner = :owner!
 *   AND intent_hash = :intent_hash!
 *   AND output_no = :output_no!
 * ```
 */
export const isUnshieldedCreated = new PreparedQuery<IIsUnshieldedCreatedParams,IIsUnshieldedCreatedResult>(isUnshieldedCreatedIR);



/** 'UpsertKnownRoot' parameters type */
export interface IUpsertKnownRootParams {
  height: NumberOrString;
  last_seen_ms: NumberOrString;
  root: string;
}

/** 'UpsertKnownRoot' return type */
export type IUpsertKnownRootResult = void;

/** 'UpsertKnownRoot' query type */
export interface IUpsertKnownRootQuery {
  params: IUpsertKnownRootParams;
  result: IUpsertKnownRootResult;
}

const upsertKnownRootIR: any = {"usedParamSet":{"root":true,"height":true,"last_seen_ms":true},"params":[{"name":"root","required":true,"transform":{"type":"scalar"},"locs":[{"a":252,"b":257}]},{"name":"height","required":true,"transform":{"type":"scalar"},"locs":[{"a":260,"b":267}]},{"name":"last_seen_ms","required":true,"transform":{"type":"scalar"},"locs":[{"a":270,"b":283}]}],"statement":"-- Record/refresh a coin-commitment tree root the chain has held (root-known\n-- set). last_seen_ms is the block time, used by PruneKnownRoots to age roots\n-- out of the on-chain root window.\nINSERT INTO known_roots (root, height, last_seen_ms)\nVALUES (:root!, :height!, :last_seen_ms!)\nON CONFLICT (root) DO UPDATE\n  SET height = EXCLUDED.height,\n      last_seen_ms = EXCLUDED.last_seen_ms"};

/**
 * Query generated from SQL:
 * ```
 * -- Record/refresh a coin-commitment tree root the chain has held (root-known
 * -- set). last_seen_ms is the block time, used by PruneKnownRoots to age roots
 * -- out of the on-chain root window.
 * INSERT INTO known_roots (root, height, last_seen_ms)
 * VALUES (:root!, :height!, :last_seen_ms!)
 * ON CONFLICT (root) DO UPDATE
 *   SET height = EXCLUDED.height,
 *       last_seen_ms = EXCLUDED.last_seen_ms
 * ```
 */
export const upsertKnownRoot = new PreparedQuery<IUpsertKnownRootParams,IUpsertKnownRootResult>(upsertKnownRootIR);



/** 'IsKnownRoot' parameters type */
export interface IIsKnownRootParams {
  root: string;
}

/** 'IsKnownRoot' return type */
export interface IIsKnownRootResult {
  present: number | null;
}

/** 'IsKnownRoot' query type */
export interface IIsKnownRootQuery {
  params: IIsKnownRootParams;
  result: IIsKnownRootResult;
}

const isKnownRootIR: any = {"usedParamSet":{"root":true},"params":[{"name":"root","required":true,"transform":{"type":"scalar"},"locs":[{"a":50,"b":55}]}],"statement":"SELECT 1 AS present\nFROM known_roots\nWHERE root = :root!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT 1 AS present
 * FROM known_roots
 * WHERE root = :root!
 * ```
 */
export const isKnownRoot = new PreparedQuery<IIsKnownRootParams,IIsKnownRootResult>(isKnownRootIR);



/** 'PruneKnownRoots' parameters type */
export interface IPruneKnownRootsParams {
  cutoff_ms: NumberOrString;
}

/** 'PruneKnownRoots' return type */
export type IPruneKnownRootsResult = void;

/** 'PruneKnownRoots' query type */
export interface IPruneKnownRootsQuery {
  params: IPruneKnownRootsParams;
  result: IPruneKnownRootsResult;
}

const pruneKnownRootsIR: any = {"usedParamSet":{"cutoff_ms":true},"params":[{"name":"cutoff_ms","required":true,"transform":{"type":"scalar"},"locs":[{"a":244,"b":254}]}],"statement":"-- Drop roots older than the window cutoff, but never the most recent root: on\n-- a quiet chain the latest root keeps being re-accepted, mirroring the\n-- ledger's past_roots re-insertion each block.\nDELETE FROM known_roots\nWHERE last_seen_ms < :cutoff_ms!\n  AND height < (SELECT MAX(height) FROM known_roots)"};

/**
 * Query generated from SQL:
 * ```
 * -- Drop roots older than the window cutoff, but never the most recent root: on
 * -- a quiet chain the latest root keeps being re-accepted, mirroring the
 * -- ledger's past_roots re-insertion each block.
 * DELETE FROM known_roots
 * WHERE last_seen_ms < :cutoff_ms!
 *   AND height < (SELECT MAX(height) FROM known_roots)
 * ```
 */
export const pruneKnownRoots = new PreparedQuery<IPruneKnownRootsParams,IPruneKnownRootsResult>(pruneKnownRootsIR);
