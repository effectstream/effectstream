import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import * as path from "node:path";
import { ENV } from "@effectstream/utils/node-env";

export const app = Fastify();

// Serve built client assets, falling back to public folder
app.register(fastifyStatic, {
  root: [
    path.join(process.cwd(), "client", "dist"),
    path.join(process.cwd(), "client", "public"),
  ],
  prefix: "/",
});

if (import.meta.main) {
  const port = ENV.EFFECTSTREAM_EXPLORER_PORT;
  app.listen({ port, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening on ${address}`);
  });
}
