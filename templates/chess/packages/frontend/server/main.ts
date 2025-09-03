import { Application } from "@oak/oak/application";
import { Router } from "@oak/oak/router";
import routeStaticFilesFrom from "./util/routeStaticFilesFrom.ts";
import { ENV } from "@paimaexample/utils";

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
    `Server listening on port http://localhost:${ENV.PAIMA_EXPLORER_PORT}`,
  );
  await app.listen({ port: ENV.PAIMA_EXPLORER_PORT });
}
