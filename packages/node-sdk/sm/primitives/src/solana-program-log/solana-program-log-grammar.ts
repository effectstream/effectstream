import { Type } from "@sinclair/typebox";

export const solanaProgramLogGrammar = [
  ["slot", Type.Number()],
  ["programId", Type.String()],
  ["logMessages", Type.Array(Type.String())],
] as const;
