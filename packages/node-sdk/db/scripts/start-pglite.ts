import { type DebugLevel, PGlite } from "@electric-sql/pglite";
// TODO This is not working, so we load the pg_ivm extension from the node_modules folder
// import { pg_ivm } from "@electric-sql/pglite/pg_ivm";
import net from "node:net";
import { fromNodeSocket } from "pg-gateway/node";
import { ENV } from "@effectstream/utils/node-env";

// TODO PORT be a ENV variable
// Get port from arguments.
const portArgName = "--port";
const portArgIndex = Deno.args.indexOf(portArgName);
const portValue = portArgIndex !== -1 ? Deno.args[portArgIndex + 1] : "5432";
const port = parseInt(portValue);
if (isNaN(port)) {
  throw new Error(`Port argument ${portArgName} is not a number`);
}

// TODO: find nearest node_modules folder, as import { pg_ivm } is not working
let nodeModulesPath = Deno.cwd();
while (true) {
  try {
    !Deno.statSync(nodeModulesPath + "/node_modules").isDirectory;
    break;
  } catch (e) {
    if (!nodeModulesPath || nodeModulesPath === "/") {
      throw new Error("Node modules not found");
    }
    nodeModulesPath = nodeModulesPath.split("/").slice(0, -1).join("/");
  }
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

        await handleSnapshotTrigger(db, data);

        // Forward raw message to PGlite and send response to client
        return await db.execProtocolRaw(data);
      },
    });
  });

  server.listen(port, () => {
    console.info(`database: server listening on port ${port}`);
  });
}

async function handleSnapshotTrigger(db: PGlite, data: Uint8Array) {
  const dataStr = new TextDecoder().decode(data);
  // Check for Snapshot Trigger
  // Format: SELECT 'PAIMA_SNAPSHOT_TRIGGER', <block_height>
  if (dataStr.includes("PAIMA_SNAPSHOT_TRIGGER")) {
    // Extract block height (simple parsing, assuming it follows the string)
    // The query sent by pg protocol might contain other bytes, so we look for the pattern.
    // We expect the query to be constructed as: SELECT 'PAIMA_SNAPSHOT_TRIGGER', 123
    // In pg wire protocol, this will be inside a 'Q' (Query) message.
    try {
      // Regex to find the block height after the trigger string
      // It handles potential quotes or spacing
      const match = dataStr.match(/PAIMA_SNAPSHOT_TRIGGER'.*?(\d+)/);
      if (match && match[1]) {
        const blockHeight = parseInt(match[1], 10);
        const snapshotDir = "./snapshots";
        const snapshotPath = `${snapshotDir}/snapshot-${blockHeight}.tar.gz`;
        console.log(`[Pglite] Creating snapshot at ${snapshotPath}...`);

        try {
          await Deno.mkdir(snapshotDir, { recursive: true });
          const dump = await db.dumpDataDir();
          if (dump instanceof Blob) {
            const buffer = new Uint8Array(await dump.arrayBuffer());
            await Deno.writeFile(snapshotPath, buffer);
          } else if (dump instanceof Uint8Array) {
            await Deno.writeFile(snapshotPath, dump);
          } else {
            // Fallback if type is unexpected, though PGlite usually returns Blob or File
            console.warn("[Pglite] Unexpected dump type:", typeof dump);
          }
          console.log(`[Pglite] Snapshot created.`);
        } catch (e) {
          console.error("[Pglite] Error writing snapshot:", e);
        }
      } else {
        console.warn(
          "[Pglite] Snapshot trigger received but could not parse block height.",
        );
      }
    } catch (err) {
      console.error("[Pglite] Failed to create snapshot:", err);
    }
  }
}
