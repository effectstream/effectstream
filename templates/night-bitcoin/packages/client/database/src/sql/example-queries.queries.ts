/** Types generated for queries found in "src/sql/example-queries.sql" */
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

const tableExistsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT EXISTS (\n    SELECT FROM information_schema.tables \n    WHERE  table_schema = 'public'\n    AND    table_name   = 'quotes'\n)"};

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

const insertQuoteIR: any = {"usedParamSet":{"order_id":true,"from_token":true,"filler":true,"to_token":true,"from_amount":true,"to_amount":true,"fee":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":100,"b":109}]},{"name":"from_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":123}]},{"name":"filler","required":true,"transform":{"type":"scalar"},"locs":[{"a":126,"b":133}]},{"name":"to_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":145}]},{"name":"from_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":148,"b":160}]},{"name":"to_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":163,"b":173}]},{"name":"fee","required":true,"transform":{"type":"scalar"},"locs":[{"a":176,"b":180}]}],"statement":"INSERT INTO quotes \n(order_id, from_token, filler, to_token, from_amount, to_amount, fee) \nVALUES \n(:order_id!, :from_token!, :filler!, :to_token!, :from_amount!, :to_amount!, :fee!)"};

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

const getQuoteByIdIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":48}]}],"statement":"SELECT * FROM quotes \nWHERE order_id = :order_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM quotes 
 * WHERE order_id = :order_id!
 * ```
 */
export const getQuoteById = new PreparedQuery<IGetQuoteByIdParams,IGetQuoteByIdResult>(getQuoteByIdIR);


/** 'InsertPayment' parameters type */
export interface IInsertPaymentParams {
  amount: NumberOrString;
  chain_id: string;
  from_wallet: string;
  order_id: string;
  to_wallet: string;
  token: string;
}

/** 'InsertPayment' return type */
export type IInsertPaymentResult = void;

/** 'InsertPayment' query type */
export interface IInsertPaymentQuery {
  params: IInsertPaymentParams;
  result: IInsertPaymentResult;
}

const insertPaymentIR: any = {"usedParamSet":{"amount":true,"token":true,"chain_id":true,"to_wallet":true,"from_wallet":true,"order_id":true},"params":[{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":92,"b":99}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":102,"b":108}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":111,"b":120}]},{"name":"to_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":123,"b":133}]},{"name":"from_wallet","required":true,"transform":{"type":"scalar"},"locs":[{"a":136,"b":148}]},{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":151,"b":160}]}],"statement":"INSERT INTO payments \n(amount, token, chain_id, to_wallet, from_wallet, order_id) \nVALUES \n(:amount!, :token!, :chain_id!, :to_wallet!, :from_wallet!, :order_id!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO payments 
 * (amount, token, chain_id, to_wallet, from_wallet, order_id) 
 * VALUES 
 * (:amount!, :token!, :chain_id!, :to_wallet!, :from_wallet!, :order_id!)
 * ```
 */
export const insertPayment = new PreparedQuery<IInsertPaymentParams,IInsertPaymentResult>(insertPaymentIR);


/** 'GetPayments' parameters type */
export interface IGetPaymentsParams {
  order_id: string;
}

/** 'GetPayments' return type */
export interface IGetPaymentsResult {
  amount: string;
  chain_id: string;
  created_at: Date;
  from_wallet: string;
  id: number;
  order_id: string;
  to_wallet: string;
  token: string;
}

/** 'GetPayments' query type */
export interface IGetPaymentsQuery {
  params: IGetPaymentsParams;
  result: IGetPaymentsResult;
}

const getPaymentsIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":41,"b":50}]}],"statement":"SELECT * FROM payments \nWHERE order_id = :order_id!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM payments 
 * WHERE order_id = :order_id!
 * ```
 */
export const getPayments = new PreparedQuery<IGetPaymentsParams,IGetPaymentsResult>(getPaymentsIR);


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

const insertIntentIR: any = {"usedParamSet":{"order_id":true,"user_address":true,"origin_chain_id":true,"open_deadline":true,"fill_deadline":true,"max_spent_token":true,"max_spent_amount":true,"max_spent_recipient":true,"max_spent_chain_id":true,"min_received_token":true,"min_received_amount":true,"min_received_recipient":true,"min_received_chain_id":true,"destination_chain_id":true,"destination_settler":true,"origin_data":true,"status":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":405,"b":414}]},{"name":"user_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":421,"b":434}]},{"name":"origin_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":441,"b":457}]},{"name":"open_deadline","required":true,"transform":{"type":"scalar"},"locs":[{"a":464,"b":478}]},{"name":"fill_deadline","required":true,"transform":{"type":"scalar"},"locs":[{"a":485,"b":499}]},{"name":"max_spent_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":506,"b":522}]},{"name":"max_spent_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":529,"b":546}]},{"name":"max_spent_recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":553,"b":573}]},{"name":"max_spent_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":580,"b":599}]},{"name":"min_received_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":606,"b":625}]},{"name":"min_received_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":632,"b":652}]},{"name":"min_received_recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":659,"b":682}]},{"name":"min_received_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":689,"b":711}]},{"name":"destination_chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":718,"b":739}]},{"name":"destination_settler","required":true,"transform":{"type":"scalar"},"locs":[{"a":746,"b":766}]},{"name":"origin_data","required":true,"transform":{"type":"scalar"},"locs":[{"a":773,"b":785}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":792,"b":799}]}],"statement":"INSERT INTO intents \n(\n    order_id,\n    user_address,\n    origin_chain_id,\n    open_deadline,\n    fill_deadline,\n    max_spent_token,\n    max_spent_amount,\n    max_spent_recipient,\n    max_spent_chain_id,\n    min_received_token,\n    min_received_amount,\n    min_received_recipient,\n    min_received_chain_id,\n    destination_chain_id,\n    destination_settler,\n    origin_data,\n    status\n)\nVALUES \n(\n    :order_id!,\n    :user_address!,\n    :origin_chain_id!,\n    :open_deadline!,\n    :fill_deadline!,\n    :max_spent_token!,\n    :max_spent_amount!,\n    :max_spent_recipient!,\n    :max_spent_chain_id!,\n    :min_received_token!,\n    :min_received_amount!,\n    :min_received_recipient!,\n    :min_received_chain_id!,\n    :destination_chain_id!,\n    :destination_settler!,\n    :origin_data!,\n    :status!\n)\nON CONFLICT (order_id) DO UPDATE SET \n    user_address = EXCLUDED.user_address,\n    origin_chain_id = EXCLUDED.origin_chain_id,\n    open_deadline = EXCLUDED.open_deadline,\n    fill_deadline = EXCLUDED.fill_deadline,\n    max_spent_token = EXCLUDED.max_spent_token,\n    max_spent_amount = EXCLUDED.max_spent_amount,\n    max_spent_recipient = EXCLUDED.max_spent_recipient,\n    max_spent_chain_id = EXCLUDED.max_spent_chain_id,\n    min_received_token = EXCLUDED.min_received_token,\n    min_received_amount = EXCLUDED.min_received_amount,\n    min_received_recipient = EXCLUDED.min_received_recipient,\n    min_received_chain_id = EXCLUDED.min_received_chain_id,\n    destination_chain_id = EXCLUDED.destination_chain_id,\n    destination_settler = EXCLUDED.destination_settler,\n    origin_data = EXCLUDED.origin_data,\n    status = EXCLUDED.status"};

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

const getIntentByOrderIdIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":40,"b":49}]}],"statement":"SELECT * FROM intents \nWHERE order_id = :order_id!"};

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

const insertTransferIR: any = {"usedParamSet":{"from_address":true,"to_address":true,"amount":true,"token":true,"chain_id":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":85,"b":98}]},{"name":"to_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":101,"b":112}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":115,"b":122}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":131}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":134,"b":143}]}],"statement":"INSERT INTO transfers \n(from_address, to_address, amount, token, chain_id) \nVALUES \n(:from_address!, :to_address!, :amount!, :token!, :chain_id!)"};

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

const getSomeUnusedTransferIR: any = {"usedParamSet":{"from_address":true,"to_address":true,"amount":true,"token":true,"chain_id":true},"params":[{"name":"from_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":51,"b":64}]},{"name":"to_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":83,"b":94}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":109,"b":116}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":130,"b":136}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":153,"b":162}]}],"statement":"SELECT * FROM transfers \nWHERE \n    from_address = :from_address!\nAND to_address = :to_address!\nAND amount = :amount!\nAND token = :token!\nAND chain_id = :chain_id!\nAND used = FALSE"};

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

const updateTransferUsedIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":46,"b":49}]}],"statement":"UPDATE transfers \nSET used = TRUE \nWHERE id = :id!"};

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

const getTransferToMatchIntentIR: any = {"usedParamSet":{"amount":true,"token":true,"chain_id":true,"to_address":true},"params":[{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":52}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":66,"b":72}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":89,"b":98}]},{"name":"to_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":134,"b":145}]}],"statement":"SELECT * FROM transfers \nWHERE \n    amount = :amount!\nAND token = :token!\nAND chain_id = :chain_id!\nAND used = FALSE\nAND to_address = :to_address!"};

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

const getIntentToMatchTransferIR: any = {"usedParamSet":{"max_spent_token":true,"max_spent_amount":true},"params":[{"name":"max_spent_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":64}]},{"name":"max_spent_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":89,"b":106}]}],"statement":"SELECT * FROM intents \nWHERE  max_spent_token = :max_spent_token!\nAND max_spent_amount = :max_spent_amount!\nAND status = '0'"};

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

const updateIntentResolvedIR: any = {"usedParamSet":{"resolved_by":true,"order_id":true},"params":[{"name":"resolved_by","required":true,"transform":{"type":"scalar"},"locs":[{"a":34,"b":46}]},{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":80,"b":89}]}],"statement":"UPDATE intents \nSET resolved_by = :resolved_by!,  status = '3'\nWHERE order_id = :order_id!"};

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

const getTransferByIdIR: any = {"usedParamSet":{"id":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":36,"b":39}]}],"statement":"SELECT * FROM transfers \nWHERE id = :id!"};

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

const getBestQuoteForOrderIR: any = {"usedParamSet":{"order_id":true},"params":[{"name":"order_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":39,"b":48}]}],"statement":"SELECT * FROM quotes \nWHERE order_id = :order_id!\nORDER BY to_amount ASC\nLIMIT 1"};

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


