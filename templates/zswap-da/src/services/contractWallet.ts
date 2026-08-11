// The wallet surface the Midnight contract stack actually needs, behind one
// interface so both wallets can drive it.
//
// browserContract.ts used to take a Lace `ConnectedAPI` directly, which is why
// the built-in JS wallet could connect and show balances but not mint: the
// contract providers had no way to reach it. That was a template limitation,
// not an SDK one — the wallet facade exposes balancing, proving, signing and
// submission as first-class API (balanceUnboundTransaction / finalizeRecipe /
// signRecipe / initSwap / submitTransaction).
//
// Exactly four operations are wallet-specific:
//   1. shielded coin + encryption public keys  (mint output recipient/ciphertext)
//   2. unshielded address                      (mint_unshielded recipient)
//   3. seal an unbound tx without paying Dust  (the batcher pays the fees)
//   4. a readiness/network guard
import type { ConnectedAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  Transaction as LedgerV8Transaction,
  type FinalizedTransaction,
} from '@midnight-ntwrk/ledger-v8';
import type { UnboundTransaction } from '@midnight-ntwrk/midnight-js-types';
import {
  parseCoinPublicKeyToHex,
  parseEncPublicKeyToHex,
} from '@midnight-ntwrk/midnight-js-utils';
import { dlog, timed } from '../debug';

/** ledger-v8 documents CoinPublicKey/EncPublicKey as hex-encoded 35-byte strings. */
export interface ShieldedKeysHex {
  coinPublicKeyHex: string;
  encPublicKeyHex: string;
}

