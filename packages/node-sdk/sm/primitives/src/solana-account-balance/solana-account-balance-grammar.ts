import { Type } from "@sinclair/typebox";

export const solanaAccountBalanceGrammar = [
  ["address", Type.String()],
  ["lamports", Type.Number()],
  ["slot", Type.Number()],
] as const;
