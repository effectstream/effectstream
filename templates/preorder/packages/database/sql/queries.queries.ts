/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

/** 'GetUser' parameters type */
export interface IGetUserParams {
  launchpad: string;
  wallet: string;
}

/** 'GetUser' return type */
export interface IGetUserResult {
  chain: string;
  last_participation_valid: boolean;
  last_referrer: string;
  launchpad: string;
  payment_token: string;
  total_amount: string;
  wallet: string;
}

/** 'GetUser' query type */
export interface IGetUserQuery {
  params: IGetUserParams;
  result: IGetUserResult;
}

const getUserIR: any = {"usedParamSet":{"launchpad":true,"wallet":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":58}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":73,"b":80}]}],"statement":"SELECT * FROM launchpad_users\nWHERE launchpad = :launchpad! AND wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM launchpad_users
 * WHERE launchpad = :launchpad! AND wallet = :wallet!
 * ```
 */
export const getUser = new PreparedQuery<IGetUserParams,IGetUserResult>(getUserIR);


/** 'UpsertUser' parameters type */
export interface IUpsertUserParams {
  chain: string;
  last_participation_valid: boolean;
  last_referrer: string;
  launchpad: string;
  payment_token: string;
  total_amount: string;
  wallet: string;
}

/** 'UpsertUser' return type */
export type IUpsertUserResult = void;

/** 'UpsertUser' query type */
export interface IUpsertUserQuery {
  params: IUpsertUserParams;
  result: IUpsertUserResult;
}

const upsertUserIR: any = {"usedParamSet":{"launchpad":true,"wallet":true,"payment_token":true,"total_amount":true,"last_referrer":true,"last_participation_valid":true,"chain":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":133,"b":143}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":146,"b":153}]},{"name":"payment_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":156,"b":170}]},{"name":"total_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":173,"b":186},{"a":360,"b":373}]},{"name":"last_referrer","required":true,"transform":{"type":"scalar"},"locs":[{"a":189,"b":203},{"a":413,"b":427}]},{"name":"last_participation_valid","required":true,"transform":{"type":"scalar"},"locs":[{"a":206,"b":231},{"a":459,"b":484}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":234,"b":240}]}],"statement":"INSERT INTO launchpad_users (launchpad, wallet, payment_token, total_amount, last_referrer, last_participation_valid, chain)\nVALUES (:launchpad!, :wallet!, :payment_token!, :total_amount!, :last_referrer!, :last_participation_valid!, :chain!)\nON CONFLICT (launchpad, wallet)\nDO UPDATE SET\n  total_amount = (CAST(launchpad_users.total_amount AS NUMERIC) + CAST(:total_amount! AS NUMERIC))::TEXT,\n  last_referrer = :last_referrer!,\n  last_participation_valid = :last_participation_valid!"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO launchpad_users (launchpad, wallet, payment_token, total_amount, last_referrer, last_participation_valid, chain)
 * VALUES (:launchpad!, :wallet!, :payment_token!, :total_amount!, :last_referrer!, :last_participation_valid!, :chain!)
 * ON CONFLICT (launchpad, wallet)
 * DO UPDATE SET
 *   total_amount = (CAST(launchpad_users.total_amount AS NUMERIC) + CAST(:total_amount! AS NUMERIC))::TEXT,
 *   last_referrer = :last_referrer!,
 *   last_participation_valid = :last_participation_valid!
 * ```
 */
export const upsertUser = new PreparedQuery<IUpsertUserParams,IUpsertUserResult>(upsertUserIR);


/** 'InsertParticipation' parameters type */
export interface IInsertParticipationParams {
  block_height: number;
  chain: string;
  item_ids: string;
  item_quantities: string;
  launchpad: string;
  participation_valid: boolean;
  payment_amount: string;
  payment_token: string;
  preconditions_met: boolean;
  referrer: string;
  tx_hash: string;
  wallet: string;
}

/** 'InsertParticipation' return type */
export type IInsertParticipationResult = void;

/** 'InsertParticipation' query type */
export interface IInsertParticipationQuery {
  params: IInsertParticipationParams;
  result: IInsertParticipationResult;
}

