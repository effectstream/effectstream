import { Application } from "@oak/oak/application";
import { Router } from "@oak/oak/router";
import routeStaticFilesFrom from "./util/routeStaticFilesFrom.ts";

export const app = new Application();
const router = new Router();

app.use(router.routes());
app.use(routeStaticFilesFrom([
  `${Deno.cwd()}/client/dist`,
  `${Deno.cwd()}/client/public`,
]));

// Default EVM-Midnight dApp Port
const PORT = 10599;
// If this is the entry point, start the server
if (import.meta.main) {
  console.log(
    `Server listening on port http://localhost:${PORT}`,
  );
  await app.listen({ port: PORT });
}
