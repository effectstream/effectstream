import { Type } from "@sinclair/typebox";

export const transferGrammar = [
  ["txId", Type.String()],
  ["metadata", Type.String()],
  ["inputCredentials", Type.String()],
  ["outputs", Type.String()],
] as const;
