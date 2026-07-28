import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";
import { Type } from "@sinclair/typebox";

export const grammar = {
  "midnightContractState": builtinGrammars.midnightGeneric,
  "eip20ContractState": builtinGrammars.midnightGeneric,
  "midnightNullifierState": [["payload", Type.Any()]],
  "midnightUnshieldedCreateState": [["payload", Type.Any()]],
  "midnightZswapRootState": [["payload", Type.Any()]],
  // Midnight-TokenMint owns its table (dynamicTables) AND still fires the STM.
  // Flat fields, so reuse the primitive's own grammar instead of restating it.
  "midnightTokenMintState": builtinGrammars.midnightTokenMint,
} as const satisfies GrammarDefinition;
