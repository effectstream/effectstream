import { join } from "node:path";
import { stat } from "node:fs/promises";

const STATIC_PATHS = [
  `${process.cwd()}/client/dist`,
  `${process.cwd()}/client/public`,
];

async function tryServeFile(pathname: string): Promise<Response | null> {
  for (const root of STATIC_PATHS) {
    try {
      let filePath = join(root, pathname);
      let fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = join(filePath, "index.html");
        fileStat = await stat(filePath);
      }
      if (fileStat.isFile()) {
        return new Response(Bun.file(filePath));
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Default EVM-Midnight dApp Port
const PORT = 10599;

export const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const response = await tryServeFile(url.pathname);
    if (response) return response;
    // SPA fallback: serve index.html for unmatched routes
    const fallback = await tryServeFile("/index.html");
    if (fallback) return fallback;
    return new Response("Not Found", { status: 404 });
  },
});

// If this is the entry point, log the server
if (import.meta.main) {
  console.log(
    `Server listening on port http://localhost:${PORT}`,
  );
}
