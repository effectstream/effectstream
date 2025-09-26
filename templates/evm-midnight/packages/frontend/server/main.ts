import { Application } from "@oak/oak/application";
import { Router } from "@oak/oak/router";
import routeStaticFilesFrom from "./util/routeStaticFilesFrom.ts";

export const app = new Application();
const router = new Router();

router.get("/proxy/health", (ctx) => {
  // Select the correct midnight node URL based on RUN_IN_DOCKER
  const BASE_URL_MIDNIGHT_NODE_A = "http://127.0.0.1:9944";
  const BASE_URL_MIDNIGHT_NODE_B = "http://127.0.0.1:8080";
  const runInDocker = Deno.env.get("RUN_IN_DOCKER") === "true";
  const url = runInDocker ? BASE_URL_MIDNIGHT_NODE_B : BASE_URL_MIDNIGHT_NODE_A;
  ctx.response.body = { url };
});

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
