import { Type } from "@sinclair/typebox";

export const nearIntentGrammar = [
  ['account_id', Type.String()],
  ['intent_hash', Type.String()],
  ['token_diffs', Type.Array(Type.Object({
    token_id: Type.String(),
    amount: Type.String(),
  }))],
] as const;
