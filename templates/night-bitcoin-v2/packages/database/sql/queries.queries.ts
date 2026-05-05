/** Types generated for queries found in "sql/queries.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type NumberOrString = number | string;

/** 'TableExists' parameters type */
export type ITableExistsParams = void;

/** 'TableExists' return type */
export interface ITableExistsResult {
  exists: boolean | null;
}

/** 'TableExists' query type */
export interface ITableExistsQuery {
  params: ITableExistsParams;
  result: ITableExistsResult;
}

const tableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables\n    WHERE  table_schema = 'public'\n    AND    table_name   = 'quotes'\n)"};

/**
 * Query generated from SQL:
 * ```
 * SELECT EXISTS (
 *     SELECT FROM information_schema.tables
 *     WHERE  table_schema = 'public'
 *     AND    table_name   = 'quotes'
 * )
 * ```
 */
export const tableExists = new PreparedQuery<ITableExistsParams,ITableExistsResult>(tableExistsIR);


/** 'InsertQuote' parameters type */
export interface IInsertQuoteParams {
  fee: NumberOrString;
  filler: string;
  from_amount: NumberOrString;
  from_token: string;
  order_id: string;
  to_amount: NumberOrString;
  to_token: string;
}

/** 'InsertQuote' return type */
export type IInsertQuoteResult = void;

/** 'InsertQuote' query type */
export interface IInsertQuoteQuery {
  params: IInsertQuoteParams;
  result: IInsertQuoteResult;
}

