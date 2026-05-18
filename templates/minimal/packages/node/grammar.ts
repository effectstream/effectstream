import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  my_action_name: [
    ["input", Type.String({ maxLength: 256 })],
  ],
} as const satisfies GrammarDefinition;
