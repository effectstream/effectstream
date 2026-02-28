import { Type } from "@sinclair/typebox";

export const celestiaGenericGrammar = [
  ["payload", Type.Object({ suppliedValue: Type.String() })],
] as const;
