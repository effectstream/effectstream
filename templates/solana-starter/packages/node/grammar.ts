import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  solana_program_log: [
    ["slot", Type.Number()],
    ["program_id", Type.String()],
    ["log_messages", Type.Array(Type.String())],
  ],
} as const satisfies GrammarDefinition;
