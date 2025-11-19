import type { GrammarDefinition } from "@paimaexample/concise";
import { builtinGrammars } from "@paimaexample/sm/grammar";

export const grammar = {
  
  "bitcoin-transaction": builtinGrammars.bitcoinAddress,

  "midnightContractStateERC20": builtinGrammars.midnightGeneric,
  "midnightContractStateERC7683": builtinGrammars.midnightGeneric,
  
} as const satisfies GrammarDefinition;
