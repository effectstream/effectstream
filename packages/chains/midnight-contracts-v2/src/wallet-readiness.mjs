import { Buffer } from 'node:buffer';
import { setTimeout as delay } from 'node:timers/promises';

import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import * as ledger from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { DustWallet } from '@midnightntwrk/wallet-sdk-dust-wallet';
import { WalletFacade } from '@midnightntwrk/wallet-sdk-facade';
import { HDWallet, Roles } from '@midnightntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnightntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  PublicKey,
  UnshieldedWallet,
} from '@midnightntwrk/wallet-sdk-unshielded-wallet';
import { filter, firstValueFrom, tap, throttleTime, timeout } from 'rxjs';

import { assertNode22, claimRuntimeLane } from './runtime-guard.mjs';

const noopTxHistoryStorage = Object.freeze({
  gotPending: async () => undefined,
  gotFinalized: async () => undefined,
  gotRejected: async () => undefined,
  getAll: async () => [],
  get: async () => undefined,
  serialize: async () => '[]',
});

export async function createV2Wallet({ role, seedHex, endpoints, feeBlocksMargin }) {
  assertNode22();
  claimRuntimeLane('ledger-v9/runtime-v4');
  validateWalletOptions(role, seedHex, endpoints, feeBlocksMargin);
  const keys = deriveKeys(seedHex);
  const networkId = getNetworkId();
  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(
    { kind: 'schnorr', secret: keys[Roles.NightExternal] },
    networkId,
  );
  const configuration = {
    networkId,
    indexerClientConnection: {
      indexerHttpUrl: endpoints.indexerHttpUrl,
      indexerWsUrl: endpoints.indexerWsUrl,
    },
    provingServerUrl: new URL(endpoints.proofServerUrl),
    relayURL: new URL(endpoints.nodeUrl),
    costParameters: { feeBlocksMargin },
    txHistoryStorage: noopTxHistoryStorage,
  };
  const wallet = await WalletFacade.init({
    configuration,
    shielded: (config) => ShieldedWallet(config).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (config) =>
      UnshieldedWallet(config).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (config) =>
      DustWallet(config).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);
  return Object.freeze({ role, wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore });
}

export async function ensureWalletReady(context, { timeoutMs = 180_000 } = {}) {
  const state = await waitForWalletState(
    context,
    timeoutMs,
    (candidate) => {
      const native = ledger.nativeToken().raw;
      return candidate.isSynced && (candidate.unshielded.balances[native] ?? 0n) > 0n;
    },
    'synced wallet with unshielded NIGHT',
  );
  const native = ledger.nativeToken().raw;
  const unregisteredNight = state.unshielded.availableCoins.filter(
    ({ utxo, meta }) => utxo.type === native && !meta.registeredForDustGeneration,
  );
  const registeredNight = state.unshielded.availableCoins.filter(
    ({ utxo, meta }) => utxo.type === native && meta.registeredForDustGeneration,
  );
  let registrationPerformed = false;
  if (unregisteredNight.length > 0) {
    const { fee } = await context.wallet.estimateRegistration(unregisteredNight);
    await context.wallet.waitForGeneratedDust(unregisteredNight, fee, { timeoutMs });
    const dustState = await context.wallet.dust.waitForSyncedState();
    const recipe = await context.wallet.registerNightUtxosForDustGeneration(
      unregisteredNight,
      context.unshieldedKeystore.getPublicKey(),
      (payload) => context.unshieldedKeystore.signDataAsync(payload),
      dustState.address,
    );
    await context.wallet.submitTransaction(await context.wallet.finalizeRecipe(recipe));
    registrationPerformed = true;
  }
  const ready = await waitForWalletState(
    context,
    timeoutMs,
    (candidate) => candidate.isSynced && candidate.dust.balance(new Date()) > 0n,
    'positive DUST balance',
  );
  return Object.freeze({
    registrationPerformed,
    registrationState: registrationPerformed ? 'performed' : 'already-registered',
    registeredNightUtxos: registrationPerformed ? unregisteredNight.length : registeredNight.length,
    unshieldedNight: ready.unshielded.balances[native] ?? 0n,
    dust: ready.dust.balance(new Date()),
  });
}

export async function waitForDustFeeBudget(context, tx, ttl, { timeoutMs = 600_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await context.wallet.estimateTransactionFee(tx, context.dustSecretKey, { ttl });
    } catch (error) {
      if (!/insufficient funds|could not balance dust/i.test(errorText(error))) throw error;
    }
    if (Date.now() >= deadline) throw new Error(`${context.role}: timed out waiting for DUST fee budget`);
    await delay(Math.min(5_000, deadline - Date.now()));
  }
}

export async function getSyncedWalletState(context) {
  return firstValueFrom(context.wallet.state().pipe(filter((state) => state.isSynced)));
}

async function waitForWalletState(context, timeoutMs, predicate, description) {
  let latest = '(no state emitted)';
  return firstValueFrom(
    context.wallet.state().pipe(
      tap((state) => {
        latest = JSON.stringify({ isSynced: state.isSynced, blockHeight: state.blockHeight });
      }),
      throttleTime(5_000),
      filter(predicate),
      timeout({
        first: timeoutMs,
        with: () => {
          throw new Error(`${context.role}: timed out waiting for ${description}; latest=${latest}`);
        },
      }),
    ),
  );
}

function deriveKeys(seedHex) {
  const hd = HDWallet.fromSeed(Buffer.from(seedHex, 'hex'));
  if (hd.type !== 'seedOk') throw new Error('Wallet seed is invalid');
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);
  hd.hdWallet.clear();
  if (derived.type !== 'keysDerived') throw new Error('Wallet key derivation failed');
  return derived.keys;
}

function validateWalletOptions(role, seedHex, endpoints, feeBlocksMargin) {
  if (typeof role !== 'string' || role.length === 0) throw new Error('Wallet role is required');
  if (!/^[0-9a-f]{64}$/i.test(seedHex ?? '')) throw new Error('Wallet seed must be exactly 32 bytes');
  if (!Number.isSafeInteger(feeBlocksMargin) || feeBlocksMargin < 1) {
    throw new Error('feeBlocksMargin must be a positive integer');
  }
  for (const field of ['nodeUrl', 'indexerHttpUrl', 'indexerWsUrl', 'proofServerUrl']) {
    if (typeof endpoints?.[field] !== 'string') throw new Error(`Wallet endpoint ${field} is required`);
    new URL(endpoints[field]);
  }
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
