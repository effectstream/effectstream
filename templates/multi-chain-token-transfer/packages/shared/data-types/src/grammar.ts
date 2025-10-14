import type { GrammarDefinition } from "@paimaexample/concise";
import { builtinGrammars } from "@paimaexample/sm/grammar";
import { erc1155Grammar } from "@multi-chain-transfer/custom-primitive-evm-erc1155/erc1155-grammar";
import { mctErc1155Grammar } from "@multi-chain-transfer/custom-primitive-mct-erc1155/erc1155-grammar";

export const grammar = {
  "evm-transfer-erc1155": erc1155Grammar,
  "transfer-to-midnight": mctErc1155Grammar,
  "midnightContractState": builtinGrammars.midnightGeneric,
} as const satisfies GrammarDefinition;