export interface ContractWallet {
  readonly kind: 'injected' | 'local';
  /** Human label for errors/telemetry. */
  readonly label: string;
  /** Throw with a useful message if the wallet can't serve this network. */
  assertReady(expectedNetworkId: string): Promise<void>;
  getShieldedKeys(networkId: string): Promise<ShieldedKeysHex>;
  /** bech32m `mn_addr_…`, decoded by the caller for the compact UserAddress. */
  getUnshieldedAddress(): Promise<string>;
  /**
   * Seal an unbound transaction WITHOUT contributing Dust: the batcher balances
   * fees and submits, so the user's wallet never pays them.
   */
  balanceUnbound(tx: UnboundTransaction, ttl?: Date): Promise<FinalizedTransaction>;
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const fromHex = (h: string) => {
  const s = h.startsWith('0x') ? h.slice(2) : h;
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Default sealing horizon when midnight-js doesn't supply one. */
const DEFAULT_TTL_MS = 30 * 60_000;

// ── Lace / injected ─────────────────────────────────────────────────────────

export function injectedContractWallet(connectedApi: ConnectedAPI): ContractWallet {
  return {
    kind: 'injected',
    label: 'Lace',

    async assertReady(expectedNetworkId: string) {
      const status = await connectedApi.getConnectionStatus();
      if (status.status !== 'connected') throw new Error('Browser wallet is not connected');
      if (status.networkId !== expectedNetworkId) {
        throw new Error(
          `Wallet is on network "${status.networkId}" but this app is on "${expectedNetworkId}".`,
        );
      }
    },

    async getShieldedKeys(networkId: string) {
      const a = await connectedApi.getShieldedAddresses();
      // Lace returns bech32m. Passing that through as if it were hex would
      // address the mint output to a key nobody holds, so the wallet would
      // never find the coin — normalize.
      return {
        coinPublicKeyHex: parseCoinPublicKeyToHex(a.shieldedCoinPublicKey, networkId as any),
        encPublicKeyHex: parseEncPublicKeyToHex(a.shieldedEncryptionPublicKey, networkId as any),
      };
    },

    async getUnshieldedAddress() {
      const { unshieldedAddress } = await connectedApi.getUnshieldedAddress();
      return unshieldedAddress;
    },

    async balanceUnbound(tx) {
      dlog('contractWallet(injected): balanceUnsealedTransaction payFees:false');
      try {
        const { tx: balancedHex } = await connectedApi.balanceUnsealedTransaction(
          toHex(tx.serialize()),
          { payFees: false },
        );
        return LedgerV8Transaction.deserialize(
          'signature',
          'proof',
          'binding',
          fromHex(balancedHex),
        ) as FinalizedTransaction;
      } catch (e: any) {
        throw new Error(
          `balanceUnsealedTransaction failed: ${e?.message ?? e?.name ?? 'unknown'}`,
          { cause: e },
        );
      }
    },
  };
}

// ── Built-in JS wallet (wallet facade) ──────────────────────────────────────

/**
 * `localApi` is what MidnightLocalConnector puts on the connection:
 * `walletResult` carries the facade plus the secret keys balancing needs.
 */
interface LocalApiShape {
  walletFacade?: any;
  unshieldedAddress?: string;
  /** Hex coin public key. */
  shieldedAddress?: string;
  /** Hex encryption public key — added in @effectstream/wallets alongside it. */
  shieldedEncryptionPublicKey?: string;
  getShieldedAddresses?: () => Promise<{
    shieldedAddress: string;
    shieldedCoinPublicKey?: string;
    shieldedEncryptionPublicKey?: string;
  }>;
  walletResult?: {
    wallet: any;
    zswapSecretKeys: any;
    dustSecretKey: any;
  };
}

export function localContractWallet(localApi: LocalApiShape): ContractWallet {
  const facade = () => {
    const f = localApi.walletResult?.wallet ?? localApi.walletFacade;
    if (!f) throw new Error('JS wallet is not fully initialised (no wallet facade).');
    return f;
  };
  const secretKeys = () => {
    const r = localApi.walletResult;
    if (!r?.zswapSecretKeys || !r?.dustSecretKey) {
      throw new Error('JS wallet is not fully initialised (missing secret keys).');
    }
    return { shieldedSecretKeys: r.zswapSecretKeys, dustSecretKey: r.dustSecretKey };
  };

  return {
    kind: 'local',
    label: 'JS wallet',

    async assertReady() {
      // The connector builds the facade against the network it was handed, so
      // there is no separate network handshake to check — just that it exists.
      facade();
      secretKeys();
    },

    async getShieldedKeys() {
      // Same field names as the dapp-connector-api, but ALREADY HEX — the
      // connector reads them off ShieldedAddress, whose accessors return
      // `.data.toString('hex')`. Running these through the bech32m parsers
      // would corrupt them, addressing the mint to a key nobody holds.
      const a = await localApi.getShieldedAddresses?.();
      const coinPublicKeyHex = a?.shieldedCoinPublicKey ?? localApi.shieldedAddress;
      const encPublicKeyHex = a?.shieldedEncryptionPublicKey ?? localApi.shieldedEncryptionPublicKey;
      if (!coinPublicKeyHex || !encPublicKeyHex) {
        throw new Error(
          'JS wallet did not expose both shielded keys. Update @effectstream/wallets — ' +
            'a mint needs the encryption key as well as the coin key, or the wallet ' +
            'never discovers the coin it was sent.',
        );
      }
      return { coinPublicKeyHex, encPublicKeyHex };
    },

    async getUnshieldedAddress() {
      const addr = localApi.unshieldedAddress;
      if (!addr) throw new Error('JS wallet has no unshielded address yet.');
      return addr;
    },

    async balanceUnbound(tx, ttl) {
      // Mirrors Lace's payFees:false: balance the value legs but contribute no
      // Dust, leaving fees to the batcher. Omitting 'dust' from
      // tokenKindsToBalance is what expresses that.
      const recipe = await timed('contractWallet(local): balanceUnboundTransaction', () =>
        facade().balanceUnboundTransaction(tx, secretKeys(), {
          ttl: ttl ?? new Date(Date.now() + DEFAULT_TTL_MS),
          tokenKindsToBalance: ['shielded', 'unshielded'],
        }),
      );
      return (await timed('contractWallet(local): finalizeRecipe', () =>
        facade().finalizeRecipe(recipe),
      )) as FinalizedTransaction;
    },
  };
}
