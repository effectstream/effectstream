import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "nft-transfer": builtinGrammars.evmErc721,
  "cardano-transfer": builtinGrammars.cardanoTransfer,
} as const satisfies GrammarDefinition;
