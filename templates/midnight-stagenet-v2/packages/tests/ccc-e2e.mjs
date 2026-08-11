import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';

import { keccak_256 } from '@noble/hashes/sha3.js';
import { ContractLog } from '@midnight-ntwrk/midnight-js-protocol/compact-js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';

import { loadAuthenticatedCallTree } from '../chains/midnight-contracts-v2/src/call-tree-loader.mjs';
import {
  createE2eProviders,
  deployFresh,
  loadCompiledContract,
} from '../chains/midnight-contracts-v2/src/e2e-runtime.mjs';
import {
  createV2Wallet,
  ensureWalletReady,
} from '../chains/midnight-contracts-v2/src/wallet-readiness.mjs';

const managedRoot = '/app/managed';
const sinkDir = `${managedRoot}/CryptoEventSink`;
const gatewayDir = `${managedRoot}/FeatureGateway`;
const expectedDigest = '290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563';
const lock = JSON.parse(readFileSync('/app/compatibility-lock.json', 'utf8'));
const callTreeManifest = JSON.parse(readFileSync(`${managedRoot}/call-tree-manifest.json`, 'utf8'));
const endpoints = Object.freeze({
  nodeUrl: requiredEnv('MIDNIGHT_V2_NODE_URL'),
  indexerHttpUrl: requiredEnv('MIDNIGHT_V2_INDEXER_HTTP_URL'),
  indexerWsUrl: requiredEnv('MIDNIGHT_V2_INDEXER_WS_URL'),
  proofServerUrl: requiredEnv('MIDNIGHT_V2_PROOF_SERVER_URL'),
});

setNetworkId('undeployed');
const wallet = await createV2Wallet({
  role: 'c12-local',
  seedHex: '0'.repeat(63) + '1',
  endpoints,
  feeBlocksMargin: 100,
});

try {
  const readiness = await ensureWalletReady(wallet, { timeoutMs: 240_000 });
  const sink = await loadCompiledContract('CryptoEventSink', sinkDir);
  const gateway = await loadCompiledContract('FeatureGateway', gatewayDir);
  const sinkProviders = await createE2eProviders(wallet, {
    endpoints,
    artifactDir: sinkDir,
    compilerManifestSha256: lock.artifacts.CryptoEventSink.compilerManifestSha256,
    privateStateId: 'c12-crypto-event-sink',
    privateStatePassword: 'c12-disposable-sink-state',
    feeTimeoutMs: 600_000,
  });
  const deployedSink = await deployFresh(
    sinkProviders,
    sink.compiledContract,
    'c12-crypto-event-sink',
  );
  const sinkAddress = deployedSink.deployTxData.public.contractAddress;
  const gatewayProviders = await createE2eProviders(wallet, {
    endpoints,
    artifactDir: gatewayDir,
    compilerManifestSha256: lock.artifacts.FeatureGateway.compilerManifestSha256,
    privateStateId: 'c12-feature-gateway',
    privateStatePassword: 'c12-disposable-gateway-state',
    feeTimeoutMs: 600_000,
  });
  const deployedGateway = await deployFresh(
    gatewayProviders,
    gateway.compiledContract,
    'c12-feature-gateway',
    [contractAddressArg(sinkAddress)],
  );
  const gatewayAddress = deployedGateway.deployTxData.public.contractAddress;
  const addresses = Object.freeze({ CryptoEventSink: sinkAddress, FeatureGateway: gatewayAddress });
  const implementations = makeBindings(callTreeManifest, addresses);
  const latestBlock = await sinkProviders.publicDataProvider.queryBlock();
  if (!latestBlock) throw new Error('Indexer returned no block after call-tree deployment');
  const blockPin = Object.freeze({ hash: latestBlock.hash, height: latestBlock.height });

  const beforeNegative = await observeSink(sinkProviders, sink.module, sinkAddress);
  let substitutionRejected = false;
  try {
    await loadAuthenticatedCallTree({
      managedRoot,
      manifestPath: `${managedRoot}/call-tree-manifest.json`,
      expectedCallTreeManifestHash: lock.artifacts.CallTree.manifestSha256,
      implementations,
      expectedAddresses: { ...addresses, CryptoEventSink: 'ff'.repeat(32) },
      blockPin,
    });
  } catch (error) {
    substitutionRejected = String(error).includes('CryptoEventSink implementation address mismatch');
  }
  if (!substitutionRejected) throw new Error('Substituted sink address was not rejected before submission');
  const afterNegative = await observeSink(sinkProviders, sink.module, sinkAddress);
  if (JSON.stringify(beforeNegative) !== JSON.stringify(afterNegative)) {
    throw new Error('Rejected address substitution changed sink state or events');
  }

  const authenticated = await loadAuthenticatedCallTree({
    managedRoot,
    manifestPath: `${managedRoot}/call-tree-manifest.json`,
    expectedCallTreeManifestHash: lock.artifacts.CallTree.manifestSha256,
    implementations,
    expectedAddresses: addresses,
    blockPin,
  });
  if (JSON.stringify(authenticated.compilationOrder) !== JSON.stringify(['CryptoEventSink', 'FeatureGateway'])) {
    throw new Error('Authenticated call tree is not sink-first/root-last');
  }

  const input = new Uint8Array(32);
  if (toHex(keccak_256(input)) !== expectedDigest) throw new Error('Independent Keccak oracle drifted');
  const result = await deployedGateway.callTx.run(input);
  if (toHex(result.private.result) !== expectedDigest) throw new Error('Gateway returned the wrong digest');
  const expectedAddresses = [sinkAddress, gatewayAddress].map(normalizeAddress);
  const callAddresses = result.calls.map(({ contractAddress }) => normalizeAddress(contractAddress));
  if (JSON.stringify(callAddresses) !== JSON.stringify(expectedAddresses)) {
    throw new Error(`CCC call order drifted: ${JSON.stringify(callAddresses)}`);
  }
  const callTreeSink = result.calls[0]?.public?.contractState;
  if (!callTreeSink) throw new Error('CCC result has no callee contract state');
  assertSinkLedger(sink.module.ledger(callTreeSink));

  const localEvents = ContractLog.decodeAll(result.public.logEvents);
  if (
    localEvents.length !== 1 ||
    localEvents[0].eventType !== 'unpaused' ||
    localEvents[0].degraded !== false ||
    normalizeAddress(localEvents[0].address) !== normalizeAddress(sinkAddress)
  ) {
    throw new Error('CCC call did not expose exactly one non-degraded sink Unpaused event');
  }
  const indexedState = await sinkProviders.publicDataProvider.queryContractState(
    sinkAddress,
    { type: 'blockHash', blockHash: result.public.blockHash },
  );
  if (!indexedState) throw new Error('Indexer returned no sink state at the CCC call block');
  assertSinkLedger(sink.module.ledger(indexedState.data));
  const indexedEvents = await waitForIndexedEvent(
    sinkProviders.publicDataProvider,
    sinkAddress,
    result.public.txHash,
    result.public.blockHeight,
  );

  const hermeticResultFile = process.env.MIDNIGHT_V2_E2E_RESULT_FILE;
  if (hermeticResultFile) {
    const indexedEvent = indexedEvents[0];
    writeFileSync(hermeticResultFile, JSON.stringify({
      startBlockHeight: deployedSink.deployTxData.public.blockHeight,
      sinkAddress,
      gatewayAddress,
      expectedDigest,
      call: {
        transactionHash: normalizeAddress(result.public.txHash),
        blockHash: normalizeAddress(result.public.blockHash),
        blockHeight: result.public.blockHeight,
        addresses: callAddresses,
      },
      localEvent: {
        eventType: localEvents[0].eventType,
        degraded: localEvents[0].degraded,
        contractAddress: normalizeAddress(localEvents[0].address),
      },
      indexedEvent: {
        id: indexedEvent.id,
        maxId: indexedEvent.maxId,
        version: indexedEvent.version,
        protocolVersion: indexedEvent.protocolVersion,
        contractAddress: normalizeAddress(indexedEvent.contractAddress),
        transactionId: indexedEvent.transactionId,
        eventType: indexedEvent.eventType,
        raw: indexedEvent.raw,
      },
    }));
  }

  console.log(JSON.stringify({
    checkpoint: 'C12',
    wallet: {
      registrationState: readiness.registrationState,
      dustPositive: readiness.dust > 0n,
    },
    contracts: addresses,
    transaction: {
      txHash: result.public.txHash,
      blockHeight: result.public.blockHeight,
      blockHash: result.public.blockHash,
      digest: expectedDigest,
      calls: callAddresses,
      localEvents: localEvents.map(({ eventType, degraded, address }) => ({
        eventType,
        degraded,
        address,
      })),
      indexedEvents: indexedEvents.map(({ id, eventType, contractAddress, transactionId }) => ({
        id,
        eventType,
        contractAddress,
        transactionId,
      })),
    },
    negative: { addressSubstitutionRejected: true, stateAndEventsUnchanged: true },
    status: 'pass',
  }));
} finally {
  await wallet.wallet.stop();
}

