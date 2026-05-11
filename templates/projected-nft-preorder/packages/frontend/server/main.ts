import Fastify from "fastify";
import staticPlugin from "@fastify/static";
import path from "node:path";

const PORT = 10599;
const DIST = path.resolve(import.meta.dirname!, "../dist");
const API_URL = process.env.API_URL || "http://localhost:9999";
const DOLOS_URL = process.env.DOLOS_URL || "http://localhost:3000";
const YACI_URL = process.env.YACI_URL || "http://localhost:10000";

const server = Fastify({ logger: false });

async function proxyRequest(
  upstream: string,
  prefix: string,
  request: any,
  reply: any,
) {
  const path = request.url.replace(new RegExp(`^${prefix}`), "") || "/";
  const url = `${upstream}${path}`;
  const headers: Record<string, string> = {};
  if (request.headers["content-type"]) {
    headers["content-type"] = request.headers["content-type"];
  }

  const fetchOpts: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = request.body;
    if (typeof body === "string" || body instanceof Buffer || body instanceof Uint8Array) {
      fetchOpts.body = body;
    } else if (body != null) {
      fetchOpts.body = JSON.stringify(body);
    }
  }

  const res = await fetch(url, fetchOpts);
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const data = await res.arrayBuffer();
  reply
    .code(res.status)
    .header("content-type", contentType)
    .send(Buffer.from(data));
}

server.addContentTypeParser("application/cbor", { parseAs: "buffer" }, (_req: any, body: Buffer, done: any) => {
  done(null, body);
});

server.addContentTypeParser("application/json", { parseAs: "string" }, (_req: any, body: string, done: any) => {
  try {
    done(null, JSON.parse(body));
  } catch {
    done(null, body);
  }
});

server.all("/api/*", async (request, reply) => {
  await proxyRequest(API_URL, "", request, reply);
});

server.all("/yaci/*", async (request, reply) => {
  await proxyRequest(YACI_URL, "/yaci", request, reply);
});

server.all("/dolos/*", async (request, reply) => {
  await proxyRequest(DOLOS_URL, "/dolos", request, reply);
});

server.register(staticPlugin, {
  root: DIST,
  prefix: "/",
});

server.setNotFoundHandler((_req, reply) => {
  reply.sendFile("index.html");
});

server.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`Frontend server running at http://localhost:${PORT}`);
});
