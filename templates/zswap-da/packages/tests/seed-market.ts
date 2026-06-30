// seed-market.ts — populate the indexer DB with consistent market data for 2
// pairs so the whole UI (order book, depth, 24h stats, trade history) can be
// tested without minting/proving/settling real swaps by hand.
//
//   • Historic trades → offer_file_history (archive_reason='CONSUMED'): a
//     coherent price random-walk over the last ~48h per pair. These back
//     /api/chart/history and /api/chart/stats.
//   • Live order book → offer_file (+ offer_file_tokens): asks above / bids
//     below each pair's mid. These back /api/zswaps → the on-screen order book.
//
// All inserts are DIRECT SQL against the dev PGlite (127.0.0.1:5432). They are
// DISPLAY-real: they render and price exactly like real offers, but the seeded
// order-book entries carry a placeholder blob so they are NOT settle-able (use
// packages/tests/two-wallet-swap-e2e.ts for a real takeable offer). Idempotent:
// everything seeded lives at id >= SEED_BASE and is wiped before each run.
//
// Run:  bun run packages/tests/seed-market.ts        (or: bun run seed:market)

import pg from "pg";

const SEED_BASE = 9_000_000; // all seeded rows live at/above this id
const HISTORY_BASE = 9_000_000;
const BOOK_BASE = 9_500_000;
const NIGHT = "0000000000000000000000000000000000000000000000000000000000000000";

// Two pairs built from the dev mint-test-tokens colors (base traded vs NIGHT).
const TOKENS = [
  { color: NIGHT, name: "NIGHT", kind: "unshielded" },
  { color: "70ce552eaec9be6e009189bffbb69184b2dd008ba9bdaec6da5305fc505eb569", name: "TESTTOKENA", kind: "shielded" },
  { color: "63b27ee9d4d94ebce3ce1bcee67f3730a87fcbfce5a8dba2c5552a0f54797bd4", name: "TESTTOKENB", kind: "shielded" },
];
const PAIRS = [
  { base: TOKENS[1]!, quote: TOKENS[0]!, mid: 12.5, histTrades: 48, bookLevels: 6 }, // TESTTOKENA / NIGHT
  { base: TOKENS[2]!, quote: TOKENS[0]!, mid: 0.85, histTrades: 40, bookLevels: 5 }, // TESTTOKENB / NIGHT
];

const HOUR = 3_600_000;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ri = (a: number, b: number) => Math.round(rnd(a, b));

const client = new pg.Client({
  host: process.env["DB_HOST"] ?? "127.0.0.1",
  port: Number(process.env["DB_PORT"] ?? 5432),
  user: process.env["DB_USER"] ?? "postgres",
  password: process.env["DB_PW"] ?? "postgres",
  database: process.env["DB_NAME"] ?? "postgres",
});

async function q(sql: string, params: unknown[] = []) {
  return (await client.query(sql, params)).rows;
}

/** One offer leg: GIVING `giveColor`/`giveAmt`, WANTING `wantColor`/`wantAmt`. */
function legsFor(side: "ask" | "bid", base: string, quote: string, baseAmt: number, price: number) {
  const quoteAmt = Math.max(1, Math.round(baseAmt * price));
  return side === "ask"
    ? { give: [base, baseAmt], want: [quote, quoteAmt] } // sell base for quote
    : { give: [quote, quoteAmt], want: [base, baseAmt] }; // buy base with quote
}

async function ensureTokens() {
  for (const t of TOKENS) {
    await q(
      `INSERT INTO known_tokens (token_color, name, kind) VALUES ($1, $2, $3)
       ON CONFLICT (token_color) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind`,
      [t.color, t.name, t.kind],
    );
  }
}

async function wipe() {
  await q(`DELETE FROM offer_file_tokens_history WHERE offer_file_id >= $1`, [SEED_BASE]);
  await q(`DELETE FROM offer_file_history WHERE id >= $1`, [SEED_BASE]);
  await q(`DELETE FROM offer_file_tokens WHERE offer_file_id >= $1`, [SEED_BASE]);
  await q(`DELETE FROM offer_file WHERE id >= $1`, [SEED_BASE]);
}

let histId = HISTORY_BASE;
let bookId = BOOK_BASE;

async function seedHistory(p: (typeof PAIRS)[number]) {
  const now = Date.now();
  const span = 48 * HOUR;
  let price = p.mid * rnd(0.92, 1.08);
  let fills = 0;
  for (let i = 0; i < p.histTrades; i++) {
    // random walk that gently mean-reverts toward mid, ending near it
    price *= 1 + rnd(-0.018, 0.018) + (p.mid - price) / p.mid * 0.05;
    price = Math.max(p.mid * 0.6, Math.min(p.mid * 1.6, price));
    const at = new Date(now - span + (span * (i + rnd(0, 0.6))) / p.histTrades).toISOString();
    const side = Math.random() < 0.5 ? "ask" : "bid";
    const baseAmt = ri(2, 40);
    const { give, want } = legsFor(side, p.base.color, p.quote.color, baseAmt, price);
    const id = histId++;
    await q(
      `INSERT INTO offer_file_history (id, celestia_height, transaction_hex, created_at, ttl_seconds, archive_reason, archived_at)
       VALUES ($1, $2, $3, $4, 3600, 'CONSUMED', $4)`,
      [id, 1000 + id, `seed-hist-${id}`, at],
    );
    await q(
      `INSERT INTO offer_file_tokens_history (offer_file_id, token_color, amount, direction) VALUES
       ($1,$2,$3,'GIVING'), ($1,$4,$5,'WANTING')`,
      [id, give[0], String(give[1]), want[0], String(want[1])],
    );
    fills++;
  }
  return { fills, lastPrice: price };
}

async function seedBook(p: (typeof PAIRS)[number], mid: number) {
  const nowIso = new Date().toISOString();
  let n = 0;
  const place = async (side: "ask" | "bid", price: number, baseAmt: number) => {
    const { give, want } = legsFor(side, p.base.color, p.quote.color, baseAmt, price);
    const id = bookId++;
    await q(
      `INSERT INTO offer_file (id, celestia_height, transaction_hex, created_at, ttl_seconds)
       VALUES ($1, $2, $3, $4, 3600)`,
      [id, 2000 + id, `seed-book-${id}`, nowIso],
    );
    await q(
      `INSERT INTO offer_file_tokens (offer_file_id, token_color, amount, direction) VALUES
       ($1,$2,$3,'GIVING'), ($1,$4,$5,'WANTING')`,
      [id, give[0], String(give[1]), want[0], String(want[1])],
    );
    n++;
  };
  for (let k = 1; k <= p.bookLevels; k++) {
    await place("ask", mid * (1 + 0.012 * k), ri(3, 30)); // asks above mid
    await place("bid", mid * (1 - 0.012 * k), ri(3, 30)); // bids below mid
  }
  return n;
}

async function main() {
  await client.connect();
  console.log("[seed-market] connected to", client.host + ":" + client.port);
  await ensureTokens();
  await wipe();
  for (const p of PAIRS) {
    const { fills, lastPrice } = await seedHistory(p);
    // anchor the live book around where the price walk ended → chart & book agree
    const book = await seedBook(p, lastPrice);
    console.log(
      `[seed-market] ${p.base.name}/${p.quote.name}: ${fills} historic fills, ` +
        `${book} live offers (mid≈${lastPrice.toFixed(3)})`,
    );
  }
  console.log("[seed-market] done. Order book is live immediately; chart history/stats need the sync node to be running the updated api.ts.");
  await client.end();
}

main().catch((e) => {
  console.error("[seed-market] failed:", e);
  process.exit(1);
});
