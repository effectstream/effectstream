/** Types generated for queries found in "src/sql/events.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** 'GetEvents' parameters type */
export interface IGetEventsParams {
  address?: string | null | void;
  from?: number | null | void;
  to?: number | null | void;
  topic: string;
}

/** 'GetEvents' return type */
export interface IGetEventsResult {
  address: string;
  block_height: number;
  data: Json;
  id: number;
  log_index: number;
  topic: string;
  tx_index: number;
}

/** 'GetEvents' query type */
export interface IGetEventsQuery {
  params: IGetEventsParams;
  result: IGetEventsResult;
}

const getEventsIR: any = {"usedParamSet":{"from":true,"to":true,"address":true,"topic":true},"params":[{"name":"from","required":false,"transform":{"type":"scalar"},"locs":[{"a":53,"b":57}]},{"name":"to","required":false,"transform":{"type":"scalar"},"locs":[{"a":96,"b":98}]},{"name":"address","required":false,"transform":{"type":"scalar"},"locs":[{"a":131,"b":138}]},{"name":"topic","required":true,"transform":{"type":"scalar"},"locs":[{"a":160,"b":166}]}],"statement":"SELECT * FROM event WHERE\n  COALESCE(block_height >= :from, 1=1) AND\n  COALESCE(block_height <= :to, 1=1) AND\n  COALESCE(address = :address, 1=1) AND\n  topic = :topic!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT * FROM event WHERE
 *   COALESCE(block_height >= :from, 1=1) AND
 *   COALESCE(block_height <= :to, 1=1) AND
 *   COALESCE(address = :address, 1=1) AND
 *   topic = :topic!
 * ```
 */
export const getEvents = new PreparedQuery<IGetEventsParams,IGetEventsResult>(getEventsIR);


/** 'InsertEvent' parameters type */
export interface IInsertEventParams {
  address: string;
  block_height: number;
  data: Json;
  log_index: number;
  topic: string;
  tx_index: number;
}

/** 'InsertEvent' return type */
export type IInsertEventResult = void;

/** 'InsertEvent' query type */
export interface IInsertEventQuery {
  params: IInsertEventParams;
  result: IInsertEventResult;
}

const insertEventIR: any = {"usedParamSet":{"topic":true,"address":true,"data":true,"block_height":true,"tx_index":true,"log_index":true},"params":[{"name":"topic","required":true,"transform":{"type":"scalar"},"locs":[{"a":101,"b":107}]},{"name":"address","required":true,"transform":{"type":"scalar"},"locs":[{"a":112,"b":120}]},{"name":"data","required":true,"transform":{"type":"scalar"},"locs":[{"a":125,"b":130}]},{"name":"block_height","required":true,"transform":{"type":"scalar"},"locs":[{"a":135,"b":148}]},{"name":"tx_index","required":true,"transform":{"type":"scalar"},"locs":[{"a":153,"b":162}]},{"name":"log_index","required":true,"transform":{"type":"scalar"},"locs":[{"a":167,"b":177}]}],"statement":"INSERT INTO event (\n  topic,\n  address,\n  data,\n  block_height,\n  tx_index,\n  log_index\n) VALUES (\n  :topic!,\n  :address!,\n  :data!,\n  :block_height!,\n  :tx_index!,\n  :log_index!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO event (
 *   topic,
 *   address,
 *   data,
 *   block_height,
 *   tx_index,
 *   log_index
 * ) VALUES (
 *   :topic!,
 *   :address!,
 *   :data!,
 *   :block_height!,
 *   :tx_index!,
 *   :log_index!
 * )
 * ```
 */
export const insertEvent = new PreparedQuery<IInsertEventParams,IInsertEventResult>(insertEventIR);


/** 'RegisterEventType' parameters type */
export interface IRegisterEventTypeParams {
  name: string;
  topic: string;
}

/** 'RegisterEventType' return type */
export type IRegisterEventTypeResult = void;

/** 'RegisterEventType' query type */
export interface IRegisterEventTypeQuery {
  params: IRegisterEventTypeParams;
  result: IRegisterEventTypeResult;
}

const registerEventTypeIR: any = {"usedParamSet":{"name":true,"topic":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":65}]},{"name":"topic","required":true,"transform":{"type":"scalar"},"locs":[{"a":70,"b":76}]}],"statement":"INSERT INTO registered_event (\n  name,\n  topic\n) VALUES (\n  :name!,\n  :topic!\n)"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO registered_event (
 *   name,
 *   topic
 * ) VALUES (
 *   :name!,
 *   :topic!
 * )
 * ```
 */
export const registerEventType = new PreparedQuery<IRegisterEventTypeParams,IRegisterEventTypeResult>(registerEventTypeIR);


/** 'GetTopicsForEvent' parameters type */
export interface IGetTopicsForEventParams {
  name: string;
}

/** 'GetTopicsForEvent' return type */
export interface IGetTopicsForEventResult {
  topic: string;
}

/** 'GetTopicsForEvent' query type */
export interface IGetTopicsForEventQuery {
  params: IGetTopicsForEventParams;
  result: IGetTopicsForEventResult;
}

const getTopicsForEventIR: any = {"usedParamSet":{"name":true},"params":[{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":53}]}],"statement":"SELECT topic FROM registered_event WHERE name = :name!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT topic FROM registered_event WHERE name = :name!
 * ```
 */
export const getTopicsForEvent = new PreparedQuery<IGetTopicsForEventParams,IGetTopicsForEventResult>(getTopicsForEventIR);


/** 'GetTopics' parameters type */
export type IGetTopicsParams = void;

/** 'GetTopics' return type */
export interface IGetTopicsResult {
  name: string;
  topic: string;
}

/** 'GetTopics' query type */
export interface IGetTopicsQuery {
  params: IGetTopicsParams;
  result: IGetTopicsResult;
}

const getTopicsIR: any = {"usedParamSet":{},"params":[],"statement":"SELECT name, topic FROM registered_event"};

/**
 * Query generated from SQL:
 * ```
 * SELECT name, topic FROM registered_event
 * ```
 */
export const getTopics = new PreparedQuery<IGetTopicsParams,IGetTopicsResult>(getTopicsIR);


/** 'GetEventByTopic' parameters type */
export interface IGetEventByTopicParams {
  topic: string;
}

/** 'GetEventByTopic' return type */
export interface IGetEventByTopicResult {
  name: string;
}

/** 'GetEventByTopic' query type */
export interface IGetEventByTopicQuery {
  params: IGetEventByTopicParams;
  result: IGetEventByTopicResult;
}

const getEventByTopicIR: any = {"usedParamSet":{"topic":true},"params":[{"name":"topic","required":true,"transform":{"type":"scalar"},"locs":[{"a":48,"b":54}]}],"statement":"SELECT name FROM registered_event WHERE topic = :topic!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT name FROM registered_event WHERE topic = :topic!
 * ```
 */
export const getEventByTopic = new PreparedQuery<IGetEventByTopicParams,IGetEventByTopicResult>(getEventByTopicIR);