const insertParticipationIR: any = {"usedParamSet":{"launchpad":true,"wallet":true,"payment_token":true,"payment_amount":true,"referrer":true,"item_ids":true,"item_quantities":true,"tx_hash":true,"block_height":true,"preconditions_met":true,"participation_valid":true,"chain":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":203,"b":213}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":216,"b":223}]},{"name":"payment_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":226,"b":240}]},{"name":"payment_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":243,"b":258}]},{"name":"referrer","required":true,"transform":{"type":"scalar"},"locs":[{"a":261,"b":270}]},{"name":"item_ids","required":true,"transform":{"type":"scalar"},"locs":[{"a":273,"b":282}]},{"name":"item_quantities","required":true,"transform":{"type":"scalar"},"locs":[{"a":285,"b":301}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":304,"b":312}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":315,"b":328}]},{"name":"preconditions_met","required":true,"transform":{"type":"scalar"},"locs":[{"a":331,"b":349}]},{"name":"participation_valid","required":true,"transform":{"type":"scalar"},"locs":[{"a":352,"b":372}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":375,"b":381}]}],"statement":"INSERT INTO launchpad_participations (launchpad, wallet, payment_token, payment_amount, referrer, item_ids, item_quantities, tx_hash, block_height, preconditions_met, participation_valid, chain)\nVALUES (:launchpad!, :wallet!, :payment_token!, :payment_amount!, :referrer!, :item_ids!, :item_quantities!, :tx_hash!, :block_height!, :preconditions_met!, :participation_valid!, :chain!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO launchpad_participations (launchpad, wallet, payment_token, payment_amount, referrer, item_ids, item_quantities, tx_hash, block_height, preconditions_met, participation_valid, chain)
 * VALUES (:launchpad!, :wallet!, :payment_token!, :payment_amount!, :referrer!, :item_ids!, :item_quantities!, :tx_hash!, :block_height!, :preconditions_met!, :participation_valid!, :chain!)
 * ```
 */
export const insertParticipation = new PreparedQuery<IInsertParticipationParams,IInsertParticipationResult>(insertParticipationIR);


/** 'GetParticipations' parameters type */
export interface IGetParticipationsParams {
  launchpad: string;
  wallet: string;
}

/** 'GetParticipations' return type */
export interface IGetParticipationsResult {
  block_height: number;
  chain: string;
  item_ids: string;
  item_quantities: string;
  launchpad: string;
  participation_valid: boolean;
  payment_amount: string;
  payment_token: string;
  preconditions_met: boolean;
  referrer: string;
  tx_hash: string;
  wallet: string;
}

/** 'GetParticipations' query type */
export interface IGetParticipationsQuery {
  params: IGetParticipationsParams;
  result: IGetParticipationsResult;
}

const getParticipationsIR: any = {"usedParamSet":{"launchpad":true,"wallet":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":57,"b":67}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":89}]}],"statement":"SELECT * FROM launchpad_participations\nWHERE launchpad = :launchpad! AND wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM launchpad_participations
 * WHERE launchpad = :launchpad! AND wallet = :wallet!
 * ```
 */
export const getParticipations = new PreparedQuery<IGetParticipationsParams,IGetParticipationsResult>(getParticipationsIR);


/** 'InsertUserItems' parameters type */
export interface IInsertUserItemsParams {
  item_id: number;
  launchpad: string;
  quantity: number;
  wallet: string;
}

/** 'InsertUserItems' return type */
export type IInsertUserItemsResult = void;

/** 'InsertUserItems' query type */
export interface IInsertUserItemsQuery {
  params: IInsertUserItemsParams;
  result: IInsertUserItemsResult;
}

const insertUserItemsIR: any = {"usedParamSet":{"launchpad":true,"wallet":true,"item_id":true,"quantity":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":80,"b":90}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":93,"b":100}]},{"name":"item_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":111}]},{"name":"quantity","required":true,"transform":{"type":"scalar"},"locs":[{"a":114,"b":123},{"a":192,"b":201}]}],"statement":"INSERT INTO launchpad_user_items (launchpad, wallet, item_id, quantity)\nVALUES (:launchpad!, :wallet!, :item_id!, :quantity!)\nON CONFLICT (launchpad, wallet, item_id)\nDO UPDATE SET quantity = :quantity!"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO launchpad_user_items (launchpad, wallet, item_id, quantity)
 * VALUES (:launchpad!, :wallet!, :item_id!, :quantity!)
 * ON CONFLICT (launchpad, wallet, item_id)
 * DO UPDATE SET quantity = :quantity!
 * ```
 */
export const insertUserItems = new PreparedQuery<IInsertUserItemsParams,IInsertUserItemsResult>(insertUserItemsIR);


/** 'DeleteUserItems' parameters type */
export interface IDeleteUserItemsParams {
  launchpad: string;
  wallet: string;
}

/** 'DeleteUserItems' return type */
export type IDeleteUserItemsResult = void;

/** 'DeleteUserItems' query type */
export interface IDeleteUserItemsQuery {
  params: IDeleteUserItemsParams;
  result: IDeleteUserItemsResult;
}

const deleteUserItemsIR: any = {"usedParamSet":{"launchpad":true,"wallet":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":51,"b":61}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":76,"b":83}]}],"statement":"DELETE FROM launchpad_user_items\nWHERE launchpad = :launchpad! AND wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * DELETE FROM launchpad_user_items
 * WHERE launchpad = :launchpad! AND wallet = :wallet!
 * ```
 */
