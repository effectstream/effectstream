import { Type } from "@sinclair/typebox";

export const poolDelegationGrammar = [
  ["address", Type.String()],
  ["pool", Type.String()],
  ["epoch", Type.String()],
] as const;