const insertQuoteIR: any = {"usedParamSet":{"order_id":true,"from_token":true,"filler":true,"to_token":true,"from_amount":true,"to_amount":true,"fee":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":97,"b":106}]},{"name":"from_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":120}]},{"name":"filler","required":true,"transform":{"type":"scalar"},"locs":[{"a":123,"b":130}]},{"name":"to_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":133,"b":142}]},{"name":"from_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":145,"b":157}]},{"name":"to_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":160,"b":170}]},{"name":"fee","required":true,"transform":{"type":"scalar"},"locs":[{"a":173,"b":177}]}],"statement":"INSERT INTO quotes\n(order_id, from_token, filler, to_token, from_amount, to_amount, fee)\nVALUES\n(:order_id!, :from_token!, :filler!, :to_token!, :from_amount!, :to_amount!, :fee!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO quotes
 * (order_id, from_token, filler, to_token, from_amount, to_amount, fee)
 * VALUES
 * (:order_id!, :from_token!, :filler!, :to_token!, :from_amount!, :to_amount!, :fee!)
 * ```
 */
export const insertQuote = new PreparedQuery<IInsertQuoteParams,IInsertQuoteResult>(insertQuoteIR);


/** 'GetQuoteById' parameters type */
export interface IGetQuoteByIdParams {
  order_id: string;
}

/** 'GetQuoteById' return type */
export interface IGetQuoteByIdResult {
  created_at: Date;
  fee: string;
  filler: string;
  from_amount: string;
  from_token: string;
  id: number;
  order_id: string;
  to_amount: string;
  to_token: string;
}

/** 'GetQuoteById' query type */
export interface IGetQuoteByIdQuery {
  params: IGetQuoteByIdParams;
  result: IGetQuoteByIdResult;
}

const getQuoteByIdIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":47}]}],"statement":"SELECT * FROM quotes\nWHERE order_id = :order_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM quotes
 * WHERE order_id = :order_id!
 * ```
 */
export const getQuoteById = new PreparedQuery<IGetQuoteByIdParams,IGetQuoteByIdResult>(getQuoteByIdIR);


/** 'InsertIntent' parameters type */
export interface IInsertIntentParams {
  destination_chain_id: string;
  destination_settler: string;
  fill_deadline: string;
  max_spent_amount: string;
  max_spent_chain_id: string;
  max_spent_recipient: string;
  max_spent_token: string;
  min_received_amount: string;
  min_received_chain_id: string;
  min_received_recipient: string;
  min_received_token: string;
  open_deadline: string;
  order_id: string;
  origin_chain_id: string;
  origin_data: string;
  status: string;
  user_address: string;
}

/** 'InsertIntent' return type */
export type IInsertIntentResult = void;

/** 'InsertIntent' query type */
export interface IInsertIntentQuery {
  params: IInsertIntentParams;
  result: IInsertIntentResult;
}

const insertIntentIR: any = {"usedParamSet":{"order_id":true,"user_address":true,"origin_chain_id":true,"open_deadline":true,"fill_deadline":true,"max_spent_token":true,"max_spent_amount":true,"max_spent_recipient":true,"max_spent_chain_id":true,"min_received_token":true,"min_received_amount":true,"min_received_recipient":true,"min_received_chain_id":true,"destination_chain_id":true,"destination_settler":true,"origin_data":true,"status":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":403,"b":412}]},{"name":"user_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":419,"b":432}]},{"name":"origin_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":439,"b":455}]},{"name":"open_deadline","required":true,"transform":{"type":"scalar"},"locs":[{"a":462,"b":476}]},{"name":"fill_deadline","required":true,"transform":{"type":"scalar"},"locs":[{"a":483,"b":497}]},{"name":"max_spent_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":504,"b":520}]},{"name":"max_spent_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":527,"b":544}]},{"name":"max_spent_recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":551,"b":571}]},{"name":"max_spent_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":578,"b":597}]},{"name":"min_received_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":604,"b":623}]},{"name":"min_received_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":630,"b":650}]},{"name":"min_received_recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":657,"b":680}]},{"name":"min_received_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":687,"b":709}]},{"name":"destination_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":716,"b":737}]},{"name":"destination_settler","required":true,"transform":{"type":"scalar"},"locs":[{"a":744,"b":764}]},{"name":"origin_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":771,"b":783}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":790,"b":797}]}],"statement":"INSERT INTO intents\n(\n    order_id,\n    user_address,\n    origin_chain_id,\n    open_deadline,\n    fill_deadline,\n    max_spent_token,\n    max_spent_amount,\n    max_spent_recipient,\n    max_spent_chain_id,\n    min_received_token,\n    min_received_amount,\n    min_received_recipient,\n    min_received_chain_id,\n    destination_chain_id,\n    destination_settler,\n    origin_data,\n    status\n)\nVALUES\n(\n    :order_id!,\n    :user_address!,\n    :origin_chain_id!,\n    :open_deadline!,\n    :fill_deadline!,\n    :max_spent_token!,\n    :max_spent_amount!,\n    :max_spent_recipient!,\n    :max_spent_chain_id!,\n    :min_received_token!,\n    :min_received_amount!,\n    :min_received_recipient!,\n    :min_received_chain_id!,\n    :destination_chain_id!,\n    :destination_settler!,\n    :origin_data!,\n    :status!\n)\nON CONFLICT (order_id) DO UPDATE SET\n    user_address = EXCLUDED.user_address,\n    origin_chain_id = EXCLUDED.origin_chain_id,\n    open_deadline = EXCLUDED.open_deadline,\n    fill_deadline = EXCLUDED.fill_deadline,\n    max_spent_token = EXCLUDED.max_spent_token,\n    max_spent_amount = EXCLUDED.max_spent_amount,\n    max_spent_recipient = EXCLUDED.max_spent_recipient,\n    max_spent_chain_id = EXCLUDED.max_spent_chain_id,\n    min_received_token = EXCLUDED.min_received_token,\n    min_received_amount = EXCLUDED.min_received_amount,\n    min_received_recipient = EXCLUDED.min_received_recipient,\n    min_received_chain_id = EXCLUDED.min_received_chain_id,\n    destination_chain_id = EXCLUDED.destination_chain_id,\n    destination_settler = EXCLUDED.destination_settler,\n    origin_data = EXCLUDED.origin_data,\n    status = EXCLUDED.status"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO intents
 * (
 *     order_id,
 *     user_address,
 *     origin_chain_id,
 *     open_deadline,
 *     fill_deadline,
 *     max_spent_token,
 *     max_spent_amount,
 *     max_spent_recipient,
 *     max_spent_chain_id,
 *     min_received_token,
 *     min_received_amount,
 *     min_received_recipient,
 *     min_received_chain_id,
 *     destination_chain_id,
 *     destination_settler,
 *     origin_data,
 *     status
 * )
 * VALUES
 * (
 *     :order_id!,
 *     :user_address!,
 *     :origin_chain_id!,
 *     :open_deadline!,
 *     :fill_deadline!,
 *     :max_spent_token!,
 *     :max_spent_amount!,
 *     :max_spent_recipient!,
 *     :max_spent_chain_id!,
 *     :min_received_token!,
 *     :min_received_amount!,
 *     :min_received_recipient!,
 *     :min_received_chain_id!,
 *     :destination_chain_id!,
 *     :destination_settler!,
 *     :origin_data!,
 *     :status!
 * )
 * ON CONFLICT (order_id) DO UPDATE SET
 *     user_address = EXCLUDED.user_address,
 *     origin_chain_id = EXCLUDED.origin_chain_id,
 *     open_deadline = EXCLUDED.open_deadline,
 *     fill_deadline = EXCLUDED.fill_deadline,
 *     max_spent_token = EXCLUDED.max_spent_token,
 *     max_spent_amount = EXCLUDED.max_spent_amount,
 *     max_spent_recipient = EXCLUDED.max_spent_recipient,
 *     max_spent_chain_id = EXCLUDED.max_spent_chain_id,
 *     min_received_token = EXCLUDED.min_received_token,
 *     min_received_amount = EXCLUDED.min_received_amount,
 *     min_received_recipient = EXCLUDED.min_received_recipient,
 *     min_received_chain_id = EXCLUDED.min_received_chain_id,
 *     destination_chain_id = EXCLUDED.destination_chain_id,
 *     destination_settler = EXCLUDED.destination_settler,
 *     origin_data = EXCLUDED.origin_data,
 *     status = EXCLUDED.status
 * ```
 */
export const insertIntent = new PreparedQuery<IInsertIntentParams,IInsertIntentResult>(insertIntentIR);


/** 'GetIntentByOrderId' parameters type */
export interface IGetIntentByOrderIdParams {
  order_id: string;
}

/** 'GetIntentByOrderId' return type */
export interface IGetIntentByOrderIdResult {
  created_at: Date;
  destination_chain_id: string;
  destination_settler: string;
  fill_deadline: string;
  id: number;
  max_spent_amount: string;
  max_spent_chain_id: string;
  max_spent_recipient: string;
  max_spent_token: string;
  min_received_amount: string;
  min_received_chain_id: string;
  min_received_recipient: string;
  min_received_token: string;
  open_deadline: string;
  order_id: string;
  origin_chain_id: string;
  origin_data: string;
  resolved_by: string | null;
  status: string;
  user_address: string;
}

/** 'GetIntentByOrderId' query type */
export interface IGetIntentByOrderIdQuery {
  params: IGetIntentByOrderIdParams;
  result: IGetIntentByOrderIdResult;
}

const getIntentByOrderIdIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":48}]}],"statement":"SELECT * FROM intents\nWHERE order_id = :order_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM intents
 * WHERE order_id = :order_id!
 * ```
 */
export const getIntentByOrderId = new PreparedQuery<IGetIntentByOrderIdParams,IGetIntentByOrderIdResult>(getIntentByOrderIdIR);


/** 'InsertTransfer' parameters type */
export interface IInsertTransferParams {
  amount: NumberOrString;
  chain_id: string;
  from_address: string;
  to_address: string;
  token: string;
}

/** 'InsertTransfer' return type */
export type IInsertTransferResult = void;

/** 'InsertTransfer' query type */
export interface IInsertTransferQuery {
  params: IInsertTransferParams;
  result: IInsertTransferResult;
}

const insertTransferIR: any = {"usedParamSet":{"from_address":true,"to_address":true,"amount":true,"token":true,"chain_id":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":95}]},{"name":"to_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":109}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":119}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":122,"b":128}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":131,"b":140}]}],"statement":"INSERT INTO transfers\n(from_address, to_address, amount, token, chain_id)\nVALUES\n(:from_address!, :to_address!, :amount!, :token!, :chain_id!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO transfers
 * (from_address, to_address, amount, token, chain_id)
 * VALUES
 * (:from_address!, :to_address!, :amount!, :token!, :chain_id!)
 * ```
 */
export const insertTransfer = new PreparedQuery<IInsertTransferParams,IInsertTransferResult>(insertTransferIR);


/** 'GetSomeUnusedTransfer' parameters type */
export interface IGetSomeUnusedTransferParams {
  amount: NumberOrString;
  chain_id: string;
  from_address: string;
  to_address: string;
  token: string;
}

/** 'GetSomeUnusedTransfer' return type */
export interface IGetSomeUnusedTransferResult {
  amount: string;
  chain_id: string;
  created_at: Date;
  from_address: string;
  id: number;
  to_address: string;
  token: string;
  used: boolean;
}

/** 'GetSomeUnusedTransfer' query type */
export interface IGetSomeUnusedTransferQuery {
  params: IGetSomeUnusedTransferParams;
  result: IGetSomeUnusedTransferResult;
}

const getSomeUnusedTransferIR: any = {"usedParamSet":{"from_address":true,"to_address":true,"amount":true,"token":true,"chain_id":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":49,"b":62}]},{"name":"to_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":81,"b":92}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":107,"b":114}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":128,"b":134}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":151,"b":160}]}],"statement":"SELECT * FROM transfers\nWHERE\n    from_address = :from_address!\nAND to_address = :to_address!\nAND amount = :amount!\nAND token = :token!\nAND chain_id = :chain_id!\nAND used = FALSE"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM transfers
 * WHERE
 *     from_address = :from_address!
 * AND to_address = :to_address!
 * AND amount = :amount!
 * AND token = :token!
 * AND chain_id = :chain_id!
 * AND used = FALSE
 * ```
 */
