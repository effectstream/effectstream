import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";
import { Type } from "@sinclair/typebox";

export const grammar = {
  "midnightContractState": builtinGrammars.midnightGeneric,
  "eip20ContractState": builtinGrammars.midnightGeneric,
  "midnightNullifierState": [["payload", Type.Any()]],
} as const satisfies GrammarDefinition;
