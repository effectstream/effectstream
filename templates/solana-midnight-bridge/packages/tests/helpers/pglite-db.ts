// In-process PGLite with the template's migrations, plus a driver that runs a
// state-machine generator the way the runtime does (process-blocks.ts):
// every yielded QueuedUpdate is executed as a pgtyped PreparedQuery and its
// rows are fed back. No server, no ports.
import { PGlite } from "@electric-sql/pglite";
import { PreparedQuery } from "@pgtyped/runtime";
import { migrationTable } from "@solana-midnight-bridge/database";

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  for (const m of migrationTable) await db.exec(m.sql);
  return db;
}

/** A pg-compatible connection for pgtyped's `.run(params, conn)`. */
export function asConnection(db: PGlite) {
  return {
    query: (text: string, values?: unknown[]) => db.query(text, values as any[]),
  };
}

export async function runGenerator(db: PGlite, gen: Generator<unknown, unknown, unknown>): Promise<void> {
  const conn = asConnection(db);
  let r = gen.next();
  while (!r.done) {
    const v = r.value;
    if (Array.isArray(v) && v.length === 2) {
      const [ir, params] = v as [unknown, unknown];
      const rows = await new PreparedQuery(ir as any).run(params as any, conn as any);
      r = gen.next(rows);
    } else if (v && typeof v === "object" && "promise" in (v as object)) {
      const out = await (v as { promise: Promise<unknown> }).promise;
      r = gen.next([out]);
    } else {
      throw new Error(`unexpected yield from the state machine: ${JSON.stringify(v)}`);
    }
  }
}

/** All rows of bridge_transfers without the wall-clock columns, in key order. */
export async function transferRows(db: PGlite) {
  const r = await db.query<Record<string, unknown>>(
    `SELECT direction, source_id::TEXT AS source_id, amount::TEXT AS amount, recipient, sender, status,
            src_ref, dst_ref, observed_block, completed_block
     FROM bridge_transfers ORDER BY direction, source_id`,
  );
  return r.rows;
}
