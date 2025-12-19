import { PGlite } from "@electric-sql/pglite";

export async function handleSnapshotTrigger(db: PGlite, dataStr: string) {
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
