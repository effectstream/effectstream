import { Type } from "@sinclair/typebox";

export const mintBurnGrammar = [
  ["txId", Type.String()],
  ["metadata", Type.String()],
  ["assets", Type.String()],
  ["inputAddresses", Type.String()],
  ["outputAddresses", Type.String()],
] as const;
