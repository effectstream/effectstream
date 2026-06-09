import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const server = Fastify({ logger: false });

server.register(fastifyStatic, {
  // Serves the real Hex Battle game: site/index.html, site/assets/* (sprites,
  // fonts, popup.js, style.css) and the esbuild output site/bundle.js.
  root: path.join(import.meta.dirname!, "site"),
});

server.setNotFoundHandler((_req, reply) => {
  reply.sendFile("index.html");
});

await server.listen({ port: 10599, host: "0.0.0.0" });
console.log("Frontend serving on http://localhost:10599");
