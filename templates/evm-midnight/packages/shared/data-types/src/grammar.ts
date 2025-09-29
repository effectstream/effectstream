import type { GrammarDefinition } from "@paimaexample/concise";
import { erc721Grammar, midnightGenericGrammar } from "@paimaexample/sm";

export const grammar = {
  "transfer-assets": erc721Grammar,
  "midnightContractState": midnightGenericGrammar,
} as const satisfies GrammarDefinition;
