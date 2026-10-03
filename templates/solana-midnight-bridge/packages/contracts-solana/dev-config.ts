// Local-mode constants shared by the orchestrator scripts, the node and the tests.
export const DEV_SOLANA_RPC_PORT = Number(process.env.SOLANA_RPC_PORT ?? "8899");
export const DEV_SOLANA_FAUCET_PORT = Number(process.env.SOLANA_FAUCET_PORT ?? "9900");

/** The local validator's RPC. `SOLANA_RPC_URL` overrides it (e.g. a Docker sibling). */
export const DEV_SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? `http://127.0.0.1:${DEV_SOLANA_RPC_PORT}`;

/** Deployment file the local orchestrator writes (`deployments/local.json`). */
export const LOCAL_DEPLOYMENT = "local";

/** Test tokens (whole units) `init-local.ts` mints to the dev user. */
export const DEV_USER_TEST_TOKENS = 1_000n;

/**
 * Data shreds the local validator keeps (`--limit-ledger-size`, engine option
 * `limitLedgerSize`). Agave 3.0.14's default, 10,000, purges all but a few
 * dozen slots about 20-25 minutes after the start, and the node's Solana sync,
 * which trails the tip by its confirmation depth, then stalls for good
 * (questions file Q22). An idle validator writes about 100 data shreds
 * (~0.25 MB of ledger) per slot, so 5,000,000 keeps the last ~50,000 slots
 * (about 5-6 hours) and caps the ledger near 12 GB (Q23).
 */
export const DEFAULT_SOLANA_LIMIT_LEDGER_SIZE = 5_000_000;

/**
 * The `limitLedgerSize` option chain-start.ts passes to `run()`: the default
 * above, or `undefined` when SOLANA_LIMIT_LEDGER_SIZE is set, so that
 * `run()` reads (and validates) the variable itself.
 */
export function localLimitLedgerSize(env: Record<string, string | undefined> = process.env): number | undefined {
  return env.SOLANA_LIMIT_LEDGER_SIZE?.trim() ? undefined : DEFAULT_SOLANA_LIMIT_LEDGER_SIZE;
}
