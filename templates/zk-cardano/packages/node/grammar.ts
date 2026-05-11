import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "cardano-pool-delegation": builtinGrammars.cardanoPoolDelegation,
  "midnightBallotState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