export const getSomeUnusedTransfer = new PreparedQuery<IGetSomeUnusedTransferParams,IGetSomeUnusedTransferResult>(getSomeUnusedTransferIR);


/** 'UpdateTransferUsed' parameters type */
export interface IUpdateTransferUsedParams {
  id: number;
}

/** 'UpdateTransferUsed' return type */
export type IUpdateTransferUsedResult = void;

/** 'UpdateTransferUsed' query type */
export interface IUpdateTransferUsedQuery {
  params: IUpdateTransferUsedParams;
  result: IUpdateTransferUsedResult;
}

const updateTransferUsedIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":44,"b":47}]}],"statement":"UPDATE transfers\nSET used = TRUE\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE transfers
 * SET used = TRUE
 * WHERE id = :id!
 * ```
 */
export const updateTransferUsed = new PreparedQuery<IUpdateTransferUsedParams,IUpdateTransferUsedResult>(updateTransferUsedIR);


/** 'GetTransferToMatchIntent' parameters type */
export interface IGetTransferToMatchIntentParams {
  amount: NumberOrString;
  chain_id: string;
  to_address: string;
  token: string;
}

/** 'GetTransferToMatchIntent' return type */
export interface IGetTransferToMatchIntentResult {
  amount: string;
  chain_id: string;
  created_at: Date;
  from_address: string;
  id: number;
  to_address: string;
  token: string;
  used: boolean;
}

/** 'GetTransferToMatchIntent' query type */
export interface IGetTransferToMatchIntentQuery {
  params: IGetTransferToMatchIntentParams;
  result: IGetTransferToMatchIntentResult;
}

const getTransferToMatchIntentIR: any = {"usedParamSet":{"amount":true,"token":true,"chain_id":true,"to_address":true},"params":[{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":43,"b":50}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":64,"b":70}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":87,"b":96}]},{"name":"to_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":132,"b":143}]}],"statement":"SELECT * FROM transfers\nWHERE\n    amount = :amount!\nAND token = :token!\nAND chain_id = :chain_id!\nAND used = FALSE\nAND to_address = :to_address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM transfers
 * WHERE
 *     amount = :amount!
 * AND token = :token!
 * AND chain_id = :chain_id!
 * AND used = FALSE
 * AND to_address = :to_address!
 * ```
 */
