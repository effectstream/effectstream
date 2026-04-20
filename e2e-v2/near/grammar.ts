import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "near-generic": builtinGrammars.nearGeneric,
  "intent-settled": builtinGrammars.nearIntent,
  "near-account-watch": builtinGrammars.nearAccountWatch,
  "nep141-transfer": builtinGrammars.nearNep141,
  "nep171-transfer": builtinGrammars.nearNep171,
} as const satisfies GrammarDefinition;
