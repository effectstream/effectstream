// @solana-midnight-bridge/node — the Effectstream sync node and its relayer.
//
// - config.ts         NTP main + SOLANA:ProgramLog + Midnight:Generic (two modes)
// - grammar.ts        the two state-machine inputs
// - stf-logic.ts      pure planning: inputs -> idempotent row ops
// - state-machine.ts  applies the ops (owns bridge_transfers)
// - api.ts            GET /transfers, GET /transfers/:id
// - main.ts           `bun run main.ts <local|live>`
export * from "./grammar.ts";
export * from "./stf-logic.ts";
export { createBridgeStateMachine, applyOp } from "./state-machine.ts";
export { apiRouter, parseTransferId, toTransferView, type TransferView } from "./api.ts";
