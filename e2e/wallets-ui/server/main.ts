import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { join } from "node:path";

export const app = Fastify();

app.register(fastifyStatic, {
  root: join(process.cwd(), "client/dist"),
  prefix: "/",
});

const PORT = 4201;

if (import.meta.main) {
  console.log(`Server listening on port http://localhost:${PORT}`);
  await app.listen({ port: PORT });
}
