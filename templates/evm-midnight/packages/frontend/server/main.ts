import { Application } from "@oak/oak/application";
import { Router } from "@oak/oak/router";
import routeStaticFilesFrom from "./util/routeStaticFilesFrom.ts";

export const app = new Application();
const router = new Router();

router.get("/proxy/health", async (ctx) => {
  const url = ctx.request.url.searchParams.get("url");
  if (!url) {
    ctx.response.status = 400;
    ctx.response.body = "url query parameter is required";
    return;
  }
  try {
    const response = await fetch(`${url}/health`);
    if (!response.ok) {
      ctx.response.status = response.status;
      ctx.response.body = await response.text();
      return;
    }
    ctx.response.body = await response.json();
  } catch (e: any) {
    ctx.response.status = 500;
    ctx.response.body = e.message;
  }
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
