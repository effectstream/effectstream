/** Types generated for queries found in "src/sql/select.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { NftType } from '../../../common.ts';

/** 'GetUserCharacters' parameters type */
export interface IGetUserCharactersParams {
  address: string;
}

/** 'GetUserCharacters' return type */
export interface IGetUserCharactersResult {
  address: string;
  level: number;
  nft_id: string;
  type: NftType;
}

/** 'GetUserCharacters' query type */
export interface IGetUserCharactersQuery {
  params: IGetUserCharactersParams;
  result: IGetUserCharactersResult;
}

const getUserCharactersIR: any = {"usedParamSet":{"address":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":49}]}],"statement":"SELECT * FROM characters\nWHERE address = :address!\nORDER BY nft_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM characters
 * WHERE address = :address!
 * ORDER BY nft_id
 * ```
 */
export const getUserCharacters = new PreparedQuery<IGetUserCharactersParams,IGetUserCharactersResult>(getUserCharactersIR);


/** 'GetCharacter' parameters type */
export interface IGetCharacterParams {
  address: string;
  nft_id: string;
}

/** 'GetCharacter' return type */
export interface IGetCharacterResult {
  address: string;
  level: number;
  nft_id: string;
  type: NftType;
}

/** 'GetCharacter' query type */
export interface IGetCharacterQuery {
  params: IGetCharacterParams;
  result: IGetCharacterResult;
}

const getCharacterIR: any = {"usedParamSet":{"address":true,"nft_id":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":49}]},{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":71}]}],"statement":"SELECT * FROM characters\nWHERE address = :address! AND nft_id = :nft_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM characters
 * WHERE address = :address! AND nft_id = :nft_id!
 * ```
 */
export const getCharacter = new PreparedQuery<IGetCharacterParams,IGetCharacterResult>(getCharacterIR);


/** 'GetCharacterByNftId' parameters type */
export interface IGetCharacterByNftIdParams {
  nft_id: string;
}

/** 'GetCharacterByNftId' return type */
export interface IGetCharacterByNftIdResult {
  address: string;
  level: number;
  nft_id: string;
  type: NftType;
}

/** 'GetCharacterByNftId' query type */
export interface IGetCharacterByNftIdQuery {
  params: IGetCharacterByNftIdParams;
  result: IGetCharacterByNftIdResult;
}

const getCharacterByNftIdIR: any = {"usedParamSet":{"nft_id":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":47}]}],"statement":"SELECT * FROM characters\nWHERE nft_id = :nft_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM characters
 * WHERE nft_id = :nft_id!
 * ```
 */
export const getCharacterByNftId = new PreparedQuery<IGetCharacterByNftIdParams,IGetCharacterByNftIdResult>(getCharacterByNftIdIR);


