import type { GrammarDefinition } from "@paimaexample/concise";
import { builtinGrammars } from "@paimaexample/sm/grammar";

export const grammar = {
  "transfer-assets": builtinGrammars.evmErc721,
  "midnightContractState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
