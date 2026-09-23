// Offer transaction capability — the seam between the app and whichever wallet
// creates or settles offers. Test-token minting lives in the external Faucet.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import { proveAndSubmitOffers } from '../services/browserOffers';
import type { MidnightRuntimeConfig } from '../services/api';
import { buildMakerOfferBlob, type OfferLeg } from '../services/makerOffer';
import { dlog } from '../debug';

export interface TradeWallet {
  readonly kind: 'injected' | 'local';
  /** Create/take offers. */
  readonly canTrade: boolean;
  /** Why trading is unavailable, when canTrade is false (shown in the UI). */
  readonly unsupportedReason?: string;
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
  settleOffers(config: MidnightRuntimeConfig, blobs: string[]): Promise<{ txHash: string }>;
}

// Injected browser wallet: create via makeIntent+encodeOffer, take via proveAndSubmitOffers.
export function makeInjectedTradeWallet(connectedApi: ConnectedAPI): TradeWallet {
  return {
    kind: 'injected',
    canTrade: true,
    buildOfferBlob: (networkId, gives, wants) => buildMakerOfferBlob(connectedApi, networkId, gives, wants),
    // The browser wallet settles the whole ladder in one transaction, like the JS wallet:
    // `proveAndSubmitOffers` folds the maker halves through the shared
    // services/offerBatch.ts helpers (same pre-submission guard for offers that
    // cannot compose) and the wallet balances the merged result once. A ladder
    // taken through the browser connector would otherwise be N transactions built from wallet state
    // that has not seen the previous take's spend — the same double spend the
    // JS wallet used to hit.
    //
    // N=1 is byte-for-byte the old path: one blob's own decoded bytes, one
    // balance, one submission.
    settleOffers: async (config, blobs) => {
      dlog('tradeWallet.settleOffers → proveAndSubmitOffers (injected browser wallet, merged)', {
        networkId: config.networkId,
        offers: blobs.length,
      });
      return proveAndSubmitOffers(connectedApi, config, blobs);
    },
  };
}

/**
 * Built-in JS (facade) wallet — full capability.
 *
 * Offers go through the facade's own swap API
 * (services/localTradeOffers.ts): initSwap/signRecipe for the maker,
 * balanceFinalizedTransaction + merge for the taker — no makeIntent needed.
 */
export function makeLocalTradeWallet(localApi: unknown): TradeWallet {
  return {
    kind: 'local',
    canTrade: true,
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
