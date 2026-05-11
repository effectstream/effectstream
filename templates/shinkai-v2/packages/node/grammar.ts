import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  newGame: [],
  ai: [
    ["target", Type.String({ maxLength: 100 })],
    ["id", Type.Number({ minimum: 1 })],
    ["response", Type.String({ maxLength: 1000 })],
  ],
  tick: [
    ["n", Type.Number({ minimum: 0 })],
  ],
} as const satisfies GrammarDefinition;