export const deleteUserItems = new PreparedQuery<IDeleteUserItemsParams,IDeleteUserItemsResult>(deleteUserItemsIR);


/** 'GetUserItems' parameters type */
export interface IGetUserItemsParams {
  launchpad: string;
  wallet: string;
}

/** 'GetUserItems' return type */
export interface IGetUserItemsResult {
  item_id: number;
  launchpad: string;
  quantity: number;
  wallet: string;
}

/** 'GetUserItems' query type */
export interface IGetUserItemsQuery {
  params: IGetUserItemsParams;
  result: IGetUserItemsResult;
}

const getUserItemsIR: any = {"usedParamSet":{"launchpad":true,"wallet":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":53,"b":63}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":85}]}],"statement":"SELECT * FROM launchpad_user_items\nWHERE launchpad = :launchpad! AND wallet = :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM launchpad_user_items
 * WHERE launchpad = :launchpad! AND wallet = :wallet!
 * ```
 */
export const getUserItems = new PreparedQuery<IGetUserItemsParams,IGetUserItemsResult>(getUserItemsIR);


/** 'GetParticipatedAmountTotal' parameters type */
export interface IGetParticipatedAmountTotalParams {
  launchpad: string;
  payment_token: string;
  wallet: string;
}

/** 'GetParticipatedAmountTotal' return type */
export interface IGetParticipatedAmountTotalResult {
  sum: string | null;
}

/** 'GetParticipatedAmountTotal' query type */
export interface IGetParticipatedAmountTotalQuery {
  params: IGetParticipatedAmountTotalParams;
  result: IGetParticipatedAmountTotalResult;
}

const getParticipatedAmountTotalIR: any = {"usedParamSet":{"launchpad":true,"wallet":true,"payment_token":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":122}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":137,"b":144}]},{"name":"payment_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":166,"b":180}]}],"statement":"SELECT COALESCE(SUM(CAST(payment_amount AS NUMERIC)), 0) AS sum\nFROM launchpad_participations\nWHERE launchpad = :launchpad! AND wallet = :wallet! AND payment_token = :payment_token! AND participation_valid = true"};

/**
 * Query generated from SQL:
 * ```
 * SELECT COALESCE(SUM(CAST(payment_amount AS NUMERIC)), 0) AS sum
 * FROM launchpad_participations
 * WHERE launchpad = :launchpad! AND wallet = :wallet! AND payment_token = :payment_token! AND participation_valid = true
 * ```
 */
export const getParticipatedAmountTotal = new PreparedQuery<IGetParticipatedAmountTotalParams,IGetParticipatedAmountTotalResult>(getParticipatedAmountTotalIR);


/** 'GetItemsPurchasedQuantityExceptUser' parameters type */
export interface IGetItemsPurchasedQuantityExceptUserParams {
  item_id: number;
  launchpad: string;
  wallet: string;
}

/** 'GetItemsPurchasedQuantityExceptUser' return type */
export interface IGetItemsPurchasedQuantityExceptUserResult {
  sum: string | null;
}

/** 'GetItemsPurchasedQuantityExceptUser' query type */
export interface IGetItemsPurchasedQuantityExceptUserQuery {
  params: IGetItemsPurchasedQuantityExceptUserParams;
  result: IGetItemsPurchasedQuantityExceptUserResult;
}

const getItemsPurchasedQuantityExceptUserIR: any = {"usedParamSet":{"launchpad":true,"item_id":true,"wallet":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":85,"b":95}]},{"name":"item_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":111,"b":119}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":142}]}],"statement":"SELECT COALESCE(SUM(quantity), 0) AS sum\nFROM launchpad_user_items\nWHERE launchpad = :launchpad! AND item_id = :item_id! AND wallet != :wallet!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT COALESCE(SUM(quantity), 0) AS sum
 * FROM launchpad_user_items
 * WHERE launchpad = :launchpad! AND item_id = :item_id! AND wallet != :wallet!
 * ```
 */
export const getItemsPurchasedQuantityExceptUser = new PreparedQuery<IGetItemsPurchasedQuantityExceptUserParams,IGetItemsPurchasedQuantityExceptUserResult>(getItemsPurchasedQuantityExceptUserIR);


/** 'GetAllItemsPurchasedQuantity' parameters type */
export interface IGetAllItemsPurchasedQuantityParams {
  launchpad: string;
}

/** 'GetAllItemsPurchasedQuantity' return type */
export interface IGetAllItemsPurchasedQuantityResult {
  item_id: number;
  sum: string | null;
}

