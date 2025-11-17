import type { GrammarDefinition } from "@paimaexample/concise";
import { builtinGrammars } from "@paimaexample/sm/grammar";

export const grammar = {
  
  "bitcoinWalletChange": [],
  
  "midnightContractStateERC20": builtinGrammars.midnightGeneric,
  "midnightContractStateERC7683": builtinGrammars.midnightGeneric,
  
} as const satisfies GrammarDefinition;
