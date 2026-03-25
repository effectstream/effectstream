import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "near-generic": builtinGrammars.nearGeneric,
  "intent-settled": builtinGrammars.nearIntent,
} as const satisfies GrammarDefinition;
