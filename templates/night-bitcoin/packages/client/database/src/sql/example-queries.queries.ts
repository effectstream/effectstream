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


/** 'InsertDeposit' parameters type */
export interface IInsertDepositParams {
  amount: NumberOrString;
  chain_id: string;
  token: string;
  user_address: string;
}

/** 'InsertDeposit' return type */
export type IInsertDepositResult = void;

/** 'InsertDeposit' query type */
export interface IInsertDepositQuery {
  params: IInsertDepositParams;
  result: IInsertDepositResult;
}

const insertDepositIR: any = {"usedParamSet":{"amount":true,"token":true,"chain_id":true,"user_address":true},"params":[{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":72,"b":79}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":88}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":91,"b":100}]},{"name":"user_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":103,"b":116}]}],"statement":"INSERT INTO deposits \n(amount, token, chain_id, user_address) \nVALUES \n(:amount!, :token!, :chain_id!, :user_address!)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO deposits 
 * (amount, token, chain_id, user_address) 
 * VALUES 
 * (:amount!, :token!, :chain_id!, :user_address!)
 * ```
 */
export const insertDeposit = new PreparedQuery<IInsertDepositParams,IInsertDepositResult>(insertDepositIR);


/** 'UpdateDepositUsed' parameters type */
export interface IUpdateDepositUsedParams {
  amount: NumberOrString;
  chain_id: string;
  token: string;
  user_address: string;
}

/** 'UpdateDepositUsed' return type */
export type IUpdateDepositUsedResult = void;

/** 'UpdateDepositUsed' query type */
export interface IUpdateDepositUsedQuery {
  params: IUpdateDepositUsedParams;
  result: IUpdateDepositUsedResult;
}

const updateDepositUsedIR: any = {"usedParamSet":{"user_address":true,"token":true,"chain_id":true,"amount":true},"params":[{"name":"user_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":68}]},{"name":"token","required":true,"transform":{"type":"scalar"},"locs":[{"a":82,"b":88}]},{"name":"chain_id","required":true,"transform":{"type":"scalar"},"locs":[{"a":105,"b":114}]},{"name":"amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":129,"b":136}]}],"statement":"UPDATE deposits \nSET used = TRUE \nWHERE user_address = :user_address!\nAND token = :token!\nAND chain_id = :chain_id!\nAND amount = :amount!"};

/**
 * Query generated from SQL:
 * ```
 * UPDATE deposits 
 * SET used = TRUE 
 * WHERE user_address = :user_address!
 * AND token = :token!
 * AND chain_id = :chain_id!
 * AND amount = :amount!
 * ```
 */
export const updateDepositUsed = new PreparedQuery<IUpdateDepositUsedParams,IUpdateDepositUsedResult>(updateDepositUsedIR);


/** 'GetDeposits' parameters type */
export interface IGetDepositsParams {
  user_address: string;
}

/** 'GetDeposits' return type */
export interface IGetDepositsResult {
  amount: string;
  chain_id: string;
  created_at: Date;
  id: number;
  token: string;
  used: boolean;
  user_address: string;
}

/** 'GetDeposits' query type */
export interface IGetDepositsQuery {
  params: IGetDepositsParams;
  result: IGetDepositsResult;
}

const getDepositsIR: any = {"usedParamSet":{"user_address":true},"params":[{"name":"user_address","required":true,"transform":{"type":"scalar"},"locs":[{"a":45,"b":58}]}],"statement":"SELECT * FROM deposits \nWHERE user_address = :user_address!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM deposits 
 * WHERE user_address = :user_address!
 * ```
 */
export const getDeposits = new PreparedQuery<IGetDepositsParams,IGetDepositsResult>(getDepositsIR);


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


/** 'GetIntentByAddressAndAmount' parameters type */
export interface IGetIntentByAddressAndAmountParams {
  max_spent_amount: string;
  max_spent_recipient: string;
  max_spent_token: string;
}

/** 'GetIntentByAddressAndAmount' return type */
export interface IGetIntentByAddressAndAmountResult {
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
  status: string;
  user_address: string;
}

/** 'GetIntentByAddressAndAmount' query type */
export interface IGetIntentByAddressAndAmountQuery {
  params: IGetIntentByAddressAndAmountParams;
  result: IGetIntentByAddressAndAmountResult;
}

const getIntentByAddressAndAmountIR: any = {"usedParamSet":{"max_spent_recipient":true,"max_spent_amount":true,"max_spent_token":true},"params":[{"name":"max_spent_recipient","required":true,"transform":{"type":"scalar"},"locs":[{"a":51,"b":71}]},{"name":"max_spent_amount","required":true,"transform":{"type":"scalar"},"locs":[{"a":96,"b":113}]},{"name":"max_spent_token","required":true,"transform":{"type":"scalar"},"locs":[{"a":137,"b":153}]}],"statement":"SELECT * FROM intents \nWHERE max_spent_recipient = :max_spent_recipient!\nAND max_spent_amount = :max_spent_amount!\nAND max_spent_token = :max_spent_token!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM intents 
 * WHERE max_spent_recipient = :max_spent_recipient!
 * AND max_spent_amount = :max_spent_amount!
 * AND max_spent_token = :max_spent_token!
 * ```
 */
export const getIntentByAddressAndAmount = new PreparedQuery<IGetIntentByAddressAndAmountParams,IGetIntentByAddressAndAmountResult>(getIntentByAddressAndAmountIR);