export const getTransferToMatchIntent = new PreparedQuery<IGetTransferToMatchIntentParams,IGetTransferToMatchIntentResult>(getTransferToMatchIntentIR);


/** 'GetIntentToMatchTransfer' parameters type */
export interface IGetIntentToMatchTransferParams {
  max_spent_amount: string;
  max_spent_token: string;
}

/** 'GetIntentToMatchTransfer' return type */
export interface IGetIntentToMatchTransferResult {
  created_at: Date;
  destination_chain_id: string;
  destination_settler: string;
  fill_deadline: string;
  id: number;
  max_spent_amount: string;
  max_spent_chain_id: string;
  max_spent_recipient: string;
  max_spent_token: string;
  min_received_amount: string;
  min_received_chain_id: string;
  min_received_recipient: string;
  min_received_token: string;
  open_deadline: string;
  order_id: string;
  origin_chain_id: string;
  origin_data: string;
  resolved_by: string | null;
  status: string;
  user_address: string;
}

/** 'GetIntentToMatchTransfer' query type */
export interface IGetIntentToMatchTransferQuery {
  params: IGetIntentToMatchTransferParams;
  result: IGetIntentToMatchTransferResult;
}

const getIntentToMatchTransferIR: any = {"usedParamSet":{"max_spent_token":true,"max_spent_amount":true},"params":[{"name":"max_spent_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":47,"b":63}]},{"name":"max_spent_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":88,"b":105}]}],"statement":"SELECT * FROM intents\nWHERE  max_spent_token = :max_spent_token!\nAND max_spent_amount = :max_spent_amount!\nAND status = '0'"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM intents
 * WHERE  max_spent_token = :max_spent_token!
 * AND max_spent_amount = :max_spent_amount!
 * AND status = '0'
 * ```
 */
export const getIntentToMatchTransfer = new PreparedQuery<IGetIntentToMatchTransferParams,IGetIntentToMatchTransferResult>(getIntentToMatchTransferIR);


/** 'UpdateIntentResolved' parameters type */
export interface IUpdateIntentResolvedParams {
  order_id: string;
  resolved_by: string;
}

/** 'UpdateIntentResolved' return type */
export type IUpdateIntentResolvedResult = void;

/** 'UpdateIntentResolved' query type */
export interface IUpdateIntentResolvedQuery {
  params: IUpdateIntentResolvedParams;
  result: IUpdateIntentResolvedResult;
}

const updateIntentResolvedIR: any = {"usedParamSet":{"resolved_by":true,"order_id":true},"params":[{"name":"resolved_by","required":true,"transform":{"type":"scalar"},"locs":[{"a":33,"b":45}]},{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":79,"b":88}]}],"statement":"UPDATE intents\nSET resolved_by = :resolved_by!,  status = '3'\nWHERE order_id = :order_id!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE intents
 * SET resolved_by = :resolved_by!,  status = '3'
 * WHERE order_id = :order_id!
 * ```
 */
