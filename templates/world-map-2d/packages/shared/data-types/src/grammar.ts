import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@paimaexample/concise";

export const grammar = {
  joinWorld: [],
  submitMove: [
    ["x", Type.Number({ minimum: 0, maximum: 9 })],
    ["y", Type.Number({ minimum: 0, maximum: 9 })],
  ],
  submitIncrement: [
    ["x", Type.Number({ minimum: 0, maximum: 9 })],
    ["y", Type.Number({ minimum: 0, maximum: 9 })],
  ],
} as const satisfies GrammarDefinition;
