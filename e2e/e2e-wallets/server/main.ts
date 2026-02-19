import { Application } from "@oak/oak/application";
import { Router } from "@oak/oak/router";
import routeStaticFilesFrom from "./util/routeStaticFilesFrom.ts";
import { cwd } from "@effectstream/utils/runtime";

export const app = new Application();
const router = new Router();

app.use(router.routes());
app.use(routeStaticFilesFrom([
  `${cwd()}/client/dist`,
  `${cwd()}/client/public`,
]));

// Default Wallets E2E
const PORT = 4001;
// If this is the entry point, start the server
if (import.meta.main) {
  console.log(
    `Server listening on port http://localhost:${PORT}`,
  );
  await app.listen({ port: PORT });
}
