import { Type } from "@sinclair/typebox";

export const availGenericGrammar = [
    ["payload", Type.Object({ suppliedValue: Type.String() })],
  ] as const;