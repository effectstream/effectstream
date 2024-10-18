// TODO: delete this file and move it to use paima-rest-schema once the batcher supports it

import { getBackendUri, getBatcherUri } from '../state.js';
import type { QueryOptions, QueryValue } from '../types.js';

function queryValueToString(value: QueryValue): string {
  if (typeof value === 'string') {
    return value;
  } else if (typeof value === 'number') {
    return value.toString(10);
  } else if (typeof value === 'boolean') {
    return value.toString();
  } else {
    throw new Error('[queryValueToString] Invalid query value');
  }
}

// Note: use for backwards compatibility
export function buildBackendQuery(endpoint: string, options: QueryOptions): string {
  return `${getBackendUri()}/${buildQuery(endpoint, options)}`;
}

export function buildQuery(endpoint: string, options: QueryOptions): string {
  const queryString = new URLSearchParams(
    Object.entries(options).map(([k, v]) => [k, queryValueToString(v)])
  ).toString();
  if (queryString.length === 0) {
    return endpoint;
  } else {
    return `${endpoint}?${queryString}`;
  }
}

export function buildBatcherQuery(endpoint: string, options: QueryOptions): string {
  return `${getBatcherUri()}/${buildQuery(endpoint, options)}`;
}

export function batcherQuerySubmitUserInput(): string {
  const endpoint = 'submit_user_input';
  const options = {};
  return buildBatcherQuery(endpoint, options);
}

export function batcherQueryTrackUserInput(inputHash: string): string {
  const endpoint = 'track_user_input';
  const options = {
    input_hash: inputHash,
  };
  return buildBatcherQuery(endpoint, options);
}
