import { GAME_NAME, gameBackendVersion } from "@chess/utils";
import { queryEndpoints } from "./endpoints/queries.ts";
import { writeEndpoints } from "./endpoints/write.ts";

const endpoints = {
  ...queryEndpoints,
  ...writeEndpoints,
};

export * from "./types.ts";
export type * from "./types.ts";

export default endpoints;
