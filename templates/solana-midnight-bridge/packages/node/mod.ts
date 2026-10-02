// @solana-midnight-bridge/node — the Effectstream sync node.
//
// TODO(PR-2 T3.1) config.dev.ts / config.live.ts: NTP main, SOLANA_RPC_PARALLEL
//   + SOLANA:ProgramLog on the bridge program (start slot from the deployment
//   file), MIDNIGHT_PARALLEL + Midnight:Generic through
//   midnightLedgerFromTxStateHex(ledger, ContractState from the 0.20 alias).
// TODO(PR-2 T3.3) state-machine.ts: LOCK / RELEASE via parseBridgeLogs() from
//   @solana-midnight-bridge/contracts-solana (every line of a transaction), and
//   the Generic snapshot reconciliation.
// TODO(PR-2 T3.4) api.ts: GET /transfers, GET /transfers/:id, GET /health.
// TODO(PR-2 T4) relayer/ (in process): embedded batcher with the `midnight`
//   and `solanaOperator` adapters.
export {};
