import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  sendMessage: [
    ["message", Type.String({ maxLength: 280 })],
  ],
} as const satisfies GrammarDefinition;
