import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

// Single entry, fed by the `SolanaProgramLog` primitive: one event per tx
// touching the counter program, carrying `{ slot, programId, logMessages }`.
// The increment/reset semantics are decoded in the state machine, not here.
// See the template README ("How It Works").
export const grammar = {
  "solana-program-log": [
    ["slot", Type.Number()],
    ["programId", Type.String()],
    ["logMessages", Type.Array(Type.String())],
  ],
} as const satisfies GrammarDefinition;
