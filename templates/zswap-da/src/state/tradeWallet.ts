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
import { proveAndSubmitOffers, type MidnightBrowserConfig } from '../services/browserContract';
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
   * BOTH wallets merge the maker halves and submit once; the merge itself is
   * shared code (services/offerBatch.ts), so the two paths cannot drift.
   *
   * @returns The settlement's tx hash.
   */
  settleOffers(config: MidnightBrowserConfig, blobs: string[]): Promise<{ txHash: string }>;
}

export interface MintFns {
  mintShielded: TradeWallet['mintShielded'];
  mintUnshielded: TradeWallet['mintUnshielded'];
}

// Injected (Lace): mint via the OfferFiles contract client (useContract),
// create via makeIntent+encodeOffer, take via proveAndSubmitOffers.
export function makeInjectedTradeWallet(connectedApi: ConnectedAPI, mint: MintFns): TradeWallet {
  return {
    kind: 'injected',
    canMint: true,
    canTrade: true,
    mintShielded: mint.mintShielded,
    mintUnshielded: mint.mintUnshielded,
    buildOfferBlob: (networkId, gives, wants) => buildMakerOfferBlob(connectedApi, networkId, gives, wants),
    // Lace settles the whole ladder in one transaction, like the JS wallet:
    // `proveAndSubmitOffers` folds the maker halves through the shared
    // services/offerBatch.ts helpers (same pre-submission guard for offers that
    // cannot compose) and Lace balances the merged result once. A ladder taken
    // through Lace would otherwise be N transactions built from wallet state
    // that has not seen the previous take's spend — the same double spend the
    // JS wallet used to hit.
    //
    // N=1 is byte-for-byte the old path: one blob's own decoded bytes, one
    // balance, one submission.
    settleOffers: async (config, blobs) => {
      dlog('tradeWallet.settleOffers → proveAndSubmitOffers (injected/Lace, merged)', {
        networkId: config.networkId,
        contractAddress: config.contractAddress,
        offers: blobs.length,
      });
      return proveAndSubmitOffers(connectedApi, config, blobs);
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
