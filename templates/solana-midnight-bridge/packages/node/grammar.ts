import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

// Two inputs, one per watched contract (config.ts):
// - "bridge-solana-log": SOLANA:ProgramLog on the bridge program, one input per
//   transaction that touched it: { slot, programId, logMessages } (only the
//   program's own `Program log:` lines; failed transactions never arrive).
// - "bridge-midnight-state": Midnight:Generic on the bridge contract, one input
//   per transaction that touched it: { payload } = the decoded ledger
//   (mintedLocks, withdrawals, withdrawalNonce, seals).
export const grammar = {
  "bridge-solana-log": builtinGrammars.solanaProgramLog,
  "bridge-midnight-state": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;

export const SOLANA_LOG_PREFIX = "bridge-solana-log";
export const MIDNIGHT_STATE_PREFIX = "bridge-midnight-state";
