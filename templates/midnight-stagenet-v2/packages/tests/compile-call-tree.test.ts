import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

const managed = '/app/managed';
const lock = JSON.parse(readFileSync('/app/compatibility-lock.json', 'utf8'));
const manifestPath = join(managed, 'call-tree-manifest.json');
const manifestBytes = readFileSync(manifestPath);
const manifestHash = sha256(manifestBytes);
const manifest = JSON.parse(manifestBytes.toString('utf8'));

if (manifestHash !== lock.artifacts.CallTree.manifestSha256) {
  throw new Error(`Call-tree manifest is not pinned: ${manifestHash}`);
}
if (
  manifest.schemaVersion !== 1 ||
  manifest.compilerRelease !== '0.33.0-rc.1' ||
  JSON.stringify(manifest.compilationOrder) !== JSON.stringify(['CryptoEventSink', 'FeatureGateway'])
) {
  throw new Error('Call-tree compilation identity/order is not locked');
}

const expected = {
  CryptoEventSink: {
    interfaceName: 'CryptoEventSink',
    circuit: 'hashStoreAndUnpause',
    zkirVersion: '3.0',
    keyVersion: 7,
    compilerManifestSha256: lock.artifacts.CryptoEventSink.compilerManifestSha256,
  },
  FeatureGateway: {
    interfaceName: null,
    circuit: 'run',
    zkirVersion: '2.0',
    keyVersion: 6,
    compilerManifestSha256: lock.artifacts.FeatureGateway.compilerManifestSha256,
  },
} as const;

for (const [name, expectation] of Object.entries(expected)) {
  const entry = manifest.contracts[name];
  const bundle = join(managed, name);
  const circuit = entry?.circuits?.[expectation.circuit];
  if (
    entry?.interfaceName !== expectation.interfaceName ||
    entry?.artifactPath !== `managed/${name}` ||
    entry?.compilerManifest?.sha256 !== expectation.compilerManifestSha256 ||
    circuit?.zkir?.version !== expectation.zkirVersion ||
    circuit?.zkir?.communicationsCommitment !== true ||
    circuit?.keyVersion !== expectation.keyVersion
  ) {
    throw new Error(`${name} call-tree binding is incomplete or incorrect`);
  }

  const compilerManifest = JSON.parse(readFileSync(join(bundle, 'compiler/contract-manifest.json'), 'utf8'));
  validateManifestTree(bundle, compilerManifest);
  if (entry.artifactTreeSha256 !== hashManifestTree(compilerManifest)) {
    throw new Error(`${name} artifact-tree checksum is not bound to the call-tree manifest`);
  }
  for (const artifact of [entry.compilerManifest, entry.contractInfo, circuit.verifierKey, circuit.zkir]) {
    const absolute = join('/app', artifact.path);
    if (sha256(readFileSync(absolute)) !== artifact.sha256) {
      throw new Error(`${name} call-tree artifact checksum mismatch: ${artifact.path}`);
    }
  }

  const info = JSON.parse(readFileSync(join(bundle, 'compiler/contract-info.json'), 'utf8'));
  if (
    info['compiler-version'] !== '0.33.0' ||
    info['language-version'] !== '0.25.0' ||
    info['runtime-version'] !== '0.18.0-rc.1' ||
    info.circuits.length < 1 ||
    info.circuits.length > 7
  ) {
    throw new Error(`${name} compiler metadata/circuit budget is invalid`);
  }
  const zkir = JSON.parse(readFileSync(join(bundle, `zkir/${expectation.circuit}.zkir`), 'utf8'));
  if (zkir.do_communications_commitment !== true) {
    throw new Error(`${name}.${expectation.circuit} disabled communications commitment`);
  }
  const generated = await import(join(bundle, 'contract/index.js'));
  if (generated.expectedVk[expectation.circuit] !== circuit.verifierKey.sha256) {
    throw new Error(`${name}.${expectation.circuit} expectedVk does not bind its verifier key`);
  }

  const provider = new NodeZkConfigProvider(bundle, {
    verify: 'require',
    expectedManifestHash: expectation.compilerManifestSha256,
  });
  await Promise.all([
    provider.getZKIR(expectation.circuit),
    provider.getProverKey(expectation.circuit),
    provider.getVerifierKey(expectation.circuit),
  ]);
}

