import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "celestia-blob": builtinGrammars.celestiaGeneric,
} as const satisfies GrammarDefinition;
