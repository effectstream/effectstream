import type { GrammarDefinition } from "@effectstream/concise";
import { Type } from "@sinclair/typebox";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "bitcoin-transaction": builtinGrammars.bitcoinAddress,
  "midnightContractStateERC20": builtinGrammars.midnightGeneric,
  "midnightContractStateERC7683": builtinGrammars.midnightGeneric,
  "midnight-unshielded-spend": [["payload", Type.Any()]],
} as const satisfies GrammarDefinition;
