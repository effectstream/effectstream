// import { paimaEndpoints } from "@paimaexample/sdk/mw-core";
// import {
//   getRemoteBackendVersion,
//   initMiddlewareCore,
//   updateBackendUri,
//   userWalletLoginWithoutChecks,
// } from "@paimaexample/sdk/mw-core";
import { GAME_NAME, gameBackendVersion } from "@chess/utils";

import { queryEndpoints } from "./endpoints/queries.ts";
import { writeEndpoints } from "./endpoints/write.ts";

// initMiddlewareCore(GAME_NAME, gameBackendVersion);

const endpoints = {
  // ...paimaEndpoints,
  ...queryEndpoints,
  ...writeEndpoints,
};

export * from "./types.ts";
export type * from "./types.ts";
// export {
// getRemoteBackendVersion,
// updateBackendUri,
// userWalletLoginWithoutChecks,
// };

export default endpoints;