export const updateIntentResolved = new PreparedQuery<IUpdateIntentResolvedParams,IUpdateIntentResolvedResult>(updateIntentResolvedIR);


/** 'GetTransferById' parameters type */
export interface IGetTransferByIdParams {
  id: number;
}

/** 'GetTransferById' return type */
export interface IGetTransferByIdResult {
  amount: string;
  chain_id: string;
  created_at: Date;
  from_address: string;
  id: number;
  to_address: string;
  token: string;
  used: boolean;
}

/** 'GetTransferById' query type */
export interface IGetTransferByIdQuery {
  params: IGetTransferByIdParams;
  result: IGetTransferByIdResult;
}

const getTransferByIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":35,"b":38}]}],"statement":"SELECT * FROM transfers\nWHERE id = :id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM transfers
 * WHERE id = :id!
 * ```
 */
export const getTransferById = new PreparedQuery<IGetTransferByIdParams,IGetTransferByIdResult>(getTransferByIdIR);


/** 'GetBestQuoteForOrder' parameters type */
export interface IGetBestQuoteForOrderParams {
  order_id: string;
}

/** 'GetBestQuoteForOrder' return type */
export interface IGetBestQuoteForOrderResult {
  created_at: Date;
  fee: string;
  filler: string;
  from_amount: string;
  from_token: string;
  id: number;
  order_id: string;
  to_amount: string;
  to_token: string;
}

/** 'GetBestQuoteForOrder' query type */
export interface IGetBestQuoteForOrderQuery {
  params: IGetBestQuoteForOrderParams;
  result: IGetBestQuoteForOrderResult;
}

const getBestQuoteForOrderIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":38,"b":47}]}],"statement":"SELECT * FROM quotes\nWHERE order_id = :order_id!\nORDER BY to_amount ASC\nLIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM quotes
 * WHERE order_id = :order_id!
 * ORDER BY to_amount ASC
 * LIMIT 1
 * ```
 */
export const getBestQuoteForOrder = new PreparedQuery<IGetBestQuoteForOrderParams,IGetBestQuoteForOrderResult>(getBestQuoteForOrderIR);