async function observeSink(providers, module, address) {
  const state = await providers.publicDataProvider.queryContractState(address);
  if (!state) throw new Error('Indexer returned no sink state during substitution check');
  const value = module.ledger(state.data);
  const events = await providers.publicDataProvider.queryContractEvents(
    { contractAddress: address },
    { limit: 100, offset: 0 },
  );
  return {
    lastDigest: toHex(value.lastDigest),
    paused: value.paused,
    eventIds: events.map(({ id }) => id),
  };
}

async function waitForIndexedEvent(provider, contractAddress, transactionHash, blockHeight) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const events = await provider.queryContractEvents(
      {
        contractAddress,
        transactionHash,
        types: ['Unpaused'],
        fromBlock: blockHeight,
        toBlock: blockHeight,
      },
      { limit: 10, offset: 0 },
    );
    if (events.length === 1 && events[0].eventType === 'Unpaused') return events;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error('Indexer did not expose exactly one Unpaused event for the CCC root transaction');
}

function assertSinkLedger(value) {
  if (toHex(value.lastDigest) !== expectedDigest || value.paused !== false) {
    throw new Error('CCC sink state does not contain the expected digest/unpaused state');
  }
}

function makeBindings(manifest, addresses) {
  return manifest.compilationOrder.map((name) => {
    const entry = manifest.contracts[name];
    return {
      name,
      address: addresses[name],
      artifactPath: entry.artifactPath,
      compilerManifestSha256: entry.compilerManifest.sha256,
      verifierKeys: Object.fromEntries(
        Object.entries(entry.circuits).map(([circuit, value]) => [circuit, value.verifierKey.sha256]),
      ),
    };
  });
}

function contractAddressArg(address) {
  const value = Buffer.from(normalizeAddress(address), 'hex');
  if (value.length !== 32) throw new Error(`Contract address is not 32 bytes: ${address}`);
  return { bytes: new Uint8Array(value) };
}

function normalizeAddress(address) {
  return address.replace(/^0x/, '').toLowerCase();
}

function toHex(value) {
  return Buffer.from(value).toString('hex');
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
