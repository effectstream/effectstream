import { builtinGrammars } from "@effectstream/sm/grammar";
import type { GrammarDefinition } from "@effectstream/concise";

export const grammar = {
  "cardano-utxo-rpc-generic": builtinGrammars.utxorpcGeneric,
  "cardano-mint-burn": builtinGrammars.cardanoMintBurn,
  "cardano-transfer": builtinGrammars.cardanoTransfer,
  "cardano-pool-delegation": builtinGrammars.cardanoPoolDelegation,
  "cardano-delayed-asset": builtinGrammars.cardanoDelayedAsset,
  "cardano-projected-nft": builtinGrammars.cardanoProjectedNft,
} as const satisfies GrammarDefinition;
