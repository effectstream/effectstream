import { Application } from "@oak/oak/application";
import { Router } from "@oak/oak/router";
import routeStaticFilesFrom from "./util/routeStaticFilesFrom.ts";
import { ENV } from "@effectstream/utils/node-env";

export const app = new Application();
const router = new Router();

app.use(router.routes());
app.use(routeStaticFilesFrom([
  `${Deno.cwd()}/client/dist`,
  `${Deno.cwd()}/client/public`,
]));

// If this is the entry point, start the server
if (import.meta.main) {
  console.log(
    `Server listening on port http://localhost:${ENV.EFFECTSTREAM_EXPLORER_PORT}`,
  );
  await app.listen({ port: ENV.EFFECTSTREAM_EXPLORER_PORT });
}
