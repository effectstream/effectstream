import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "counter-stm": [["counter", Type.Number()]],
} as const satisfies GrammarDefinition;
