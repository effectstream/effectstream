import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";
import { mctErc1155Grammar } from "@multi-chain-transfer/custom-primitive-mct-erc1155/erc1155-grammar";

export const grammar = {
  "evm-transfer-erc1155": builtinGrammars.evmErc1155,
  "transfer-to-midnight": mctErc1155Grammar,
  "midnightContractState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
