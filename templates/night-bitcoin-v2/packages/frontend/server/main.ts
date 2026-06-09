import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const PORT = 10599;

const server = Fastify();

server.register(fastifyStatic, {
  root: path.join(process.cwd(), "client", "dist"),
  prefix: "/",
});

server.setNotFoundHandler(async (_request, reply) => {
  return reply.sendFile("index.html");
});

if (import.meta.main) {
  server.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`Server listening on ${address}`);
  });
}
