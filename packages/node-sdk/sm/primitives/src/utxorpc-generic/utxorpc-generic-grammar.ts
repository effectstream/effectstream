import { Type } from '@sinclair/typebox';

export const utxorpcGenericGrammar = [
  ["hash", Type.String()],
  ["bytes", Type.String()],
] as const;