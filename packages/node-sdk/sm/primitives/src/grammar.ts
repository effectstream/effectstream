// list of built-in grammars
// this list is exposed to the effectstream-sdk modules via the @effectstream/sm/grammar module

import { midnightGenericGrammar } from "./midnight-generic/midnight-genetic-grammar.ts";
import { erc721Grammar } from "./evm-erc721/erc721-grammar.ts";
import { erc20Grammar } from "./evm-erc20/erc20-grammar.ts";
import { availGenericGrammar } from "./avail-generic/avail-generic-grammar.ts";
import { erc1155Grammar } from "./evm-erc1155/erc1155-grammar.ts";
import { bitcoinAddressGrammar } from "./bitcoin-address/bitcoin-grammar.ts";
import { utxorpcGenericGrammar } from "./utxorpc-generic/utxorpc-generic-grammar.ts";
import { celestiaGenericGrammar } from "./celestia-generic/celestia-generic-grammar.ts";
import { nep141Grammar } from "./near-nep141/nep141-grammar.ts";
import { nep171Grammar } from "./near-nep171/nep171-grammar.ts";
import { nep245Grammar } from "./near-nep245/nep245-grammar.ts";
import { nearIntentGrammar } from "./near-intent/near-intent-grammar.ts";
import { nearGenericGrammar } from "./near-generic/near-generic-grammar.ts";
import { nearAccountWatchGrammar } from "./near-account-watch/near-account-watch-grammar.ts";
import { solanaProgramLogGrammar } from "./solana-program-log/solana-program-log-grammar.ts";
import { mintBurnGrammar } from "./cardano-mint-burn/mint-burn-grammar.ts";
import { transferGrammar } from "./cardano-transfer/transfer-grammar.ts";
import { poolDelegationGrammar } from "./cardano-pool-delegation/pool-delegation-grammar.ts";
import { delayedAssetGrammar } from "./cardano-delayed-asset/delayed-asset-grammar.ts";
import { projectedNftGrammar } from "./cardano-projected-nft/projected-nft-grammar.ts";

export const builtinGrammars = {
  midnightGeneric: midnightGenericGrammar,
  evmErc721: erc721Grammar,
  evmErc20: erc20Grammar,
  availGeneric: availGenericGrammar,
  evmErc1155: erc1155Grammar,
  bitcoinAddress: bitcoinAddressGrammar,
  utxorpcGeneric: utxorpcGenericGrammar,
  celestiaGeneric: celestiaGenericGrammar,
  nearNep141: nep141Grammar,
  nearNep171: nep171Grammar,
  nearNep245: nep245Grammar,
  nearIntent: nearIntentGrammar,
  nearGeneric: nearGenericGrammar,
  nearAccountWatch: nearAccountWatchGrammar,
  solanaProgramLog: solanaProgramLogGrammar,
  cardanoMintBurn: mintBurnGrammar,
  cardanoTransfer: transferGrammar,
  cardanoPoolDelegation: poolDelegationGrammar,
  cardanoDelayedAsset: delayedAssetGrammar,
  cardanoProjectedNft: projectedNftGrammar,
} as const;