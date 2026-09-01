// Wallet transaction capability — the seam between the app and whichever wallet
// performs mint / create-offer / take-offer.
//
// Capability is per-operation, not per-wallet. Minting is a plain contract call
// and BOTH wallets do it: Lace through the dapp-connector, the built-in JS
// wallet through the wallet facade (see services/contractWallet.ts). Offers are
// the part still wired only for Lace — `buildMakerOfferBlob` uses Lace's
// `makeIntent` and settlement uses `balanceSealedTransaction`.
//
// The facade exposes the offer path too (`initSwap` → `signRecipe` →
// `balanceUnboundTransaction` → `finalizeRecipe` → `submitTransaction`), so
// this is a porting gap in this template, NOT a limitation of the JS wallet.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { BrowserMintResult } from '../hooks/useContract';
import { proveAndSubmitOffer, type MidnightBrowserConfig } from '../services/browserContract';
import { buildMakerOfferBlob, type OfferLeg } from '../services/makerOffer';
import { dlog } from '../debug';

export interface TradeWallet {
  readonly kind: 'injected' | 'local';
  /** Faucet minting (a contract call). Implemented for both wallets. */
  readonly canMint: boolean;
  /** Create/take offers. Lace only for now — see the note above. */
  readonly canTrade: boolean;
  /** Why trading is unavailable, when canTrade is false (shown in the UI). */
  readonly unsupportedReason?: string;
  mintShielded(domainSep: Uint8Array, amount: bigint, nonce: bigint, name: string): Promise<BrowserMintResult>;
  mintUnshielded(domainSep: Uint8Array, amount: bigint, name: string): Promise<BrowserMintResult>;
  buildOfferBlob(networkId: string, gives: OfferLeg[], wants: OfferLeg[]): Promise<string>;
  /**
   * Take one or more offers. The whole selection goes through a single call so
   * the wallet can settle a ladder as ONE transaction — settling offer by offer
   * re-spent the taker's only coin and the node rejected everything after the
   * first (`Zswap(NullifierAlreadyPresent)`).
   *
   * The JS wallet merges the maker halves and submits once. Lace still settles
   * one at a time (see `makeInjectedTradeWallet`).
   *
   * @returns The settlement's tx hash — for Lace, the last one submitted.
   */
  settleOffers(config: MidnightBrowserConfig, blobs: string[]): Promise<{ txHash: string }>;
}

export interface MintFns {
  mintShielded: TradeWallet['mintShielded'];
  mintUnshielded: TradeWallet['mintUnshielded'];
}

// Injected (Lace): mint via the OfferFiles contract client (useContract),
// create via makeIntent+encodeOffer, take via proveAndSubmitOffer.
export function makeInjectedTradeWallet(connectedApi: ConnectedAPI, mint: MintFns): TradeWallet {
  return {
    kind: 'injected',
    canMint: true,
    canTrade: true,
    mintShielded: mint.mintShielded,
    mintUnshielded: mint.mintUnshielded,
    buildOfferBlob: (networkId, gives, wants) => buildMakerOfferBlob(connectedApi, networkId, gives, wants),
    // Lace keeps settling one offer at a time. Merging the maker halves first
    // would change what `proveAndSubmitOffer` is handed — its mirror+merge and
    // sealed-balance strategies both reason about the maker tx's segments — and
    // there is no Lace wallet on a headless stack to verify that against, so
    // this path is left exactly as it was rather than changed on a guess.
    // Consequence: a ladder taken through Lace is still N transactions, and a
    // single-coin Lace wallet still hits the double spend the JS wallet no
    // longer can.
    settleOffers: async (config, blobs) => {
      if (blobs.length === 0) throw new Error('No offers to settle.');
      dlog('tradeWallet.settleOffers → proveAndSubmitOffer ×N (injected/Lace, sequential)', {
        networkId: config.networkId,
        contractAddress: config.contractAddress,
        offers: blobs.length,
      });
      let last: { txHash: string } | undefined;
      for (const blob of blobs) {
        last = await proveAndSubmitOffer(connectedApi, config, blob);
      }
      return last!;
    },
  };
}

/**
 * Built-in JS (facade) wallet — full capability.
 *
 * Mint runs the same contract-call path as Lace, with the facade balancing and
 * sealing behind ContractWallet. Offers go through the facade's own swap API
 * (services/localTradeOffers.ts): initSwap/signRecipe for the maker,
 * balanceFinalizedTransaction + merge for the taker — no makeIntent needed.
 */
export function makeLocalTradeWallet(localApi: unknown, mint: MintFns): TradeWallet {
  return {
    kind: 'local',
    canMint: true,
    canTrade: true,
    mintShielded: mint.mintShielded,
    mintUnshielded: mint.mintUnshielded,
    buildOfferBlob: async (networkId, gives, wants) => {
      const { buildMakerOfferBlobLocal } = await import('../services/localTradeOffers');
      return buildMakerOfferBlobLocal(localApi as never, networkId, gives, wants);
    },
    // One settlement for the whole selection: the maker halves are merged, the
    // taker side is balanced once, and the batcher sees a single submission.
    settleOffers: async (config, blobs) => {
      dlog('tradeWallet.settleOffers → settleOffersLocal (JS wallet facade, merged)', {
        networkId: config.networkId,
        offers: blobs.length,
      });
      const { settleOffersLocal } = await import('../services/localTradeOffers');
      return settleOffersLocal(localApi as never, config, blobs);
    },
  };
}
