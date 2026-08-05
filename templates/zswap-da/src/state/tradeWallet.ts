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
  settleOffer(config: MidnightBrowserConfig, blob: string): Promise<{ txHash: string }>;
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
    settleOffer: (config, blob) => {
      dlog('tradeWallet.settleOffer → proveAndSubmitOffer (injected/Lace)', {
        networkId: config.networkId,
        contractAddress: config.contractAddress,
        blobLen: blob.length,
      });
      return proveAndSubmitOffer(connectedApi, config, blob);
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
    settleOffer: async (config, blob) => {
      dlog('tradeWallet.settleOffer → settleOfferLocal (JS wallet facade)', {
        networkId: config.networkId,
        blobLen: blob.length,
      });
      const { settleOfferLocal } = await import('../services/localTradeOffers');
      return settleOfferLocal(localApi as never, config, blob);
    },
  };
}
