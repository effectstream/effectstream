import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "bitcoin-transaction": builtinGrammars.bitcoinAddress,
  "midnightContractStateERC20": builtinGrammars.midnightGeneric,
  "midnightContractStateERC7683": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
