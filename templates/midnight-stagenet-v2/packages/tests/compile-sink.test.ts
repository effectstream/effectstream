import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

const bundle = '/app/managed/CryptoEventSink';
const circuitId = 'hashStoreAndUnpause';
const manifestPath = join(bundle, 'compiler/contract-manifest.json');
const lock = JSON.parse(readFileSync('/app/compatibility-lock.json', 'utf8'));
const artifactLock = lock.artifacts.CryptoEventSink;
const manifestBytes = readFileSync(manifestPath);
const manifestHash = sha256(manifestBytes);
const pinnedHashFile = readFileSync(join(bundle, 'compiler/contract-manifest.sha256'), 'utf8').trim();

if (manifestHash !== artifactLock.compilerManifestSha256 || manifestHash !== pinnedHashFile) {
  throw new Error(`CryptoEventSink manifest hash is not pinned: ${manifestHash}`);
}

const manifest = JSON.parse(manifestBytes.toString('utf8'));
const exactMetadata = {
  'compiler-version': artifactLock.compilerVersion,
  'language-version': artifactLock.languageVersion,
  'runtime-version': artifactLock.runtimeVersion,
};
for (const [key, expected] of Object.entries(exactMetadata)) {
  if (manifest[key] !== expected) throw new Error(`Unexpected ${key}: ${String(manifest[key])}`);
}
validateManifestTree(bundle, manifest);

const contractInfo = JSON.parse(readFileSync(join(bundle, 'compiler/contract-info.json'), 'utf8'));
if (contractInfo.circuits.length !== 1 || contractInfo.circuits.length > 7) {
  throw new Error(`Unexpected exported circuit count: ${contractInfo.circuits.length}`);
}
const circuit = contractInfo.circuits[0];
if (
  circuit.name !== circuitId ||
  circuit.pure !== false ||
  circuit.proof !== true ||
  circuit.arguments?.[0]?.type?.['type-name'] !== 'Bytes' ||
  circuit.arguments?.[0]?.type?.length !== 32 ||
  circuit['result-type']?.['type-name'] !== 'Bytes' ||
  circuit['result-type']?.length !== 32
) {
  throw new Error('CryptoEventSink circuit description does not match the template contract');
}
if (contractInfo.witnesses.length !== 0 || contractInfo.contracts.length !== 0) {
  throw new Error('CryptoEventSink must remain witness-free and contain no contract references');
}
const ledgerShape = contractInfo.ledger.map((entry: any) => ({
  name: entry.name,
  exported: entry.exported,
  storage: entry.storage,
  type: entry.type['type-name'],
  length: entry.type.length,
}));
if (
  JSON.stringify(ledgerShape) !==
  JSON.stringify([
    { name: 'lastDigest', exported: true, storage: 'Cell', type: 'Bytes', length: 32 },
    { name: 'paused', exported: true, storage: 'Cell', type: 'Boolean' },
  ])
) {
  throw new Error(`Unexpected CryptoEventSink ledger shape: ${JSON.stringify(ledgerShape)}`);
}

const contractModule = await import('/app/managed/CryptoEventSink/contract/index.js');
if (
  typeof contractModule.Contract !== 'function' ||
  typeof contractModule.ledger !== 'function' ||
  Object.keys(contractModule.expectedVk).join(',') !== circuitId
) {
  throw new Error('Generated CryptoEventSink module exports are incomplete');
}
new contractModule.Contract({});

const provider = new NodeZkConfigProvider(bundle, {
  verify: 'require',
  expectedManifestHash: artifactLock.compilerManifestSha256,
});
await Promise.all([
  provider.getZKIR(circuitId),
  provider.getProverKey(circuitId),
  provider.getVerifierKey(circuitId),
]);

let rejectedWrongPin = false;
try {
  await new NodeZkConfigProvider(bundle, {
    verify: 'require',
    expectedManifestHash: '0'.repeat(64),
  }).getVerifierKey(circuitId);
} catch {
  rejectedWrongPin = true;
}
if (!rejectedWrongPin) throw new Error('NodeZkConfigProvider accepted an incorrect manifest pin');

const source = readFileSync('/contracts/src/CryptoEventSink.compact', 'utf8');
const buildScript = JSON.parse(readFileSync('/contracts/package.json', 'utf8')).scripts['build:sink'];
if (!source.includes('keccak256<Bytes<32>>') || !source.includes('emit(Unpaused {})')) {
  throw new Error('CryptoEventSink source is missing the requested crypto/event behavior');
}
if (!buildScript.includes('--feature-zkir-v3') || buildScript.includes('--no-communications-commitment')) {
  throw new Error('CryptoEventSink build flags violate the locked compilation policy');
}
if (readFileSync('/contracts/sink-compile.stderr', 'utf8').includes('ZKIR not found')) {
  throw new Error('CryptoEventSink compilation skipped ZKIR generation');
}

const proverHeader = readFileSync(join(bundle, `keys/${circuitId}.prover`)).subarray(0, 128).toString('latin1');
const verifierHeader = readFileSync(join(bundle, `keys/${circuitId}.verifier`)).subarray(0, 64).toString('latin1');
if (!proverHeader.startsWith('midnight:prover-key[v7](ir-source[v3-generic])')) {
  throw new Error('CryptoEventSink prover key is not V3-backed V7 material');
}
if (!verifierHeader.startsWith('midnight:verifier-key[v7]')) {
  throw new Error('CryptoEventSink verifier key is not V7 material');
}

console.log(
  JSON.stringify({
    checkpoint: 'C04',
    contract: 'CryptoEventSink',
    circuitId,
    manifestSha256: manifestHash,
    artifactCount: countManifestFiles(manifest),
    nodeZkConfigProvider: 'require/pinned',
    reproducibilityCheck: 'identical compiler manifests',
    status: 'pass',
  }),
);

function validateManifestTree(base: string, node: any, relative = ''): void {
  for (const [name, entry] of Object.entries<any>(node)) {
    if (name.endsWith('-version')) continue;
    if (!entry || typeof entry !== 'object' || !('type' in entry)) continue;
    const path = join(base, relative, name);
    if (entry.type === 'directory') {
      validateManifestTree(base, entry, join(relative, name));
      continue;
    }
    if (entry.type !== 'file' || !existsSync(path) || statSync(path).size !== entry.size) {
      throw new Error(`Missing or size-mismatched manifest artifact: ${path}`);
    }
    if (sha256(readFileSync(path)) !== entry.hash) {
      throw new Error(`Hash-mismatched manifest artifact: ${path}`);
    }
  }
}

function countManifestFiles(node: any): number {
  return Object.values<any>(node).reduce(
    (total, entry) =>
      total + (entry?.type === 'file' ? 1 : entry?.type === 'directory' ? countManifestFiles(entry) : 0),
    0,
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
