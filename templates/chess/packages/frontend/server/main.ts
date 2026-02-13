import { Application } from "@oak/oak/application";
import { Router } from "@oak/oak/router";
import routeStaticFilesFrom from "./util/routeStaticFilesFrom.ts";

export const app = new Application();
const router = new Router();
const PORT = 10599;

app.use(router.routes());
app.use(routeStaticFilesFrom([
  `${process.cwd()}/client/dist`,
  `${process.cwd()}/client/public`,
]));

// If this is the entry point, start the server
if (import.meta.main) {
  console.log(
    `Server listening on port http://localhost:${PORT}`,
  );
  await app.listen({ port: PORT });
}