const gatewayInfo = JSON.parse(readFileSync(join(managed, 'FeatureGateway/compiler/contract-info.json'), 'utf8'));
if (
  gatewayInfo.contracts.length !== 1 ||
  gatewayInfo.contracts[0].name !== 'CryptoEventSink' ||
  gatewayInfo.contracts[0].circuits.length !== 1 ||
  gatewayInfo.contracts[0].circuits[0].name !== 'hashStoreAndUnpause'
) {
  throw new Error('FeatureGateway does not bind the exact CryptoEventSink interface');
}

const contractPackage = JSON.parse(readFileSync('/contracts/package.json', 'utf8'));
const gatewayBuildGuard = readFileSync('/contracts/build-gateway.ts', 'utf8');
if (
  contractPackage.scripts['build:call-tree'] !==
  'bun run build:sink && bun run build:gateway && bun run build:manifest'
) {
  throw new Error('Call-tree compilation order is not explicit');
}
for (const script of ['build:sink', 'build:gateway', 'build:call-tree']) {
  if (contractPackage.scripts[script].includes('--no-communications-commitment')) {
    throw new Error(`${script} removes the communications commitment`);
  }
}
if (contractPackage.scripts['build:gateway'].includes('--feature-zkir-v3')) {
  throw new Error('FeatureGateway should remain a ZKIR-v2 circuit');
}
if (
  !gatewayBuildGuard.includes("managed/CryptoEventSink") ||
  !gatewayBuildGuard.includes("['compactc', 'src/FeatureGateway.compact', 'managed/FeatureGateway']") ||
  gatewayBuildGuard.includes('--feature-zkir-v3') ||
  gatewayBuildGuard.includes('--no-communications-commitment')
) {
  throw new Error('FeatureGateway build guard does not enforce the locked CCC sibling/flag policy');
}

for (const [label, path] of [
  ['gateway-first compilation', '/app/negative/reverse.stderr'],
  ['renamed sibling compilation', '/app/negative/wrong-name.stderr'],
]) {
  const diagnostic = readFileSync(path, 'utf8');
  if (!diagnostic.includes('Required sibling bundle is missing')) {
    throw new Error(`Strict build did not reject ${label} with the expected sibling diagnostic`);
  }
}

const substitutedDir = mkdtempSync('/tmp/c05-substituted-');
const substitutedBundle = join(substitutedDir, 'FeatureGateway');
cpSync(join(managed, 'FeatureGateway'), substitutedBundle, { recursive: true });
const substitutedVerifier = join(substitutedBundle, 'keys/run.verifier');
const verifierBytes = readFileSync(substitutedVerifier);
verifierBytes[verifierBytes.length - 1] ^= 0xff;
writeFileSync(substitutedVerifier, verifierBytes);
let rejectedSubstitution = false;
try {
  await new NodeZkConfigProvider(substitutedBundle, {
    verify: 'require',
    expectedManifestHash: expected.FeatureGateway.compilerManifestSha256,
  }).getVerifierKey('run');
} catch {
  rejectedSubstitution = true;
}
if (!rejectedSubstitution) throw new Error('Fail-closed provider accepted a substituted verifier fixture');

console.log(
  JSON.stringify({
    checkpoint: 'C05',
    compilationOrder: manifest.compilationOrder,
    circuits: {
      'CryptoEventSink.hashStoreAndUnpause': { zkir: '3.0', key: 7 },
      'FeatureGateway.run': { zkir: '2.0', key: 6 },
    },
    reverseOrder: 'rejected missing authenticated sibling',
    renamedSibling: 'rejected exact-name mismatch',
    substitutedArtifact: 'rejected manifest mismatch',
    manifestSha256: manifestHash,
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
    if (sha256(readFileSync(path)) !== entry.hash) throw new Error(`Hash-mismatched manifest artifact: ${path}`);
  }
}

function hashManifestTree(manifestNode: any): string {
  const files: Array<{ path: string; size: number; hash: string }> = [];
  visit(manifestNode);
  return sha256(
    Buffer.from(
      `${files
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((file) => `${file.path}\0${file.size}\0${file.hash}`)
        .join('\n')}\n`,
    ),
  );

  function visit(node: any, prefix = ''): void {
    for (const [name, entry] of Object.entries<any>(node)) {
      if (!entry || typeof entry !== 'object' || !('type' in entry)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.type === 'directory') visit(entry, path);
      if (entry.type === 'file') files.push({ path, size: entry.size, hash: entry.hash });
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
