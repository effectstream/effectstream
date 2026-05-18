import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "transfer-assets": builtinGrammars.evmErc721,
  "midnightContractState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
