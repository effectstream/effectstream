// Wallet transaction capability — the seam between the app and whichever wallet
// performs mint / create-offer / take-offer. Today only the injected wallet
// (Lace, via the dapp-connector ConnectedAPI) implements it. The local JS
// (facade) wallet is a TYPED STUB: it satisfies the same interface but throws a
// clear "coming soon" error, so when its build/prove/balance path is ported
// later, only this file changes — every call site already routes through here.

import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import type { BrowserMintResult } from '../hooks/useContract';
import { proveAndSubmitOffer, type MidnightBrowserConfig } from '../services/browserContract';
import { buildMakerOfferBlob, type OfferLeg } from '../services/makerOffer';

export interface TradeWallet {
  readonly kind: 'injected' | 'local';
  /** Whether mint/create/take are implemented for this wallet. */
  readonly canTransact: boolean;
  /** Why not, when canTransact is false (shown in the UI). */
  readonly unsupportedReason?: string;
  mintShielded(domainSep: Uint8Array, amount: bigint, nonce: bigint, name: string): Promise<BrowserMintResult>;
  mintUnshielded(domainSep: Uint8Array, amount: bigint, name: string): Promise<BrowserMintResult>;
  buildOfferBlob(networkId: string, gives: OfferLeg[], wants: OfferLeg[]): Promise<string>;
  settleOffer(config: MidnightBrowserConfig, blob: string): Promise<{ txHash: string }>;
}

export interface InjectedMintFns {
  mintShielded: TradeWallet['mintShielded'];
  mintUnshielded: TradeWallet['mintUnshielded'];
}

// Injected (Lace) wallet: mint via the OfferFiles contract client (useContract),
// create via makeIntent+encodeOffer, take via proveAndSubmitOffer.
export function makeInjectedTradeWallet(connectedApi: ConnectedAPI, mint: InjectedMintFns): TradeWallet {
  return {
    kind: 'injected',
    canTransact: true,
    mintShielded: mint.mintShielded,
    mintUnshielded: mint.mintUnshielded,
    buildOfferBlob: (networkId, gives, wants) => buildMakerOfferBlob(connectedApi, networkId, gives, wants),
    settleOffer: (config, blob) => proveAndSubmitOffer(connectedApi, config, blob),
  };
}

export const LOCAL_WALLET_NOT_WIRED =
  'JS wallet transactions are coming soon — connect Lace to mint and trade on this network.';

// Local JS (facade) wallet: portable stub. When implemented, it would use the
// wallet facade (walletResult.zswapSecretKeys / dustSecretKey / unshieldedKeystore)
// to build, prove, and balance transactions locally — no Lace required.
export function makeLocalTradeWalletStub(_facadeApi: unknown): TradeWallet {
  const fail = async (): Promise<never> => {
    throw new Error(LOCAL_WALLET_NOT_WIRED);
  };
  return {
    kind: 'local',
    canTransact: false,
    unsupportedReason: LOCAL_WALLET_NOT_WIRED,
    mintShielded: fail,
    mintUnshielded: fail,
    buildOfferBlob: fail,
    settleOffer: fail,
  };
}
