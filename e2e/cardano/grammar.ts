import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "cardano-utxo-rpc-generic": builtinGrammars.utxorpcGeneric,
} as const satisfies GrammarDefinition;
