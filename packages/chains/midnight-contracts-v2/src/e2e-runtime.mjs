import http from 'node:http';
import https from 'node:https';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { CompiledContract } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { deployContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import {
  NodeZkConfigProvider,
  nodeZkConfigRegistry,
} from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { getSyncedWalletState, waitForDustFeeBudget } from './wallet-readiness.mjs';

http.globalAgent = new http.Agent({ keepAlive: false });
https.globalAgent = new https.Agent({ keepAlive: false });

export async function loadCompiledContract(tag, artifactDir) {
  const module = await import(pathToFileURL(`${artifactDir}/contract/index.js`).href);
  if (typeof module.Contract !== 'function' || typeof module.ledger !== 'function') {
    throw new Error(`${tag} compiled module is malformed`);
  }
  const compiledContract = CompiledContract.make(tag, module.Contract).pipe(
    CompiledContract.withVacantWitnesses,
    CompiledContract.withCompiledFileAssets(artifactDir),
  );
  return Object.freeze({ module, compiledContract });
}

export async function createE2eProviders(context, options) {
  const { endpoints, artifactDir, compilerManifestSha256, privateStateId, privateStatePassword } = options;
  const state = await getSyncedWalletState(context);
  const publicDataProvider = indexerPublicDataProvider(endpoints.indexerHttpUrl, endpoints.indexerWsUrl);
  publicDataProvider.watchForTxData = retryOnDrop(publicDataProvider.watchForTxData.bind(publicDataProvider));
  publicDataProvider.watchForDeployTxData = retryOnDrop(
    publicDataProvider.watchForDeployTxData.bind(publicDataProvider),
  );
  const registry = await nodeZkConfigRegistry(dirname(artifactDir));
  const sign = (payload) => context.unshieldedKeystore.signDataAsync(payload);
  const walletProvider = {
    getCoinPublicKey: () => state.shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => state.shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx, ttl) {
      const transactionTtl = ttl ?? new Date(Date.now() + 30 * 60 * 1_000);
      await waitForDustFeeBudget(context, tx, transactionTtl, { timeoutMs: options.feeTimeoutMs });
      const recipe = await context.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: context.shieldedSecretKeys, dustSecretKey: context.dustSecretKey },
        { ttl: transactionTtl },
      );
      return context.wallet.finalizeRecipe(await context.wallet.signRecipe(recipe, sign));
    },
    submitTx: (tx) => context.wallet.submitTransaction(tx),
  };
  return Object.freeze({
    privateStateProvider: levelPrivateStateProvider({
      midnightDbName: `/tmp/${privateStateId}-level-db`,
      privateStateStoreName: privateStateId,
      privateStoragePasswordProvider: () => privateStatePassword,
      accountId: state.shielded.encryptionPublicKey.toHexString().slice(0, 16),
    }),
    publicDataProvider,
    zkConfigProvider: new NodeZkConfigProvider(artifactDir, {
      verify: 'require',
      expectedManifestHash: compilerManifestSha256,
    }),
    proofProvider: httpClientProofProvider(endpoints.proofServerUrl, registry),
    walletProvider,
    midnightProvider: walletProvider,
  });
}

export function deployFresh(providers, compiledContract, privateStateId, args = []) {
  return deployContract(providers, {
    compiledContract,
    privateStateId,
    initialPrivateState: {},
    args,
  });
}

function retryOnDrop(fn) {
  return async (...args) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn(...args);
      } catch (error) {
        if (attempt >= 3 || !/Premature close/.test(String(error))) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
  };
}
