import type { AllSyncProtocols } from "@paima/sync";
import { getPrimitivePrefix } from "@paima/db";

// System tables created by Paima core migrations (see db/migrations/up.sql)
const SYSTEM_TABLES = new Set<string>([
  "paima_blocks",
  "rollup_inputs",
  "rollup_input_future_block",
  "rollup_input_future_timestamp",
  "rollup_input_result",
  "rollup_input_origin",
  "primitive_accounting",
  "nonces",
  "sync_protocol_pagination",
  "primitive_config",
  "accounts",
  "addresses",
  "achievement_progress",
  "event",
  "registered_event",
]);

// Extra safety: common system prefixes that shouldn't be exposed
const SYSTEM_PREFIXES: string[] = [
  "pg",
  "pg_",
  "information_schema",
  "sql_",
  "paima_",
  "primitive_",
  "rollup_input",
  "sync_protocol_",
];

export function sanitizeIdentifier(name: string): string {
  return name.toLowerCase().replace(/[^a-zA-Z0-9_]/g, "");
}

function buildDynamicPrimitiveDenySet(
  syncProtocols: AllSyncProtocols[],
): Set<string> {
  const deny = new Set<string>();
  for (const sp of syncProtocols) {
    for (const p of sp.config.primitives) {
      const primitiveName = p.primitive.name.toLowerCase();
      const prefix = getPrimitivePrefix(p.primitive.type);
      if (!prefix) continue;
      // Block the view
      deny.add(`${prefix}${primitiveName}`);
      // And block the corresponding intermediate table
      // Convention used in ivm/*-ivm.ts: replace 'view_' with 'intermediate_'
      const intermediatePrefix = prefix.replace("view_", "intermediate_");
      deny.add(`${intermediatePrefix}${primitiveName}`);
    }
  }
  return deny;
}

function isSystemTable(tableName: string): boolean {
  if (SYSTEM_TABLES.has(tableName)) return true;
  for (const prefix of SYSTEM_PREFIXES) {
    if (tableName.startsWith(prefix)) return true;
  }
  return false;
}

export function createIsUserDefinedTableFilter(
  syncProtocols: AllSyncProtocols[],
): (tableName: string) => boolean {
  const dynamicDeny = buildDynamicPrimitiveDenySet(syncProtocols);
  return (tableName: string) => {
    const name = sanitizeIdentifier(tableName);
    const system = isSystemTable(name);
    const dynamic = dynamicDeny.has(name);
    // allow only if not system and not dynamic
    return !system && !dynamic;
  };
}
