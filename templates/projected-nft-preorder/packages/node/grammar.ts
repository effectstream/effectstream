import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "cardano-projected-nft": builtinGrammars.cardanoProjectedNft,
} as const satisfies GrammarDefinition;
