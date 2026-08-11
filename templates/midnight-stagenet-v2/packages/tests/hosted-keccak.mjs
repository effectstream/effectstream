import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { keccak_256 } from '@noble/hashes/sha3.js';
import { ContractLog } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import * as ledgerProtocol from '@midnight-ntwrk/midnight-js-protocol/ledger';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import {
  createE2eProviders,
  deployFresh,
  loadCompiledContract,
} from '../chains/midnight-contracts-v2/src/e2e-runtime.mjs';
import {
  createV2Wallet,
  ensureWalletReady,
  getSyncedWalletState,
} from '../chains/midnight-contracts-v2/src/wallet-readiness.mjs';

const artifactDir = '/app/managed/KeccakHostedProbe';
const expectedDigest = '290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563';
const expectedCompilerManifestSha256 = '0582a9ab211b163df40d56b20015c71c92e7405c1fc5e922ae4f773e6e782ce0';
const writeAuthorized = process.env.RUN_STAGENET_WRITE_TESTS === '1';
const readOnlyProbe = process.env.MIDNIGHT_V2_READ_ONLY_WALLET_PROBE === '1';
if (writeAuthorized === readOnlyProbe) {
  throw new Error(
    'Select exactly one mode: RUN_STAGENET_WRITE_TESTS=1 or MIDNIGHT_V2_READ_ONLY_WALLET_PROBE=1',
  );
}

const endpoints = Object.freeze({
  nodeUrl: requiredEnv('MIDNIGHT_V2_NODE_URL'),
  indexerHttpUrl: requiredEnv('MIDNIGHT_V2_INDEXER_HTTP_URL'),
  indexerWsUrl: requiredEnv('MIDNIGHT_V2_INDEXER_WS_URL'),
  proofServerUrl: requiredEnv('MIDNIGHT_V2_PROOF_SERVER_URL'),
});
const seedHex = readSeedSecret(requiredEnv('MIDNIGHT_V2_WALLET_SEED_FILE'));

setNetworkId('stagenet');
const observation = await observeHostedNetwork();
const wallet = await createV2Wallet({
  role: readOnlyProbe ? 'c11-hosted-read-only' : 'c11-hosted-write',
  seedHex,
  endpoints,
  feeBlocksMargin: 100,
});

try {
  const state = await getSyncedWalletState(wallet);
  const native = ledgerProtocol.nativeToken().raw;
  const unshieldedNight = state.unshielded.balances[native] ?? 0n;
  const nativeCoins = state.unshielded.availableCoins.filter(({ utxo }) => utxo.type === native);
  const walletObservation = Object.freeze({
    unshieldedNightPositive: unshieldedNight > 0n,
    nativeUtxos: nativeCoins.length,
    registeredNativeUtxos: nativeCoins.filter(({ meta }) => meta.registeredForDustGeneration).length,
    dustPositive: state.dust.balance(new Date()) > 0n,
    blockHeight: state.blockHeight,
  });

  if (readOnlyProbe) {
    console.log(JSON.stringify({
      checkpoint: 'C11-wallet-preflight',
      network: observation,
      wallet: walletObservation,
      writesSubmitted: false,
      status: unshieldedNight > 0n ? 'funded' : 'unfunded',
    }));
    process.exitCode = unshieldedNight > 0n ? 0 : 2;
  } else {
    if (unshieldedNight <= 0n) {
      throw new Error(
        'C11 wallet has no unshielded NIGHT on hosted stagenet; provide a currently funded disposable seed',
      );
    }
    await runHostedWrite(wallet, observation, walletObservation);
  }
} finally {
  await wallet.wallet.stop();
}

