/** Types generated for queries found in "src/sql/update.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'LvlUpCharacter' parameters type */
export interface ILvlUpCharacterParams {
  address: string;
  nft_id: string;
}

/** 'LvlUpCharacter' return type */
export type ILvlUpCharacterResult = void;

/** 'LvlUpCharacter' query type */
export interface ILvlUpCharacterQuery {
  params: ILvlUpCharacterParams;
  result: ILvlUpCharacterResult;
}

const lvlUpCharacterIR: any = {"usedParamSet":{"nft_id":true,"address":true},"params":[{"name":"nft_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":62}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":86}]}],"statement":"UPDATE characters\nSET\nlevel = level + 1\nWHERE nft_id = :nft_id! AND address = :address!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE characters
 * SET
 * level = level + 1
 * WHERE nft_id = :nft_id! AND address = :address!
 * ```
 */
export const lvlUpCharacter = new PreparedQuery<ILvlUpCharacterParams,ILvlUpCharacterResult>(lvlUpCharacterIR);


