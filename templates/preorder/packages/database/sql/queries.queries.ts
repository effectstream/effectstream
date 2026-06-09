/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

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


/** 'UpsertCampaign' parameters type */
export interface IUpsertCampaignParams {
  admin: string;
  campaign_id: string;
  cardano_payment_address?: string | null | void;
  cardano_payment_address_hex?: string | null | void;
  created_block: number;
  description: string;
  image?: string | null | void;
  launchpad_address: string;
  name: string;
  receiver: string;
  referral_discount_bps: number;
  referrer_reward_bps: number;
  slug: string;
  status: string;
  ts_end_sale: NumberOrString;
  ts_start_public: NumberOrString;
  ts_start_whitelist?: NumberOrString | null | void;
}

/** 'UpsertCampaign' return type */
export type IUpsertCampaignResult = void;

/** 'UpsertCampaign' query type */
export interface IUpsertCampaignQuery {
  params: IUpsertCampaignParams;
  result: IUpsertCampaignResult;
}

const upsertCampaignIR: any = {"usedParamSet":{"campaign_id":true,"slug":true,"name":true,"description":true,"image":true,"launchpad_address":true,"receiver":true,"cardano_payment_address":true,"cardano_payment_address_hex":true,"referral_discount_bps":true,"referrer_reward_bps":true,"ts_start_whitelist":true,"ts_start_public":true,"ts_end_sale":true,"status":true,"admin":true,"created_block":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":305,"b":317}]},{"name":"slug","required":true,"transform":{"type":"scalar"},"locs":[{"a":320,"b":325},{"a":643,"b":648}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":328,"b":333},{"a":658,"b":663}]},{"name":"description","required":true,"transform":{"type":"scalar"},"locs":[{"a":336,"b":348},{"a":680,"b":692}]},{"name":"image","required":false,"transform":{"type":"scalar"},"locs":[{"a":351,"b":356},{"a":703,"b":708}]},{"name":"launchpad_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":359,"b":377},{"a":733,"b":751}]},{"name":"receiver","required":true,"transform":{"type":"scalar"},"locs":[{"a":380,"b":389},{"a":765,"b":774}]},{"name":"cardano_payment_address","required":false,"transform":{"type":"scalar"},"locs":[{"a":394,"b":417},{"a":805,"b":828}]},{"name":"cardano_payment_address_hex","required":false,"transform":{"type":"scalar"},"locs":[{"a":420,"b":447},{"a":863,"b":890}]},{"name":"referral_discount_bps","required":true,"transform":{"type":"scalar"},"locs":[{"a":450,"b":472},{"a":919,"b":941}]},{"name":"referrer_reward_bps","required":true,"transform":{"type":"scalar"},"locs":[{"a":477,"b":497},{"a":966,"b":986}]},{"name":"ts_start_whitelist","required":false,"transform":{"type":"scalar"},"locs":[{"a":500,"b":518},{"a":1012,"b":1030}]},{"name":"ts_start_public","required":true,"transform":{"type":"scalar"},"locs":[{"a":521,"b":537},{"a":1051,"b":1067}]},{"name":"ts_end_sale","required":true,"transform":{"type":"scalar"},"locs":[{"a":540,"b":552},{"a":1086,"b":1098}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":555,"b":562},{"a":1110,"b":1117}]},{"name":"admin","required":true,"transform":{"type":"scalar"},"locs":[{"a":567,"b":573},{"a":1128,"b":1134}]},{"name":"created_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":576,"b":590}]}],"statement":"INSERT INTO offchain_campaigns (\n  campaign_id, slug, name, description, image, launchpad_address, receiver,\n  cardano_payment_address, cardano_payment_address_hex, referral_discount_bps,\n  referrer_reward_bps, ts_start_whitelist, ts_start_public, ts_end_sale, status,\n  admin, created_block\n) VALUES (\n  :campaign_id!, :slug!, :name!, :description!, :image, :launchpad_address!, :receiver!,\n  :cardano_payment_address, :cardano_payment_address_hex, :referral_discount_bps!,\n  :referrer_reward_bps!, :ts_start_whitelist, :ts_start_public!, :ts_end_sale!, :status!,\n  :admin!, :created_block!\n)\nON CONFLICT (campaign_id) DO UPDATE SET\n  slug = :slug!, name = :name!, description = :description!, image = :image,\n  launchpad_address = :launchpad_address!, receiver = :receiver!,\n  cardano_payment_address = :cardano_payment_address,\n  cardano_payment_address_hex = :cardano_payment_address_hex,\n  referral_discount_bps = :referral_discount_bps!, referrer_reward_bps = :referrer_reward_bps!,\n  ts_start_whitelist = :ts_start_whitelist, ts_start_public = :ts_start_public!,\n  ts_end_sale = :ts_end_sale!, status = :status!, admin = :admin!"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offchain_campaigns (
 *   campaign_id, slug, name, description, image, launchpad_address, receiver,
 *   cardano_payment_address, cardano_payment_address_hex, referral_discount_bps,
 *   referrer_reward_bps, ts_start_whitelist, ts_start_public, ts_end_sale, status,
 *   admin, created_block
 * ) VALUES (
 *   :campaign_id!, :slug!, :name!, :description!, :image, :launchpad_address!, :receiver!,
 *   :cardano_payment_address, :cardano_payment_address_hex, :referral_discount_bps!,
 *   :referrer_reward_bps!, :ts_start_whitelist, :ts_start_public!, :ts_end_sale!, :status!,
 *   :admin!, :created_block!
 * )
 * ON CONFLICT (campaign_id) DO UPDATE SET
 *   slug = :slug!, name = :name!, description = :description!, image = :image,
 *   launchpad_address = :launchpad_address!, receiver = :receiver!,
 *   cardano_payment_address = :cardano_payment_address,
 *   cardano_payment_address_hex = :cardano_payment_address_hex,
 *   referral_discount_bps = :referral_discount_bps!, referrer_reward_bps = :referrer_reward_bps!,
 *   ts_start_whitelist = :ts_start_whitelist, ts_start_public = :ts_start_public!,
 *   ts_end_sale = :ts_end_sale!, status = :status!, admin = :admin!
 * ```
 */
export const upsertCampaign = new PreparedQuery<IUpsertCampaignParams,IUpsertCampaignResult>(upsertCampaignIR);


/** 'EndCampaign' parameters type */
export interface IEndCampaignParams {
  campaign_id: string;
}

/** 'EndCampaign' return type */
export type IEndCampaignResult = void;

/** 'EndCampaign' query type */
export interface IEndCampaignQuery {
  params: IEndCampaignParams;
  result: IEndCampaignResult;
}

const endCampaignIR: any = {"usedParamSet":{"campaign_id":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":67,"b":79}]}],"statement":"UPDATE offchain_campaigns SET status = 'ended' WHERE campaign_id = :campaign_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE offchain_campaigns SET status = 'ended' WHERE campaign_id = :campaign_id!
 * ```
 */
export const endCampaign = new PreparedQuery<IEndCampaignParams,IEndCampaignResult>(endCampaignIR);


/** 'GetCampaignByReceiver' parameters type */
export interface IGetCampaignByReceiverParams {
  receiver: string;
}

/** 'GetCampaignByReceiver' return type */
export interface IGetCampaignByReceiverResult {
  admin: string;
  campaign_id: string;
  cardano_payment_address: string | null;
  cardano_payment_address_hex: string | null;
  created_block: number;
  description: string;
  image: string | null;
  launchpad_address: string;
  name: string;
  receiver: string;
  referral_discount_bps: number;
  referrer_reward_bps: number;
  slug: string;
  status: string;
  ts_end_sale: string;
  ts_start_public: string;
  ts_start_whitelist: string | null;
}

/** 'GetCampaignByReceiver' query type */
export interface IGetCampaignByReceiverQuery {
  params: IGetCampaignByReceiverParams;
  result: IGetCampaignByReceiverResult;
}

const getCampaignByReceiverIR: any = {"usedParamSet":{"receiver":true},"params":[{"name":"receiver","required":true,"transform":{"type":"scalar"},"locs":[{"a":50,"b":59}]}],"statement":"SELECT * FROM offchain_campaigns WHERE receiver = :receiver! AND status = 'active'"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_campaigns WHERE receiver = :receiver! AND status = 'active'
 * ```
 */
export const getCampaignByReceiver = new PreparedQuery<IGetCampaignByReceiverParams,IGetCampaignByReceiverResult>(getCampaignByReceiverIR);


/** 'GetActiveCampaign' parameters type */
export type IGetActiveCampaignParams = void;

/** 'GetActiveCampaign' return type */
export interface IGetActiveCampaignResult {
  admin: string;
  campaign_id: string;
  cardano_payment_address: string | null;
  cardano_payment_address_hex: string | null;
  created_block: number;
  description: string;
  image: string | null;
  launchpad_address: string;
  name: string;
  receiver: string;
  referral_discount_bps: number;
  referrer_reward_bps: number;
  slug: string;
  status: string;
  ts_end_sale: string;
  ts_start_public: string;
  ts_start_whitelist: string | null;
}

/** 'GetActiveCampaign' query type */
export interface IGetActiveCampaignQuery {
  params: IGetActiveCampaignParams;
  result: IGetActiveCampaignResult;
}

const getActiveCampaignIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM offchain_campaigns WHERE status = 'active' ORDER BY created_block ASC LIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_campaigns WHERE status = 'active' ORDER BY created_block ASC LIMIT 1
 * ```
 */
export const getActiveCampaign = new PreparedQuery<IGetActiveCampaignParams,IGetActiveCampaignResult>(getActiveCampaignIR);


/** 'GetCampaignBySlug' parameters type */
export interface IGetCampaignBySlugParams {
  slug: string;
}

/** 'GetCampaignBySlug' return type */
export interface IGetCampaignBySlugResult {
  admin: string;
  campaign_id: string;
  cardano_payment_address: string | null;
  cardano_payment_address_hex: string | null;
  created_block: number;
  description: string;
  image: string | null;
  launchpad_address: string;
  name: string;
  receiver: string;
  referral_discount_bps: number;
  referrer_reward_bps: number;
  slug: string;
  status: string;
  ts_end_sale: string;
  ts_start_public: string;
  ts_start_whitelist: string | null;
}

/** 'GetCampaignBySlug' query type */
export interface IGetCampaignBySlugQuery {
  params: IGetCampaignBySlugParams;
  result: IGetCampaignBySlugResult;
}

const getCampaignBySlugIR: any = {"usedParamSet":{"slug":true},"params":[{"name":"slug","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":51}]}],"statement":"SELECT * FROM offchain_campaigns WHERE slug = :slug!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_campaigns WHERE slug = :slug!
 * ```
 */
export const getCampaignBySlug = new PreparedQuery<IGetCampaignBySlugParams,IGetCampaignBySlugResult>(getCampaignBySlugIR);


/** 'GetCampaignById' parameters type */
export interface IGetCampaignByIdParams {
  campaign_id: string;
}

/** 'GetCampaignById' return type */
export interface IGetCampaignByIdResult {
  admin: string;
  campaign_id: string;
  cardano_payment_address: string | null;
  cardano_payment_address_hex: string | null;
  created_block: number;
  description: string;
  image: string | null;
  launchpad_address: string;
  name: string;
  receiver: string;
  referral_discount_bps: number;
  referrer_reward_bps: number;
  slug: string;
  status: string;
  ts_end_sale: string;
  ts_start_public: string;
  ts_start_whitelist: string | null;
}

/** 'GetCampaignById' query type */
export interface IGetCampaignByIdQuery {
  params: IGetCampaignByIdParams;
  result: IGetCampaignByIdResult;
}

const getCampaignByIdIR: any = {"usedParamSet":{"campaign_id":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":53,"b":65}]}],"statement":"SELECT * FROM offchain_campaigns WHERE campaign_id = :campaign_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_campaigns WHERE campaign_id = :campaign_id!
 * ```
 */
export const getCampaignById = new PreparedQuery<IGetCampaignByIdParams,IGetCampaignByIdResult>(getCampaignByIdIR);


/** 'GetAllCampaigns' parameters type */
export type IGetAllCampaignsParams = void;

/** 'GetAllCampaigns' return type */
export interface IGetAllCampaignsResult {
  admin: string;
  campaign_id: string;
  cardano_payment_address: string | null;
  cardano_payment_address_hex: string | null;
  created_block: number;
  description: string;
  image: string | null;
  launchpad_address: string;
  name: string;
  receiver: string;
  referral_discount_bps: number;
  referrer_reward_bps: number;
  slug: string;
  status: string;
  ts_end_sale: string;
  ts_start_public: string;
  ts_start_whitelist: string | null;
}

/** 'GetAllCampaigns' query type */
export interface IGetAllCampaignsQuery {
  params: IGetAllCampaignsParams;
  result: IGetAllCampaignsResult;
}

const getAllCampaignsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM offchain_campaigns ORDER BY created_block ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_campaigns ORDER BY created_block ASC
 * ```
 */
export const getAllCampaigns = new PreparedQuery<IGetAllCampaignsParams,IGetAllCampaignsResult>(getAllCampaignsIR);


/** 'UpsertProduct' parameters type */
export interface IUpsertProductParams {
  campaign_id: string;
  description: string;
  image?: string | null | void;
  item_id: number;
  kind: string;
  name: string;
  price: NumberOrString;
  supply?: number | null | void;
}

/** 'UpsertProduct' return type */
export type IUpsertProductResult = void;

/** 'UpsertProduct' query type */
export interface IUpsertProductQuery {
  params: IUpsertProductParams;
  result: IUpsertProductResult;
}

const upsertProductIR: any = {"usedParamSet":{"campaign_id":true,"item_id":true,"name":true,"description":true,"image":true,"supply":true,"kind":true,"price":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":108,"b":120}]},{"name":"item_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":123,"b":131}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":134,"b":139},{"a":249,"b":254}]},{"name":"description","required":true,"transform":{"type":"scalar"},"locs":[{"a":142,"b":154},{"a":271,"b":283}]},{"name":"image","required":false,"transform":{"type":"scalar"},"locs":[{"a":157,"b":162},{"a":294,"b":299}]},{"name":"supply","required":false,"transform":{"type":"scalar"},"locs":[{"a":165,"b":171},{"a":311,"b":317}]},{"name":"kind","required":true,"transform":{"type":"scalar"},"locs":[{"a":174,"b":179},{"a":327,"b":332}]},{"name":"price","required":true,"transform":{"type":"scalar"},"locs":[{"a":182,"b":188},{"a":343,"b":349}]}],"statement":"INSERT INTO offchain_products (campaign_id, item_id, name, description, image, supply, kind, price)\nVALUES (:campaign_id!, :item_id!, :name!, :description!, :image, :supply, :kind!, :price!)\nON CONFLICT (campaign_id, item_id) DO UPDATE SET\n  name = :name!, description = :description!, image = :image, supply = :supply, kind = :kind!, price = :price!"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offchain_products (campaign_id, item_id, name, description, image, supply, kind, price)
 * VALUES (:campaign_id!, :item_id!, :name!, :description!, :image, :supply, :kind!, :price!)
 * ON CONFLICT (campaign_id, item_id) DO UPDATE SET
 *   name = :name!, description = :description!, image = :image, supply = :supply, kind = :kind!, price = :price!
 * ```
 */
export const upsertProduct = new PreparedQuery<IUpsertProductParams,IUpsertProductResult>(upsertProductIR);


/** 'GetProductsByCampaign' parameters type */
export interface IGetProductsByCampaignParams {
  campaign_id: string;
}

/** 'GetProductsByCampaign' return type */
export interface IGetProductsByCampaignResult {
  campaign_id: string;
  description: string;
  image: string | null;
  item_id: number;
  kind: string;
  name: string;
  price: string;
  supply: number | null;
}

/** 'GetProductsByCampaign' query type */
export interface IGetProductsByCampaignQuery {
  params: IGetProductsByCampaignParams;
  result: IGetProductsByCampaignResult;
}

const getProductsByCampaignIR: any = {"usedParamSet":{"campaign_id":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":52,"b":64}]}],"statement":"SELECT * FROM offchain_products WHERE campaign_id = :campaign_id! ORDER BY item_id ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_products WHERE campaign_id = :campaign_id! ORDER BY item_id ASC
 * ```
 */
export const getProductsByCampaign = new PreparedQuery<IGetProductsByCampaignParams,IGetProductsByCampaignResult>(getProductsByCampaignIR);


/** 'UpsertCoin' parameters type */
export interface IUpsertCoinParams {
  chain: string;
  decimals: number;
  n: number;
  payment_token: string;
  symbol: string;
  token: string;
  type: string;
  x: NumberOrString;
}

/** 'UpsertCoin' return type */
export type IUpsertCoinResult = void;

/** 'UpsertCoin' query type */
export interface IUpsertCoinQuery {
  params: IUpsertCoinParams;
  result: IUpsertCoinResult;
}

const upsertCoinIR: any = {"usedParamSet":{"token":true,"symbol":true,"chain":true,"payment_token":true,"type":true,"x":true,"n":true,"decimals":true},"params":[{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":95,"b":101}]},{"name":"symbol","required":true,"transform":{"type":"scalar"},"locs":[{"a":104,"b":111},{"a":215,"b":222}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":114,"b":120},{"a":233,"b":239}]},{"name":"payment_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":123,"b":137},{"a":258,"b":272}]},{"name":"type","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":145},{"a":282,"b":287}]},{"name":"x","required":true,"transform":{"type":"scalar"},"locs":[{"a":148,"b":150},{"a":294,"b":296}]},{"name":"n","required":true,"transform":{"type":"scalar"},"locs":[{"a":153,"b":155},{"a":303,"b":305}]},{"name":"decimals","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":167},{"a":319,"b":328}]}],"statement":"INSERT INTO offchain_coins (token, symbol, chain, payment_token, type, x, n, decimals)\nVALUES (:token!, :symbol!, :chain!, :payment_token!, :type!, :x!, :n!, :decimals!)\nON CONFLICT (token) DO UPDATE SET\n  symbol = :symbol!, chain = :chain!, payment_token = :payment_token!, type = :type!, x = :x!, n = :n!, decimals = :decimals!"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offchain_coins (token, symbol, chain, payment_token, type, x, n, decimals)
 * VALUES (:token!, :symbol!, :chain!, :payment_token!, :type!, :x!, :n!, :decimals!)
 * ON CONFLICT (token) DO UPDATE SET
 *   symbol = :symbol!, chain = :chain!, payment_token = :payment_token!, type = :type!, x = :x!, n = :n!, decimals = :decimals!
 * ```
 */
export const upsertCoin = new PreparedQuery<IUpsertCoinParams,IUpsertCoinResult>(upsertCoinIR);


/** 'GetCoins' parameters type */
export type IGetCoinsParams = void;

/** 'GetCoins' return type */
export interface IGetCoinsResult {
  chain: string;
  decimals: number;
  n: number;
  payment_token: string;
  symbol: string;
  token: string;
  type: string;
  x: string;
}

/** 'GetCoins' query type */
export interface IGetCoinsQuery {
  params: IGetCoinsParams;
  result: IGetCoinsResult;
}

const getCoinsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT * FROM offchain_coins ORDER BY token ASC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_coins ORDER BY token ASC
 * ```
 */
export const getCoins = new PreparedQuery<IGetCoinsParams,IGetCoinsResult>(getCoinsIR);


/** 'UpsertCuratedPackage' parameters type */
export interface IUpsertCuratedPackageParams {
  campaign_id: string;
  description: string;
  package_name: string;
}

/** 'UpsertCuratedPackage' return type */
export type IUpsertCuratedPackageResult = void;

/** 'UpsertCuratedPackage' query type */
export interface IUpsertCuratedPackageQuery {
  params: IUpsertCuratedPackageParams;
  result: IUpsertCuratedPackageResult;
}

const upsertCuratedPackageIR: any = {"usedParamSet":{"campaign_id":true,"package_name":true,"description":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":87,"b":99}]},{"name":"package_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":102,"b":115}]},{"name":"description","required":true,"transform":{"type":"scalar"},"locs":[{"a":118,"b":130},{"a":201,"b":213}]}],"statement":"INSERT INTO offchain_curated_packages (campaign_id, package_name, description)\nVALUES (:campaign_id!, :package_name!, :description!)\nON CONFLICT (campaign_id, package_name) DO UPDATE SET description = :description!"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offchain_curated_packages (campaign_id, package_name, description)
 * VALUES (:campaign_id!, :package_name!, :description!)
 * ON CONFLICT (campaign_id, package_name) DO UPDATE SET description = :description!
 * ```
 */
export const upsertCuratedPackage = new PreparedQuery<IUpsertCuratedPackageParams,IUpsertCuratedPackageResult>(upsertCuratedPackageIR);


/** 'UpsertCuratedPackageItem' parameters type */
export interface IUpsertCuratedPackageItemParams {
  campaign_id: string;
  item_id: number;
  package_name: string;
  quantity: number;
}

/** 'UpsertCuratedPackageItem' return type */
export type IUpsertCuratedPackageItemResult = void;

/** 'UpsertCuratedPackageItem' query type */
export interface IUpsertCuratedPackageItemQuery {
  params: IUpsertCuratedPackageItemParams;
  result: IUpsertCuratedPackageItemResult;
}

const upsertCuratedPackageItemIR: any = {"usedParamSet":{"campaign_id":true,"package_name":true,"item_id":true,"quantity":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":110}]},{"name":"package_name","required":true,"transform":{"type":"scalar"},"locs":[{"a":113,"b":126}]},{"name":"item_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":129,"b":137}]},{"name":"quantity","required":true,"transform":{"type":"scalar"},"locs":[{"a":140,"b":149},{"a":226,"b":235}]}],"statement":"INSERT INTO offchain_curated_package_items (campaign_id, package_name, item_id, quantity)\nVALUES (:campaign_id!, :package_name!, :item_id!, :quantity!)\nON CONFLICT (campaign_id, package_name, item_id) DO UPDATE SET quantity = :quantity!"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO offchain_curated_package_items (campaign_id, package_name, item_id, quantity)
 * VALUES (:campaign_id!, :package_name!, :item_id!, :quantity!)
 * ON CONFLICT (campaign_id, package_name, item_id) DO UPDATE SET quantity = :quantity!
 * ```
 */
export const upsertCuratedPackageItem = new PreparedQuery<IUpsertCuratedPackageItemParams,IUpsertCuratedPackageItemResult>(upsertCuratedPackageItemIR);


/** 'GetCuratedPackagesByCampaign' parameters type */
export interface IGetCuratedPackagesByCampaignParams {
  campaign_id: string;
}

/** 'GetCuratedPackagesByCampaign' return type */
export interface IGetCuratedPackagesByCampaignResult {
  campaign_id: string;
  description: string;
  package_name: string;
}

/** 'GetCuratedPackagesByCampaign' query type */
export interface IGetCuratedPackagesByCampaignQuery {
  params: IGetCuratedPackagesByCampaignParams;
  result: IGetCuratedPackagesByCampaignResult;
}

const getCuratedPackagesByCampaignIR: any = {"usedParamSet":{"campaign_id":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":72}]}],"statement":"SELECT * FROM offchain_curated_packages WHERE campaign_id = :campaign_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_curated_packages WHERE campaign_id = :campaign_id!
 * ```
 */
export const getCuratedPackagesByCampaign = new PreparedQuery<IGetCuratedPackagesByCampaignParams,IGetCuratedPackagesByCampaignResult>(getCuratedPackagesByCampaignIR);


/** 'GetCuratedPackageItemsByCampaign' parameters type */
export interface IGetCuratedPackageItemsByCampaignParams {
  campaign_id: string;
}

/** 'GetCuratedPackageItemsByCampaign' return type */
export interface IGetCuratedPackageItemsByCampaignResult {
  campaign_id: string;
  item_id: number;
  package_name: string;
  quantity: number;
}

/** 'GetCuratedPackageItemsByCampaign' query type */
export interface IGetCuratedPackageItemsByCampaignQuery {
  params: IGetCuratedPackageItemsByCampaignParams;
  result: IGetCuratedPackageItemsByCampaignResult;
}

const getCuratedPackageItemsByCampaignIR: any = {"usedParamSet":{"campaign_id":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":65,"b":77}]}],"statement":"SELECT * FROM offchain_curated_package_items WHERE campaign_id = :campaign_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM offchain_curated_package_items WHERE campaign_id = :campaign_id!
 * ```
 */
export const getCuratedPackageItemsByCampaign = new PreparedQuery<IGetCuratedPackageItemsByCampaignParams,IGetCuratedPackageItemsByCampaignResult>(getCuratedPackageItemsByCampaignIR);


/** 'InsertPayment' parameters type */
export interface IInsertPaymentParams {
  amount: string;
  block_height: number;
  campaign_id: string;
  chain: string;
  created_block: number;
  item_ids: string;
  item_quantities: string;
  output_index?: number | null | void;
  payment_token: string;
  reason: string;
  status: string;
  tx_hash: string;
  wallet: string;
}

/** 'InsertPayment' return type */
export type IInsertPaymentResult = void;

/** 'InsertPayment' query type */
export interface IInsertPaymentQuery {
  params: IInsertPaymentParams;
  result: IInsertPaymentResult;
}

const insertPaymentIR: any = {"usedParamSet":{"campaign_id":true,"chain":true,"wallet":true,"payment_token":true,"amount":true,"item_ids":true,"item_quantities":true,"tx_hash":true,"output_index":true,"block_height":true,"status":true,"reason":true,"created_block":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":185,"b":197}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":200,"b":206}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":209,"b":216}]},{"name":"payment_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":219,"b":233}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":236,"b":243}]},{"name":"item_ids","required":true,"transform":{"type":"scalar"},"locs":[{"a":246,"b":255}]},{"name":"item_quantities","required":true,"transform":{"type":"scalar"},"locs":[{"a":258,"b":274}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":279,"b":287}]},{"name":"output_index","required":false,"transform":{"type":"scalar"},"locs":[{"a":290,"b":302}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":305,"b":318}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":321,"b":328}]},{"name":"reason","required":true,"transform":{"type":"scalar"},"locs":[{"a":331,"b":338}]},{"name":"created_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":341,"b":355}]}],"statement":"INSERT INTO payments (\n  campaign_id, chain, wallet, payment_token, amount, item_ids, item_quantities,\n  tx_hash, output_index, block_height, status, reason, created_block\n) VALUES (\n  :campaign_id!, :chain!, :wallet!, :payment_token!, :amount!, :item_ids!, :item_quantities!,\n  :tx_hash!, :output_index, :block_height!, :status!, :reason!, :created_block!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO payments (
 *   campaign_id, chain, wallet, payment_token, amount, item_ids, item_quantities,
 *   tx_hash, output_index, block_height, status, reason, created_block
 * ) VALUES (
 *   :campaign_id!, :chain!, :wallet!, :payment_token!, :amount!, :item_ids!, :item_quantities!,
 *   :tx_hash!, :output_index, :block_height!, :status!, :reason!, :created_block!
 * )
 * ```
 */
export const insertPayment = new PreparedQuery<IInsertPaymentParams,IInsertPaymentResult>(insertPaymentIR);


/** 'GetPaymentsByCampaign' parameters type */
export interface IGetPaymentsByCampaignParams {
  campaign_id: string;
}

/** 'GetPaymentsByCampaign' return type */
export interface IGetPaymentsByCampaignResult {
  amount: string;
  block_height: number;
  campaign_id: string;
  chain: string;
  created_block: number;
  id: number;
  item_ids: string;
  item_quantities: string;
  output_index: number | null;
  payment_token: string;
  reason: string;
  status: string;
  tx_hash: string;
  wallet: string;
}

/** 'GetPaymentsByCampaign' query type */
export interface IGetPaymentsByCampaignQuery {
  params: IGetPaymentsByCampaignParams;
  result: IGetPaymentsByCampaignResult;
}

const getPaymentsByCampaignIR: any = {"usedParamSet":{"campaign_id":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":55}]}],"statement":"SELECT * FROM payments WHERE campaign_id = :campaign_id! ORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM payments WHERE campaign_id = :campaign_id! ORDER BY id DESC
 * ```
 */
export const getPaymentsByCampaign = new PreparedQuery<IGetPaymentsByCampaignParams,IGetPaymentsByCampaignResult>(getPaymentsByCampaignIR);


/** 'GetPaymentsByWallet' parameters type */
export interface IGetPaymentsByWalletParams {
  campaign_id: string;
  wallet: string;
}

/** 'GetPaymentsByWallet' return type */
export interface IGetPaymentsByWalletResult {
  amount: string;
  block_height: number;
  campaign_id: string;
  chain: string;
  created_block: number;
  id: number;
  item_ids: string;
  item_quantities: string;
  output_index: number | null;
  payment_token: string;
  reason: string;
  status: string;
  tx_hash: string;
  wallet: string;
}

/** 'GetPaymentsByWallet' query type */
export interface IGetPaymentsByWalletQuery {
  params: IGetPaymentsByWalletParams;
  result: IGetPaymentsByWalletResult;
}

const getPaymentsByWalletIR: any = {"usedParamSet":{"campaign_id":true,"wallet":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":55}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":77}]}],"statement":"SELECT * FROM payments WHERE campaign_id = :campaign_id! AND wallet = :wallet! ORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM payments WHERE campaign_id = :campaign_id! AND wallet = :wallet! ORDER BY id DESC
 * ```
 */
export const getPaymentsByWallet = new PreparedQuery<IGetPaymentsByWalletParams,IGetPaymentsByWalletResult>(getPaymentsByWalletIR);


/** 'GetPaymentsByStatus' parameters type */
export interface IGetPaymentsByStatusParams {
  campaign_id: string;
  status: string;
}

/** 'GetPaymentsByStatus' return type */
export interface IGetPaymentsByStatusResult {
  amount: string;
  block_height: number;
  campaign_id: string;
  chain: string;
  created_block: number;
  id: number;
  item_ids: string;
  item_quantities: string;
  output_index: number | null;
  payment_token: string;
  reason: string;
  status: string;
  tx_hash: string;
  wallet: string;
}

/** 'GetPaymentsByStatus' query type */
export interface IGetPaymentsByStatusQuery {
  params: IGetPaymentsByStatusParams;
  result: IGetPaymentsByStatusResult;
}

const getPaymentsByStatusIR: any = {"usedParamSet":{"campaign_id":true,"status":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":55}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":77}]}],"statement":"SELECT * FROM payments WHERE campaign_id = :campaign_id! AND status = :status! ORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM payments WHERE campaign_id = :campaign_id! AND status = :status! ORDER BY id DESC
 * ```
 */
export const getPaymentsByStatus = new PreparedQuery<IGetPaymentsByStatusParams,IGetPaymentsByStatusResult>(getPaymentsByStatusIR);


/** 'InsertReferralReward' parameters type */
export interface IInsertReferralRewardParams {
  amount: string;
  block_height: number;
  buyer: string;
  campaign_id: string;
  chain: string;
  created_block: number;
  payment_token: string;
  referrer: string;
  tx_hash: string;
}

/** 'InsertReferralReward' return type */
export type IInsertReferralRewardResult = void;

/** 'InsertReferralReward' query type */
export interface IInsertReferralRewardQuery {
  params: IInsertReferralRewardParams;
  result: IInsertReferralRewardResult;
}

const insertReferralRewardIR: any = {"usedParamSet":{"campaign_id":true,"referrer":true,"buyer":true,"chain":true,"payment_token":true,"amount":true,"tx_hash":true,"block_height":true,"created_block":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":143,"b":155}]},{"name":"referrer","required":true,"transform":{"type":"scalar"},"locs":[{"a":158,"b":167}]},{"name":"buyer","required":true,"transform":{"type":"scalar"},"locs":[{"a":170,"b":176}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":179,"b":185}]},{"name":"payment_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":188,"b":202}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":205,"b":212}]},{"name":"tx_hash","required":true,"transform":{"type":"scalar"},"locs":[{"a":215,"b":223}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":226,"b":239}]},{"name":"created_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":242,"b":256}]}],"statement":"INSERT INTO referral_rewards (\n  campaign_id, referrer, buyer, chain, payment_token, amount, tx_hash, block_height, created_block\n) VALUES (\n  :campaign_id!, :referrer!, :buyer!, :chain!, :payment_token!, :amount!, :tx_hash!, :block_height!, :created_block!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO referral_rewards (
 *   campaign_id, referrer, buyer, chain, payment_token, amount, tx_hash, block_height, created_block
 * ) VALUES (
 *   :campaign_id!, :referrer!, :buyer!, :chain!, :payment_token!, :amount!, :tx_hash!, :block_height!, :created_block!
 * )
 * ```
 */
export const insertReferralReward = new PreparedQuery<IInsertReferralRewardParams,IInsertReferralRewardResult>(insertReferralRewardIR);


/** 'GetReferralRewardsByCampaign' parameters type */
export interface IGetReferralRewardsByCampaignParams {
  campaign_id: string;
}

/** 'GetReferralRewardsByCampaign' return type */
export interface IGetReferralRewardsByCampaignResult {
  amount: string;
  block_height: number;
  buyer: string;
  campaign_id: string;
  chain: string;
  created_block: number;
  id: number;
  payment_token: string;
  referrer: string;
  tx_hash: string;
}

/** 'GetReferralRewardsByCampaign' query type */
export interface IGetReferralRewardsByCampaignQuery {
  params: IGetReferralRewardsByCampaignParams;
  result: IGetReferralRewardsByCampaignResult;
}

const getReferralRewardsByCampaignIR: any = {"usedParamSet":{"campaign_id":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":51,"b":63}]}],"statement":"SELECT * FROM referral_rewards WHERE campaign_id = :campaign_id! ORDER BY id DESC"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM referral_rewards WHERE campaign_id = :campaign_id! ORDER BY id DESC
 * ```
 */
export const getReferralRewardsByCampaign = new PreparedQuery<IGetReferralRewardsByCampaignParams,IGetReferralRewardsByCampaignResult>(getReferralRewardsByCampaignIR);


/** 'GetMintableItems' parameters type */
export interface IGetMintableItemsParams {
  launchpad: string;
}

/** 'GetMintableItems' return type */
export interface IGetMintableItemsResult {
  chain: string;
  item_id: number;
  quantity: number;
  wallet: string;
}

/** 'GetMintableItems' query type */
export interface IGetMintableItemsQuery {
  params: IGetMintableItemsParams;
  result: IGetMintableItemsResult;
}

const getMintableItemsIR: any = {"usedParamSet":{"launchpad":true},"params":[{"name":"launchpad","required":true,"transform":{"type":"scalar"},"locs":[{"a":179,"b":189}]}],"statement":"SELECT ui.wallet, ui.item_id, ui.quantity, u.chain\nFROM launchpad_user_items ui\nJOIN launchpad_users u ON u.launchpad = ui.launchpad AND u.wallet = ui.wallet\nWHERE ui.launchpad = :launchpad!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT ui.wallet, ui.item_id, ui.quantity, u.chain
 * FROM launchpad_user_items ui
 * JOIN launchpad_users u ON u.launchpad = ui.launchpad AND u.wallet = ui.wallet
 * WHERE ui.launchpad = :launchpad!
 * ```
 */
export const getMintableItems = new PreparedQuery<IGetMintableItemsParams,IGetMintableItemsResult>(getMintableItemsIR);


/** 'InsertNftMint' parameters type */
export interface IInsertNftMintParams {
  campaign_id: string;
  chain: string;
  created_block: number;
  item_id: number;
  quantity: number;
  wallet: string;
}

/** 'InsertNftMint' return type */
export type IInsertNftMintResult = void;

/** 'InsertNftMint' query type */
export interface IInsertNftMintQuery {
  params: IInsertNftMintParams;
  result: IInsertNftMintResult;
}

const insertNftMintIR: any = {"usedParamSet":{"campaign_id":true,"chain":true,"wallet":true,"item_id":true,"quantity":true,"created_block":true},"params":[{"name":"campaign_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":101,"b":113}]},{"name":"chain","required":true,"transform":{"type":"scalar"},"locs":[{"a":116,"b":122}]},{"name":"wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":132}]},{"name":"item_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":143}]},{"name":"quantity","required":true,"transform":{"type":"scalar"},"locs":[{"a":146,"b":155}]},{"name":"created_block","required":true,"transform":{"type":"scalar"},"locs":[{"a":169,"b":183}]}],"statement":"INSERT INTO nft_mints (campaign_id, chain, wallet, item_id, quantity, status, created_block)\nVALUES (:campaign_id!, :chain!, :wallet!, :item_id!, :quantity!, 'pending', :created_block!)\nON CONFLICT (campaign_id, chain, wallet, item_id) DO NOTHING"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO nft_mints (campaign_id, chain, wallet, item_id, quantity, status, created_block)
 * VALUES (:campaign_id!, :chain!, :wallet!, :item_id!, :quantity!, 'pending', :created_block!)
 * ON CONFLICT (campaign_id, chain, wallet, item_id) DO NOTHING
 * ```
 */
export const insertNftMint = new PreparedQuery<IInsertNftMintParams,IInsertNftMintResult>(insertNftMintIR);


