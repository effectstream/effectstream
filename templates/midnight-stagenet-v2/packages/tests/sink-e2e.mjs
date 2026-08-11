import { Buffer } from 'node:buffer';

import { keccak_256 } from '@noble/hashes/sha3.js';
import { ContractLog } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import {
  createE2eProviders,
  deployFresh,
  loadCompiledContract,
} from '../chains/midnight-contracts-v2/src/e2e-runtime.mjs';
import {
  createV2Wallet,
  ensureWalletReady,
} from '../chains/midnight-contracts-v2/src/wallet-readiness.mjs';

const artifactDir = '/app/managed/CryptoEventSink';
const privateStateId = 'c10-crypto-event-sink';
const expectedDigest = '290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563';
const endpoints = Object.freeze({
  nodeUrl: requiredEnv('MIDNIGHT_V2_NODE_URL'),
  indexerHttpUrl: requiredEnv('MIDNIGHT_V2_INDEXER_HTTP_URL'),
  indexerWsUrl: requiredEnv('MIDNIGHT_V2_INDEXER_WS_URL'),
  proofServerUrl: requiredEnv('MIDNIGHT_V2_PROOF_SERVER_URL'),
});

setNetworkId('undeployed');
const stack = await waitForLocalStack();
const wallet = await createV2Wallet({
  role: 'c10-local',
  seedHex: '0'.repeat(63) + '1',
  endpoints,
  feeBlocksMargin: 100,
});

try {
  const readiness = await ensureWalletReady(wallet, { timeoutMs: 240_000 });
  if (readiness.registeredNightUtxos < 1) {
    throw new Error('C10 wallet has no NIGHT registered for DUST generation');
  }
  const compiled = await loadCompiledContract('CryptoEventSink', artifactDir);
  const providers = await createE2eProviders(wallet, {
    endpoints,
    artifactDir,
    compilerManifestSha256: '626271b0c0d79ce3fc1f118b351209eb97817715b472a487eed9924c8ef66fcc',
    privateStateId,
    privateStatePassword: 'c10-disposable-private-state',
    feeTimeoutMs: 600_000,
  });
  const deployed = await deployFresh(providers, compiled.compiledContract, privateStateId);
  const input = new Uint8Array(32);
  if (toHex(keccak_256(input)) !== expectedDigest) throw new Error('Independent Keccak-256 oracle drifted');
  const result = await deployed.callTx.hashStoreAndUnpause(input);
  const returnedDigest = toHex(result.private.result);
  if (returnedDigest !== expectedDigest) {
    throw new Error(
      `Circuit returned the wrong Keccak-256 digest: ${returnedDigest} (${result.private.result?.length ?? 'no length'} bytes)`,
    );
  }
  const events = ContractLog.decodeAll(result.public.logEvents);
  if (
    events.length !== 1 ||
    events[0].eventType !== 'unpaused' ||
    events[0].degraded !== false ||
    events[0].address !== deployed.deployTxData.public.contractAddress
  ) {
    throw new Error('Direct sink call did not decode exactly one non-degraded Unpaused event');
  }
  const indexed = await providers.publicDataProvider.queryContractState(
    deployed.deployTxData.public.contractAddress,
    { type: 'blockHash', blockHash: result.public.blockHash },
  );
  if (!indexed) throw new Error('Indexer returned no finalized sink state at the call block');
  const ledger = compiled.module.ledger(indexed.data);
  if (toHex(ledger.lastDigest) !== expectedDigest || ledger.paused !== false) {
    throw new Error('Finalized sink ledger state does not match the direct call');
  }
  console.log(JSON.stringify({
    checkpoint: 'C10',
    stack,
    wallet: {
      registrationPerformed: readiness.registrationPerformed,
      registrationState: readiness.registrationState,
      registeredNightUtxos: readiness.registeredNightUtxos,
      unshieldedNightPositive: readiness.unshieldedNight > 0n,
      dustPositive: readiness.dust > 0n,
    },
    contract: {
      address: deployed.deployTxData.public.contractAddress,
      blockHeight: result.public.blockHeight,
      digest: expectedDigest,
      paused: ledger.paused,
      localEvents: events.map(({ eventType, degraded }) => ({ eventType, degraded })),
    },
    status: 'pass',
  }));
} finally {
  await wallet.wallet.stop();
}

async function waitForLocalStack() {
  const deadline = Date.now() + 180_000;
  let latest = 'not started';
  while (Date.now() < deadline) {
    try {
      const [chain, runtime, header, indexer, proofVersion] = await Promise.all([
        nodeRpc('system_chain'),
        nodeRpc('state_getRuntimeVersion'),
        nodeRpc('chain_getHeader'),
        indexerIdentity(),
        fetchText(`${endpoints.proofServerUrl}/version`),
      ]);
      const block = Number.parseInt(header.number, 16);
      if (chain !== 'Midnight Undeployed' || runtime.specVersion !== 2_000_000 || block < 1) {
        throw new Error(`Unexpected node identity ${chain}/${runtime.specVersion}/${block}`);
      }
      return { chain, specVersion: runtime.specVersion, block, indexer, proofVersion };
    } catch (error) {
      latest = String(error);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error(`Local stack readiness timed out: ${latest}`);
}

async function nodeRpc(method) {
  const response = await fetch(endpoints.nodeUrl.replace(/^ws/, 'http'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params: [] }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(`Node RPC ${method} failed`);
  return payload.result;
}

async function indexerIdentity() {
  const response = await fetch(endpoints.indexerHttpUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'query C10IndexerHealth { __typename }' }),
  });
  const payload = await response.json();
  if (!response.ok || payload.errors || payload.data?.__typename !== 'Query') {
    throw new Error('Indexer GraphQL v4 health failed');
  }
  return { api: 'v4', typename: payload.data.__typename };
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return (await response.text()).trim();
}

function toHex(value) {
  return Buffer.from(value).toString('hex');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
