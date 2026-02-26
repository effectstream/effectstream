import { type DebugLevel, PGlite } from "@electric-sql/pglite";
// TODO This is not working, so we load the pg_ivm extension from the node_modules folder
// import { pg_ivm } from "@electric-sql/pglite/pg_ivm";
import net from "node:net";
import { statSync } from "node:fs";
import { fromNodeSocket } from "pg-gateway/node";
import { ENV } from "@effectstream/utils/node-env";
import { args, cwd } from "@effectstream/utils/runtime";

// TODO PORT be a ENV variable
// Get port from arguments.
const portArgName = "--port";
const argv = args();
const portArgIndex = argv.indexOf(portArgName);
const portValue = portArgIndex !== -1 ? argv[portArgIndex + 1] : "5432";
const port = parseInt(portValue);
if (isNaN(port)) {
  throw new Error(`Port argument ${portArgName} is not a number`);
}

// TODO: find nearest node_modules folder, as import { pg_ivm } is not working
const extensionSubPath = "/node_modules/@electric-sql/pglite/dist/pg_ivm.tar.gz";
let nodeModulesPath = cwd();
while (true) {
  try {
    const st = statSync(nodeModulesPath + extensionSubPath);
    if (st.isFile()) break;
  } catch (_e) {
    // not found
  }
  if (!nodeModulesPath || nodeModulesPath === "/") {
    throw new Error("Could not find pglite pg_ivm extension in any parent node_modules");
  }
  nodeModulesPath = nodeModulesPath.split("/").slice(0, -1).join("/");
}

const db = new PGlite(
  "memory://", // TODO: use different values for in-browser & production builds
  {
    username: ENV.DB_USER,
    database: ENV.DB_NAME,
    extensions: {
      // pg_ivm: pg_ivm,
      pg_ivm: new URL(
        nodeModulesPath +
          "/node_modules/@electric-sql/pglite/dist/pg_ivm.tar.gz",
        "file://",
      ),
    },
    debug: (ENV.DEBUG_PGLITE as DebugLevel) || 0,
  },
);

{
  // TODO: consider switching to pglite-socket once it works
  //       https://discord.com/channels/933657521581858818/1371976702674075780/1371992712076595250
  const server = net.createServer(async (socket) => {
    await fromNodeSocket(socket, {
      serverVersion: "16.3",

      auth: {
        // No password required
        method: "trust",
      },

      async onStartup() {
        // Wait for PGlite to be ready before further processing
        await db.waitReady;
      },

      // Hook into each client message
      async onMessage(data, { isAuthenticated }) {
        // Only forward messages to PGlite after authentication
        if (!isAuthenticated) {
          return;
        }

        // Forward raw message to PGlite and send response to client
        return await db.execProtocolRaw(data);
      },
    });
  });

  server.listen(port, () => {
    console.info(`database: server listening on port ${port}`);
  });
}
