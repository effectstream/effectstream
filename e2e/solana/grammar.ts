import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "solana-program-log": [
    ["slot", Type.Number()],
    ["programId", Type.String()],
    ["logMessages", Type.Array(Type.String())],
  ],
} as const satisfies GrammarDefinition;
