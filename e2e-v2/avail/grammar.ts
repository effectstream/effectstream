import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "avail-app-state": builtinGrammars.availGeneric,
} as const satisfies GrammarDefinition;
