import type { GrammarDefinition } from "@paimaexample/concise";
import { builtinGrammars } from "@paimaexample/sm/grammar";

export const grammar = {
  /** EVM-BLOCK */
  "evm-transfer-erc1155": builtinGrammars.evmErc1155,
  /** EVM-BLOCK */
  
  /** MIDNIGHT-BLOCK */
  "midnightContractState": builtinGrammars.midnightGeneric,
  /** MIDNIGHT-BLOCK */
} as const satisfies GrammarDefinition;
