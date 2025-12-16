import { paimaEndpoints } from '@paima/sdk/mw-core';
import {
  initMiddlewareCore,
  updateBackendUri,
  getRemoteBackendVersion,
  postConciselyEncodedData,
} from '@paima/sdk/mw-core';

import { gameBackendVersion, GAME_NAME } from '@game/utils';

import { queryEndpoints } from './endpoints/queries';
import { writeEndpoints } from './endpoints/write';

initMiddlewareCore(GAME_NAME, gameBackendVersion);

const endpoints = {
  ...paimaEndpoints,
  ...queryEndpoints,
  ...writeEndpoints,
};

export * from './types';
export type * from './types';
export { updateBackendUri, getRemoteBackendVersion, postConciselyEncodedData };

export default endpoints;
