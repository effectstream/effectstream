import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const server = Fastify({ logger: false });

server.register(fastifyStatic, {
  root: path.join(import.meta.dirname!, "dist"),
});

server.setNotFoundHandler((_req, reply) => {
  reply.sendFile("index.html");
});

await server.listen({ port: 10599, host: "0.0.0.0" });
console.log("Frontend serving on http://localhost:10599");
