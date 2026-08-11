import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  NodeZkConfigProvider,
  nodeZkConfigRegistry,
} from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { loadAuthenticatedCallTree } from '../chains/midnight-contracts-v2/src/call-tree-loader.mjs';

const managedRoot = '/app/managed';
const manifestPath = join(managedRoot, 'call-tree-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const lock = JSON.parse(readFileSync('/app/compatibility-lock.json', 'utf8'));
const addresses = Object.freeze({
  CryptoEventSink: '11'.repeat(32),
  FeatureGateway: '22'.repeat(32),
});
const blockPin = Object.freeze({ hash: 'aa'.repeat(32), height: 4242 });
const implementations = makeBindings(manifest, addresses);

const calls = new Map();
class CountingProvider extends NodeZkConfigProvider {
  constructor(directory, integrity) {
    super(directory, integrity);
    calls.set(basename(directory), { constructed: 1, prover: 0, verifier: 0, zkir: 0 });
  }

  async getProverKey(circuit) {
    calls.get(basename(this.directory)).prover += 1;
    return super.getProverKey(circuit);
  }

  async getVerifierKey(circuit) {
    calls.get(basename(this.directory)).verifier += 1;
    return super.getVerifierKey(circuit);
  }

  async getZKIR(circuit) {
    calls.get(basename(this.directory)).zkir += 1;
    return super.getZKIR(circuit);
  }
}

let registryCalls = 0;
const capturedLogs = [];
const originalConsole = { log: console.log, warn: console.warn, error: console.error };
console.log = (...items) => capturedLogs.push(['log', ...items]);
console.warn = (...items) => capturedLogs.push(['warn', ...items]);
console.error = (...items) => capturedLogs.push(['error', ...items]);
let loaded;
try {
  loaded = await loadAuthenticatedCallTree({
    managedRoot,
    manifestPath,
    expectedCallTreeManifestHash: lock.artifacts.CallTree.manifestSha256,
    implementations,
    expectedAddresses: addresses,
    blockPin,
    providerFactory: (directory, integrity) => new CountingProvider(directory, integrity),
    registryFactory: async (root) => {
      registryCalls += 1;
      return nodeZkConfigRegistry(root);
    },
  });
} finally {
  Object.assign(console, originalConsole);
}

if (capturedLogs.length !== 0) throw new Error(`Loader emitted call/proof diagnostics: ${JSON.stringify(capturedLogs)}`);
if (
  JSON.stringify(loaded.compilationOrder) !== JSON.stringify(['CryptoEventSink', 'FeatureGateway']) ||
  loaded.registryRoot !== managedRoot ||
  loaded.managedRoot !== managedRoot ||
  loaded.manifestHash !== lock.artifacts.CallTree.manifestSha256 ||
  loaded.leafProviders.length !== 2 ||
  loaded.leafProviders.some((provider) => !(provider instanceof NodeZkConfigProvider)) ||
  registryCalls !== 1
) {
  throw new Error('Valid call tree did not produce the exact sink-first/root-last provider topology');
}
for (const name of loaded.compilationOrder) {
  const count = calls.get(name);
  if (JSON.stringify(count) !== JSON.stringify({ constructed: 1, prover: 1, verifier: 1, zkir: 1 })) {
    throw new Error(`${name} ZK configuration was not resolved exactly once: ${JSON.stringify(count)}`);
  }
}

for (const binding of implementations) {
  const [circuit, verifierHash] = Object.entries(binding.verifierKeys)[0];
  const keyLocation = `contract:${binding.address}/${circuit}?vk=${verifierHash}`;
  const resolved = await loaded.registry.resolveKeyLocation(keyLocation);
  if (!resolved || resolved.circuitId !== circuit) {
    throw new Error(`Shared registry could not resolve ${binding.name}.${circuit}`);
  }
}

const stateReads = [];
const fakePublicDataProvider = {
  async queryContractState(address, config) {
    stateReads.push({ address, config });
    return { fixture: true };
  },
};
for (const name of loaded.compilationOrder) {
  const value = await loaded.stateQueries[name].read(fakePublicDataProvider);
  if (value.fixture !== true) throw new Error(`${name} pinned state query did not return the provider result`);
}
if (
  stateReads.length !== 2 ||
  stateReads.some(({ config }) => config.type !== 'blockHash' || config.blockHash !== blockPin.hash)
) {
  throw new Error(`State reads were not block-hash pinned: ${JSON.stringify(stateReads)}`);
}

await assertRejectedBeforeSigner(
  'missing implementation',
  'missing or contain extras',
  { implementations: implementations.slice(0, 1) },
);
await assertRejectedBeforeSigner(
  'duplicate implementation',
  'Duplicate implementation binding',
  { implementations: [implementations[0], implementations[0]] },
);
await assertRejectedBeforeSigner(
  'stale implementation',
  'implementation is stale',
  { implementations: mutateBinding(implementations, 'CryptoEventSink', { compilerManifestSha256: '00'.repeat(32) }) },
);
await assertRejectedBeforeSigner(
  'artifact path mismatch',
  'implementation artifact path mismatch',
  { implementations: mutateBinding(implementations, 'CryptoEventSink', { artifactPath: 'managed/MissingSink' }) },
);
await assertRejectedBeforeSigner(
  'address mismatch',
  'implementation address mismatch',
  { expectedAddresses: { ...addresses, CryptoEventSink: '33'.repeat(32) } },
);
await assertRejectedBeforeSigner(
  'verifier key mismatch',
  'implementation verifier-key mismatch',
  {
    implementations: mutateBinding(implementations, 'CryptoEventSink', {
      verifierKeys: { hashStoreAndUnpause: '44'.repeat(32) },
    }),
  },
);
await assertRejectedBeforeSigner(
  'stale call-tree manifest lock',
  'Call-tree manifest hash mismatch',
  { expectedCallTreeManifestHash: '55'.repeat(32) },
);

originalConsole.log(JSON.stringify({
  checkpoint: 'C09',
  compilationOrder: loaded.compilationOrder,
  leafProviders: loaded.leafProviders.length,
  registryRoot: loaded.registryRoot,
  zkResolution: 'once per implementation',
  blockPin,
  negativeFixtures: 7,
  fakeSignerCalls: 0,
  logs: 'no call/proof data',
  status: 'pass',
}));

function makeBindings(callTreeManifest, expectedAddresses) {
  return callTreeManifest.compilationOrder.map((name) => {
    const entry = callTreeManifest.contracts[name];
    return {
      name,
      address: expectedAddresses[name],
      artifactPath: entry.artifactPath,
      compilerManifestSha256: entry.compilerManifest.sha256,
      verifierKeys: Object.fromEntries(
        Object.entries(entry.circuits).map(([circuit, circuitEntry]) => [circuit, circuitEntry.verifierKey.sha256]),
      ),
    };
  });
}

function mutateBinding(bindings, name, patch) {
  return bindings.map((binding) => binding.name === name ? { ...binding, ...patch } : binding);
}

async function assertRejectedBeforeSigner(label, diagnostic, patch) {
  let signerCalls = 0;
  let providerCalls = 0;
  try {
    await loadAuthenticatedCallTree({
      managedRoot,
      manifestPath,
      expectedCallTreeManifestHash: lock.artifacts.CallTree.manifestSha256,
      implementations,
      expectedAddresses: addresses,
      blockPin,
      providerFactory: () => {
        providerCalls += 1;
        throw new Error('provider construction should not be reached');
      },
      registryFactory: async () => {
        throw new Error('registry construction should not be reached');
      },
      ...patch,
    });
    signerCalls += 1;
  } catch (error) {
    if (!String(error).includes(diagnostic)) {
      throw new Error(`${label} failed at an unrelated boundary: ${error}`);
    }
  }
  if (signerCalls !== 0 || providerCalls !== 0) {
    throw new Error(`${label} reached provider or signer construction`);
  }
}