async function runHostedWrite(walletContext, observation, walletObservation) {
  const readiness = await ensureWalletReady(walletContext, { timeoutMs: 600_000 });
  const compiled = await loadCompiledContract('KeccakHostedProbe', artifactDir);
  const compilerManifestSha256 = sha256(
    readFileSync(`${artifactDir}/compiler/contract-manifest.json`),
  );
  if (compilerManifestSha256 !== expectedCompilerManifestSha256) {
    throw new Error(`Hosted probe compiler manifest drifted: ${compilerManifestSha256}`);
  }
  const providers = await createE2eProviders(walletContext, {
    endpoints,
    artifactDir,
    compilerManifestSha256,
    privateStateId: 'c11-keccak-hosted-probe',
    privateStatePassword: 'c11-disposable-private-state',
    feeTimeoutMs: 900_000,
  });
  const input = new Uint8Array(32);
  if (toHex(keccak_256(input)) !== expectedDigest) {
    throw new Error('Independent Keccak-256 oracle drifted');
  }
  const deployed = await deployFresh(
    providers,
    compiled.compiledContract,
    'c11-keccak-hosted-probe',
  );
  const result = await deployed.callTx.hashAndStore(input);
  if (toHex(result.private.result) !== expectedDigest) {
    throw new Error('Hosted Keccak probe returned the wrong digest');
  }
  if (ContractLog.decodeAll(result.public.logEvents).length !== 0) {
    throw new Error('Hosted Keccak probe unexpectedly emitted a contract event');
  }
  const indexed = await providers.publicDataProvider.queryContractState(
    deployed.deployTxData.public.contractAddress,
    { type: 'blockHash', blockHash: result.public.blockHash },
  );
  if (!indexed) throw new Error('Indexer returned no finalized hosted probe state');
  const contractState = compiled.module.ledger(indexed.data);
  if (toHex(contractState.lastDigest) !== expectedDigest) {
    throw new Error('Finalized hosted probe state contains the wrong digest');
  }
  console.log(JSON.stringify({
    checkpoint: 'C11',
    network: observation,
    wallet: {
      ...walletObservation,
      registrationPerformed: readiness.registrationPerformed,
      registrationState: readiness.registrationState,
      dustReady: readiness.dust > 0n,
    },
    artifact: {
      compilerManifestSha256,
      zkirVersion: 3,
      verifierKeyVersion: 7,
      proofServerVersion: await fetchText(`${endpoints.proofServerUrl}/version`),
    },
    transaction: {
      startingFinalizedBlock: observation.startingFinalizedBlock,
      contractAddress: deployed.deployTxData.public.contractAddress,
      deployTxId: deployed.deployTxData.public.txId,
      deployTxHash: deployed.deployTxData.public.txHash,
      callTxId: result.public.txId,
      callTxHash: result.public.txHash,
      blockHeight: result.public.blockHeight,
      blockHash: result.public.blockHash,
      digest: expectedDigest,
    },
    status: 'pass',
  }));
}

async function observeHostedNetwork() {
  const [chain, runtime, finalizedHash, indexer] = await Promise.all([
    nodeRpc('system_chain'),
    nodeRpc('state_getRuntimeVersion'),
    nodeRpc('chain_getFinalizedHead'),
    indexerIdentity(),
  ]);
  const finalizedHeader = await nodeRpc('chain_getHeader', [finalizedHash]);
  if (chain !== 'Midnight Stagenet' || runtime.specVersion !== 2_000_000) {
    throw new Error(`Hosted identity drifted: ${chain}/${runtime.specVersion}`);
  }
  return Object.freeze({
    chain,
    specVersion: runtime.specVersion,
    transactionVersion: runtime.transactionVersion,
    startingFinalizedBlock: Number.parseInt(finalizedHeader.number, 16),
    startingFinalizedHash: finalizedHash,
    indexer,
  });
}

async function nodeRpc(method, params = []) {
  const response = await fetch(endpoints.nodeUrl.replace(/^ws/, 'http'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`Node RPC ${method} failed`);
  return payload.result;
}

async function indexerIdentity() {
  const response = await fetch(endpoints.indexerHttpUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query C11IndexerHealth { __typename }' }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors || payload.data?.__typename !== 'Query') {
    throw new Error('Hosted indexer GraphQL v4 health failed');
  }
  return Object.freeze({ api: 'v4', typename: payload.data.__typename });
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.text()).trim();
}

function readSeedSecret(path) {
  const value = readFileSync(path, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error('C11 wallet Docker secret must contain exactly 32 bytes of seed hex');
  }
  return value;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toHex(value) {
  return Buffer.from(value).toString('hex');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
