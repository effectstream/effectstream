import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "midnightContractState": builtinGrammars.midnightGeneric,
  "eip20ContractState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