/** 'GetAllItemsPurchasedQuantity' query type */
export interface IGetAllItemsPurchasedQuantityQuery {
  params: IGetAllItemsPurchasedQuantityParams;
  result: IGetAllItemsPurchasedQuantityResult;
}

const getAllItemsPurchasedQuantityIR: any = {"usedParamSet":{"launchpad":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":81,"b":91}]}],"statement":"SELECT item_id, SUM(quantity) AS sum\nFROM launchpad_user_items\nWHERE launchpad = :launchpad!\nGROUP BY item_id"};

/**
 * Query generated from SQL:
 * ```
 * SELECT item_id, SUM(quantity) AS sum
 * FROM launchpad_user_items
 * WHERE launchpad = :launchpad!
 * GROUP BY item_id
 * ```
 */
export const getAllItemsPurchasedQuantity = new PreparedQuery<IGetAllItemsPurchasedQuantityParams,IGetAllItemsPurchasedQuantityResult>(getAllItemsPurchasedQuantityIR);


/** 'InsertCardanoPayment' parameters type */
export interface IInsertCardanoPaymentParams {
  amount: string;
  block_height: number;
  output_index: number;
  payment_address: string;
  tx_hash: string;
}

/** 'InsertCardanoPayment' return type */
export type IInsertCardanoPaymentResult = void;

/** 'InsertCardanoPayment' query type */
export interface IInsertCardanoPaymentQuery {
  params: IInsertCardanoPaymentParams;
  result: IInsertCardanoPaymentResult;
}

const insertCardanoPaymentIR: any = {"usedParamSet":{"tx_hash":true,"output_index":true,"payment_address":true,"amount":true,"block_height":true},"params":[{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":108}]},{"name":"output_index","required":true,"transform":{"type":"scalar"},"locs":[{"a":111,"b":124}]},{"name":"payment_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":127,"b":143}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":146,"b":153}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":156,"b":169}]}],"statement":"INSERT INTO cardano_payments (tx_hash, output_index, payment_address, amount, block_height)\nVALUES (:tx_hash!, :output_index!, :payment_address!, :amount!, :block_height!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO cardano_payments (tx_hash, output_index, payment_address, amount, block_height)
 * VALUES (:tx_hash!, :output_index!, :payment_address!, :amount!, :block_height!)
 * ```
 */
export const insertCardanoPayment = new PreparedQuery<IInsertCardanoPaymentParams,IInsertCardanoPaymentResult>(insertCardanoPaymentIR);


/** 'GetRefunds' parameters type */
export interface IGetRefundsParams {
  launchpad: string;
  wallet: string;
}

/** 'GetRefunds' return type */
export interface IGetRefundsResult {
  block_height: number;
  chain: string;
  item_ids: string;
  item_quantities: string;
  launchpad: string;
  participation_valid: boolean;
  payment_amount: string;
  payment_token: string;
  preconditions_met: boolean;
  referrer: string;
  tx_hash: string;
  wallet: string;
}

/** 'GetRefunds' query type */
export interface IGetRefundsQuery {
  params: IGetRefundsParams;
  result: IGetRefundsResult;
}

const getRefundsIR: any = {"usedParamSet":{"launchpad":true,"wallet":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":57,"b":67}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":89}]}],"statement":"SELECT * FROM launchpad_participations\nWHERE launchpad = :launchpad! AND wallet = :wallet! AND participation_valid = false AND preconditions_met = true"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM launchpad_participations
 * WHERE launchpad = :launchpad! AND wallet = :wallet! AND participation_valid = false AND preconditions_met = true
 * ```
 */
export const getRefunds = new PreparedQuery<IGetRefundsParams,IGetRefundsResult>(getRefundsIR);


/** 'GetCardanoPayments' parameters type */
export interface IGetCardanoPaymentsParams {
  payment_address: string;
}

/** 'GetCardanoPayments' return type */
export interface IGetCardanoPaymentsResult {
  amount: string;
  block_height: number;
  output_index: number;
  payment_address: string;
  tx_hash: string;
}

/** 'GetCardanoPayments' query type */
export interface IGetCardanoPaymentsQuery {
  params: IGetCardanoPaymentsParams;
  result: IGetCardanoPaymentsResult;
}

const getCardanoPaymentsIR: any = {"usedParamSet":{"payment_address":true},"params":[{"name":"payment_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":71}]}],"statement":"SELECT * FROM cardano_payments\nWHERE payment_address = :payment_address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM cardano_payments
 * WHERE payment_address = :payment_address!
 * ```
 */
export const getCardanoPayments = new PreparedQuery<IGetCardanoPaymentsParams,IGetCardanoPaymentsResult>(getCardanoPaymentsIR);


