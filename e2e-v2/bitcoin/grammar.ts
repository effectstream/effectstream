import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "bitcoin-transaction": builtinGrammars.bitcoinAddress,
} as const satisfies GrammarDefinition;
