/** Types generated for queries found in "src/sql/insert.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

import type { NftType } from '../../../common.ts';

/** 'CreateCharacter' parameters type */
export interface ICreateCharacterParams {
  address: string;
  nft_id: string;
  type: NftType;
}

/** 'CreateCharacter' return type */
export type ICreateCharacterResult = void;

/** 'CreateCharacter' query type */
export interface ICreateCharacterQuery {
  params: ICreateCharacterParams;
  result: ICreateCharacterResult;
}

const createCharacterIR: any = {"usedParamSet":{"address":true,"nft_id":true,"type":true},"params":[{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":81}]},{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":86,"b":93}]},{"name":"type","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":108}]}],"statement":"INSERT INTO characters(\n  address,\n  nft_id,\n  level,\n  type)\nVALUES (\n  :address!,\n  :nft_id!,\n  1,\n  :type!)\nON CONFLICT (address, nft_id) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO characters(
 *   address,
 *   nft_id,
 *   level,
 *   type)
 * VALUES (
 *   :address!,
 *   :nft_id!,
 *   1,
 *   :type!)
 * ON CONFLICT (address, nft_id) DO NOTHING
 * ```
 */
export const createCharacter = new PreparedQuery<ICreateCharacterParams,ICreateCharacterResult>(createCharacterIR);


