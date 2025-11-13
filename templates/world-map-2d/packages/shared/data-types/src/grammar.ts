import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@paimaexample/concise";

export const grammar = {
  joinWorld: [],
  submitMove: [
    ["x", Type.Number({ minimum: 0, maximum: 100 })],
    ["y", Type.Number({ minimum: 0, maximum: 100 })],
  ],
  submitIncrement: [
    ["x", Type.Number({ minimum: 0, maximum: 100 })],
    ["y", Type.Number({ minimum: 0, maximum: 100 })],
  ],
} as const satisfies GrammarDefinition;
