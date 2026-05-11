import type { GrammarDefinition } from "@effectstream/concise";
import { buyItemsGrammar } from "./primitives.ts";
import { transferGrammar } from "./cardano-transfer-primitive.ts";

export const grammar = {
  "buy-items": buyItemsGrammar,
  "cardano-payment": transferGrammar,
} as const satisfies GrammarDefinition;
