import type { GrammarDefinition } from "@effectstream/concise";
import { buyItemsGrammar } from "./primitives.ts";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "buy-items": buyItemsGrammar,
  "cardano-payment": builtinGrammars.cardanoTransfer,
} as const satisfies GrammarDefinition;
