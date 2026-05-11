import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";

const PORT = 10599;
const API_UPSTREAM = process.env.VITE_API_URL || "http://localhost:9999";
const YACI_UPSTREAM = process.env.YACI_URL || "http://localhost:10000";
const DOLOS_BLOCKFROST_URL = "http://localhost:3000";

const server = Fastify();

server.addContentTypeParser(
  "application/cbor",
  { parseAs: "buffer" },
  (_req, body, done) => {
    done(null, body);
  },
);

server.all("/api/*", async (request, reply) => {
  const url = `${API_UPSTREAM}${request.url}`;
  const res = await fetch(url, { method: request.method });
  reply.code(res.status);
  for (const [k, v] of res.headers) {
    if (k !== "transfer-encoding") reply.header(k, v);
  }
  return reply.send(res.body);
});

server.all("/yaci/*", async (request, reply) => {
  const yaciPath = request.url.replace(/^\/yaci/, "/local-cluster/api");
  const url = `${YACI_UPSTREAM}${yaciPath}`;
  const hasBody =
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    request.body != null;
  const isCbor = request.headers["content-type"]?.includes("cbor");
  const res = await fetch(url, {
    method: request.method,
    headers: hasBody
      ? { "content-type": request.headers["content-type"] || "application/json" }
      : {},
    body: hasBody
      ? isCbor
        ? (request.body as Buffer)
        : JSON.stringify(request.body)
      : undefined,
  });
  reply.code(res.status);
  for (const [k, v] of res.headers) {
    if (k !== "transfer-encoding") reply.header(k, v);
  }
  return reply.send(res.body);
});

server.all("/dolos/*", async (request, reply) => {
  const dolosPath = request.url.replace(/^\/dolos/, "");
  const url = `${DOLOS_BLOCKFROST_URL}${dolosPath}`;
  const res = await fetch(url, { method: request.method });
  reply.code(res.status);
  for (const [k, v] of res.headers) {
    if (k !== "transfer-encoding") reply.header(k, v);
  }
  return reply.send(res.body);
});

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
