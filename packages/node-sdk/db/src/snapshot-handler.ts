import { PGlite } from "@electric-sql/pglite";

interface SnapshotConfig {
  path?: string;
  retention?: {
    maxSnapshots?: number;
    maxBlockRange?: number;
  };
}

export async function handleSnapshotTrigger(db: PGlite, dataStr: string) {
    // Extract block height and config (simple parsing, assuming it follows the string)
    // The query sent by pg protocol might contain other bytes, so we look for the pattern.
    // We expect the query to be constructed as: SELECT 'PAIMA_SNAPSHOT_TRIGGER', 123, '{"path":"./snapshots","retention":{"maxSnapshots":5}}'
    // In pg wire protocol, this will be inside a 'Q' (Query) message.
    try {
      // Regex to find the block height and optional config JSON after the trigger string
      // Pattern: PAIMA_SNAPSHOT_TRIGGER', <block_height>, '<json_config>'
      // Match block height, then optionally match JSON config between single quotes
      const match = dataStr.match(/PAIMA_SNAPSHOT_TRIGGER'.*?(\d+)(?:,\s*'([^']*(?:''[^']*)*)')?/);
      if (match && match[1]) {
        const blockHeight = parseInt(match[1], 10);
        
        // Parse config JSON if present
        let config: SnapshotConfig = {};
        if (match[2]) {
          try {
            // Unescape SQL-escaped single quotes ('') back to single quotes (')
            // This handles SQL string literal escaping in the protocol message
            const unescapedJson = match[2].replace(/''/g, "'");
            config = JSON.parse(unescapedJson);
          } catch (e) {
            console.warn("[Pglite] Failed to parse snapshot config JSON, using defaults:", e);
            // Continue with empty config if parsing fails
          }
        }
        
        const snapshotDir = config.path || "./snapshots";
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
          
          // Apply retention policy
          await applyRetentionPolicy(snapshotDir, blockHeight, config.retention);
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

async function applyRetentionPolicy(
  snapshotDir: string,
  currentBlockHeight: number,
  retention?: { maxSnapshots?: number; maxBlockRange?: number }
) {
  if (!retention) {
    return;
  }
  try {
    if (retention.maxSnapshots !== undefined && retention.maxSnapshots <= 0) {
      console.warn(`[Pglite] Invalid maxSnapshots value: ${retention.maxSnapshots}. Must be > 0.`);
      return;
    }
    if (retention.maxBlockRange !== undefined && retention.maxBlockRange <= 0) {
      console.warn(`[Pglite] Invalid maxBlockRange value: ${retention.maxBlockRange}. Must be > 0.`);
      return;
    }

    const snapshotFiles: Array<{ name: string; blockHeight: number; path: string }> = [];
    
    try {
      for await (const entry of Deno.readDir(snapshotDir)) {
        if (entry.isFile && entry.name.startsWith("snapshot-") && entry.name.endsWith(".tar.gz")) {
          const match = entry.name.match(/snapshot-(\d+)\.tar\.gz/);
          if (match && match[1]) {
            const blockHeight = parseInt(match[1], 10);
            snapshotFiles.push({
              name: entry.name,
              blockHeight,
              path: `${snapshotDir}/${entry.name}`,
            });
          }
        }
      }
    } catch (e) {
      // Directory might not exist or be readable, skip retention
      console.warn("[Pglite] Could not read snapshot directory for retention:", e);
      return;
    }

    snapshotFiles.sort((a, b) => a.blockHeight - b.blockHeight);

    const filesToDelete: string[] = [];

    if (retention.maxSnapshots && snapshotFiles.length > retention.maxSnapshots) {
      const filesToKeep = snapshotFiles.slice(-retention.maxSnapshots);
      const filesToRemove = snapshotFiles.slice(0, snapshotFiles.length - retention.maxSnapshots);
      filesToDelete.push(...filesToRemove.map(f => f.path));
      console.log(`[Pglite] Retention: Keeping ${retention.maxSnapshots} snapshots, deleting ${filesToRemove.length} old snapshots`);
    }

    if (retention.maxBlockRange) {
      const cutoffBlock = currentBlockHeight - retention.maxBlockRange;
      const filesOutsideRange = snapshotFiles.filter(f => f.blockHeight < cutoffBlock);
      filesToDelete.push(...filesOutsideRange.map(f => f.path));
      if (filesOutsideRange.length > 0) {
        console.log(`[Pglite] Retention: Deleting ${filesOutsideRange.length} snapshots outside block range (older than block ${cutoffBlock})`);
      }
    }

    const uniqueFilesToDelete = [...new Set(filesToDelete)];
    for (const filePath of uniqueFilesToDelete) {
      try {
        await Deno.remove(filePath);
        console.log(`[Pglite] Deleted old snapshot: ${filePath}`);
      } catch (e) {
        console.warn(`[Pglite] Failed to delete snapshot ${filePath}:`, e);
      }
    }
  } catch (err) {
    console.error("[Pglite] Error applying retention policy:", err);
  }
}
