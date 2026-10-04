// `bun run bridge:record` (plan 00058 Interfaces I-3 (c)): writes this deployment's public record,
// after checking every field against both chains (packages/node/record.ts). Nothing is written on
// any mismatch. Default output: deployments/<deployment>.record.json (gitignored).
import fs from "node:fs";
import path from "node:path";
import { loadBridgeNodeSettings } from "@solana-midnight-bridge/node/config";
import { buildDeploymentRecord, liveRecordReads } from "@solana-midnight-bridge/node/record";
import type { RecordArgs } from "./args.ts";

export function recordPath(deploymentFile: string, out?: string): string {
  if (out) return path.resolve(out);
  return deploymentFile.replace(/\.json$/, "") + ".record.json";
}

export async function record(args: RecordArgs): Promise<void> {
  const settings = loadBridgeNodeSettings(args.mode);
  const rec = await buildDeploymentRecord(settings, liveRecordReads(settings.solanaRpcUrl, settings.midnightUrls), {
    api: args.api,
    ...(args.name !== undefined ? { name: args.name } : {}),
    ...(args.symbol !== undefined ? { symbol: args.symbol } : {}),
  });
  const file = recordPath(settings.deploymentFile, args.out);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2) + "\n");
  fs.renameSync(tmp, file);
  console.log(`Wrote ${file}: ${rec.splMint} → ${rec.bridgeContract} (colour ${rec.colour}), checked against both chains`);
}
