import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  NodeZkConfigProvider,
  nodeZkConfigRegistry,
} from '@midnight-ntwrk/midnight-js-node-zk-config-provider';

import { assertNode22, claimRuntimeLane } from './runtime-guard.mjs';

const hex32 = /^(?:0x)?[0-9a-fA-F]{64}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;

export async function loadAuthenticatedCallTree(options) {
  assertNode22();
  const normalized = validateOptions(options);
  const manifestBytes = readFileSync(normalized.manifestPath);
  const manifestHash = sha256(manifestBytes);
  if (manifestHash !== normalized.expectedCallTreeManifestHash) {
    throw new Error(`Call-tree manifest hash mismatch: ${manifestHash}`);
  }
  const manifest = parseJson(manifestBytes, 'call-tree manifest');
  const ordered = validateManifestShape(manifest, normalized.managedRoot);
  const bindings = validateBindings(ordered, manifest.contracts, normalized);
  const validatedBundles = ordered.map((name) =>
    validateBundle(name, manifest.contracts[name], normalized.managedRoot),
  );

  claimRuntimeLane('ledger-v9/runtime-v4');
  const leafProviders = [];
  const zkConfigs = {};
  for (const bundle of validatedBundles) {
    const provider = normalized.providerFactory(bundle.bundlePath, {
      verify: 'require',
      expectedManifestHash: bundle.compilerManifestSha256,
    });
    leafProviders.push(provider);
    zkConfigs[bundle.name] = {};
    for (const circuit of bundle.circuits) {
      const [proverKey, verifierKey, zkir] = await Promise.all([
        provider.getProverKey(circuit),
        provider.getVerifierKey(circuit),
        provider.getZKIR(circuit),
      ]);
      zkConfigs[bundle.name][circuit] = Object.freeze({ proverKey, verifierKey, zkir });
    }
    Object.freeze(zkConfigs[bundle.name]);
  }

  const registry = await normalized.registryFactory(normalized.managedRoot);
  const stateQueries = Object.freeze(
    Object.fromEntries(
      ordered.map((name) => [
        name,
        createPinnedStateQuery(name, bindings.get(name).address, normalized.blockPin),
      ]),
    ),
  );

  return Object.freeze({
    compilationOrder: Object.freeze([...ordered]),
    managedRoot: normalized.managedRoot,
    manifestHash,
    leafProviders: Object.freeze(leafProviders),
    registry,
    registryRoot: normalized.managedRoot,
    zkConfigs: Object.freeze(zkConfigs),
    stateQueries,
  });
}

export function createPinnedStateQuery(contractName, address, blockPin) {
  if (typeof contractName !== 'string' || contractName.length === 0) throw new Error('State query contract name is required');
  if (!hex32.test(address)) throw new Error(`${contractName} state query address is invalid`);
  const pin = validateBlockPin(blockPin);
  return Object.freeze({
    contractName,
    address,
    block: pin,
    async read(publicDataProvider) {
      if (!publicDataProvider || typeof publicDataProvider.queryContractState !== 'function') {
        throw new Error(`${contractName} state query requires a public data provider`);
      }
      return publicDataProvider.queryContractState(address, { type: 'blockHash', blockHash: pin.hash });
    },
  });
}

function validateOptions(options) {
  if (!options || typeof options !== 'object') throw new Error('Call-tree loader options are required');
  const managedRoot = resolveRequiredDirectory(options.managedRoot, 'managedRoot');
  const manifestPath = resolve(String(options.manifestPath ?? ''));
  if (manifestPath !== join(managedRoot, 'call-tree-manifest.json')) {
    throw new Error('Call-tree manifest must be the managed-root manifest');
  }
  if (!sha256Pattern.test(options.expectedCallTreeManifestHash ?? '')) {
    throw new Error('Expected call-tree manifest hash must be SHA-256');
  }
  if (!Array.isArray(options.implementations)) throw new Error('Implementation bindings are required');
  if (!options.expectedAddresses || typeof options.expectedAddresses !== 'object') {
    throw new Error('Expected deployment addresses are required');
  }
  return {
    managedRoot,
    manifestPath,
    expectedCallTreeManifestHash: options.expectedCallTreeManifestHash,
    implementations: options.implementations,
    expectedAddresses: options.expectedAddresses,
    blockPin: validateBlockPin(options.blockPin),
    providerFactory: options.providerFactory ?? ((directory, integrity) => new NodeZkConfigProvider(directory, integrity)),
    registryFactory: options.registryFactory ?? nodeZkConfigRegistry,
  };
}

function validateManifestShape(manifest, managedRoot) {
  if (
    !manifest ||
    manifest.schemaVersion !== 1 ||
    manifest.compilerRelease !== '0.33.0-rc.1' ||
    !Array.isArray(manifest.compilationOrder) ||
    !manifest.contracts ||
    typeof manifest.contracts !== 'object'
  ) {
    throw new Error('Call-tree manifest shape or compiler release is invalid');
  }
  const ordered = manifest.compilationOrder;
  if (ordered.length === 0 || new Set(ordered).size !== ordered.length) {
    throw new Error('Call-tree compilation order is empty or duplicated');
  }
  const contractNames = Object.keys(manifest.contracts);
  if (
    contractNames.length !== ordered.length ||
    ordered.some((name) => typeof name !== 'string' || !contractNames.includes(name))
  ) {
    throw new Error('Call-tree manifest contracts do not exactly match compilation order');
  }
  for (const name of ordered) {
    const expectedPath = `managed/${name}`;
    if (manifest.contracts[name]?.artifactPath !== expectedPath) {
      throw new Error(`${name} artifact path is not the exact managed sibling`);
    }
    resolveWithin(dirname(managedRoot), expectedPath, `${name} artifact path`);
  }
  return ordered;
}

function validateBindings(ordered, contracts, options) {
  if (options.implementations.length !== ordered.length) {
    throw new Error('Implementation bindings are missing or contain extras');
  }
  const expectedAddressNames = Object.keys(options.expectedAddresses);
  if (
    expectedAddressNames.length !== ordered.length ||
    ordered.some((name) => !expectedAddressNames.includes(name))
  ) {
    throw new Error('Expected deployment addresses do not exactly match the call tree');
  }
  const bindings = new Map();
  for (const binding of options.implementations) {
    if (!binding || typeof binding !== 'object' || typeof binding.name !== 'string') {
      throw new Error('Implementation binding is malformed');
    }
    if (bindings.has(binding.name)) throw new Error(`Duplicate implementation binding: ${binding.name}`);
    bindings.set(binding.name, binding);
  }
  for (const name of ordered) {
    const binding = bindings.get(name);
    const entry = contracts[name];
    if (!binding) throw new Error(`Missing implementation binding: ${name}`);
    if (binding.artifactPath !== entry.artifactPath) throw new Error(`${name} implementation artifact path mismatch`);
    if (binding.compilerManifestSha256 !== entry.compilerManifest?.sha256) {
      throw new Error(`${name} implementation is stale`);
    }
    if (!hex32.test(binding.address ?? '') || binding.address !== options.expectedAddresses[name]) {
      throw new Error(`${name} implementation address mismatch`);
    }
    const circuits = Object.keys(entry.circuits ?? {});
    if (
      !binding.verifierKeys ||
      Object.keys(binding.verifierKeys).length !== circuits.length ||
      circuits.some((circuit) => binding.verifierKeys[circuit] !== entry.circuits[circuit].verifierKey?.sha256)
    ) {
      throw new Error(`${name} implementation verifier-key mismatch`);
    }
  }
  return bindings;
}

function validateBundle(name, entry, managedRoot) {
  const projectRoot = dirname(managedRoot);
  const bundlePath = resolveWithin(projectRoot, entry.artifactPath, `${name} artifact path`);
  if (bundlePath !== join(managedRoot, name)) throw new Error(`${name} is not an exact managed sibling`);
  if (entry.compilerManifest?.path !== `${entry.artifactPath}/compiler/contract-manifest.json`) {
    throw new Error(`${name} compiler manifest path mismatch`);
  }
  if (entry.contractInfo?.path !== `${entry.artifactPath}/compiler/contract-info.json`) {
    throw new Error(`${name} contract info path mismatch`);
  }
  const compilerManifestPath = resolveWithin(projectRoot, entry.compilerManifest?.path, `${name} compiler manifest`);
  const compilerManifestBytes = readRequiredFile(compilerManifestPath, `${name} compiler manifest`);
  if (sha256(compilerManifestBytes) !== entry.compilerManifest?.sha256) {
    throw new Error(`${name} compiler manifest checksum mismatch`);
  }
  const compilerManifest = parseJson(compilerManifestBytes, `${name} compiler manifest`);
  if (
    compilerManifest['manifest-version'] !== '1' ||
    compilerManifest['compiler-version'] !== entry.compiler?.version ||
    compilerManifest['language-version'] !== entry.compiler?.languageVersion ||
    compilerManifest['runtime-version'] !== entry.compiler?.runtimeVersion
  ) {
    throw new Error(`${name} compiler manifest version mismatch`);
  }
  validateCompilerManifestTree(bundlePath, compilerManifest);
  if (hashManifestTree(compilerManifest) !== entry.artifactTreeSha256) {
    throw new Error(`${name} artifact tree checksum mismatch`);
  }

  const infoPath = resolveWithin(projectRoot, entry.contractInfo?.path, `${name} contract info`);
  const infoBytes = readRequiredFile(infoPath, `${name} contract info`);
  if (sha256(infoBytes) !== entry.contractInfo?.sha256) throw new Error(`${name} contract info checksum mismatch`);
  const info = parseJson(infoBytes, `${name} contract info`);
  const circuits = Object.keys(entry.circuits ?? {});
  if (
    circuits.length < 1 ||
    circuits.length > 7 ||
    info.circuits?.length !== circuits.length ||
    circuits.some((circuit) => !info.circuits.some((item) => item.name === circuit))
  ) {
    throw new Error(`${name} circuit metadata mismatch`);
  }

  for (const circuit of circuits) {
    const circuitEntry = entry.circuits[circuit];
    if (circuitEntry.verifierKey?.path !== `${entry.artifactPath}/keys/${circuit}.verifier`) {
      throw new Error(`${name}.${circuit} verifier-key path mismatch`);
    }
    if (circuitEntry.zkir?.path !== `${entry.artifactPath}/zkir/${circuit}.zkir`) {
      throw new Error(`${name}.${circuit} ZKIR path mismatch`);
    }
    const verifierPath = resolveWithin(projectRoot, circuitEntry.verifierKey?.path, `${name}.${circuit} verifier key`);
    const verifier = readRequiredFile(verifierPath, `${name}.${circuit} verifier key`);
    if (
      sha256(verifier) !== circuitEntry.verifierKey?.sha256 ||
      !verifier.subarray(0, 64).toString('latin1').startsWith(`midnight:verifier-key[v${circuitEntry.keyVersion}]`)
    ) {
      throw new Error(`${name}.${circuit} verifier-key identity mismatch`);
    }
    const zkirPath = resolveWithin(projectRoot, circuitEntry.zkir?.path, `${name}.${circuit} ZKIR`);
    const zkirBytes = readRequiredFile(zkirPath, `${name}.${circuit} ZKIR`);
    const zkir = parseJson(zkirBytes, `${name}.${circuit} ZKIR`);
    if (
      sha256(zkirBytes) !== circuitEntry.zkir?.sha256 ||
      `${zkir.version?.major}.${zkir.version?.minor}` !== circuitEntry.zkir?.version ||
      zkir.do_communications_commitment !== true ||
      circuitEntry.zkir?.communicationsCommitment !== true
    ) {
      throw new Error(`${name}.${circuit} ZKIR identity mismatch`);
    }
  }
  return { name, bundlePath, compilerManifestSha256: entry.compilerManifest.sha256, circuits };
}

function validateCompilerManifestTree(bundlePath, node, prefix = '') {
  for (const [name, entry] of Object.entries(node)) {
    if (name.endsWith('-version')) continue;
    if (!entry || typeof entry !== 'object' || !('type' in entry)) continue;
    const relativePath = prefix ? `${prefix}/${name}` : name;
    const path = resolveWithin(bundlePath, relativePath, 'compiler artifact');
    if (entry.type === 'directory') {
      validateCompilerManifestTree(bundlePath, entry, relativePath);
      continue;
    }
    const bytes = readRequiredFile(path, `compiler artifact ${relativePath}`);
    if (entry.type !== 'file' || bytes.length !== entry.size || sha256(bytes) !== entry.hash) {
      throw new Error(`Compiler artifact checksum mismatch: ${relativePath}`);
    }
  }
}

function hashManifestTree(manifest) {
  const files = [];
  visit(manifest);
  const body = `${files
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}\0${file.size}\0${file.hash}`)
    .join('\n')}\n`;
  return sha256(Buffer.from(body));

  function visit(node, prefix = '') {
    for (const [name, entry] of Object.entries(node)) {
      if (!entry || typeof entry !== 'object' || !('type' in entry)) continue;
      const path = prefix ? `${prefix}/${name}` : name;
      if (entry.type === 'directory') visit(entry, path);
      if (entry.type === 'file') files.push({ path, size: entry.size, hash: entry.hash });
    }
  }
}

function validateBlockPin(blockPin) {
  if (
    !blockPin ||
    !Number.isSafeInteger(blockPin.height) ||
    blockPin.height < 0 ||
    !hex32.test(blockPin.hash ?? '')
  ) {
    throw new Error('A valid finalized block hash and height are required');
  }
  return Object.freeze({ hash: blockPin.hash, height: blockPin.height });
}

function resolveRequiredDirectory(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} is required`);
  const path = resolve(value);
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${field} is not a directory`);
  return path;
}

function resolveWithin(root, candidate, label) {
  if (typeof candidate !== 'string' || candidate.length === 0 || isAbsolute(candidate)) {
    throw new Error(`${label} must be a relative path`);
  }
  const path = resolve(root, candidate);
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`${label} escapes its root`);
  return path;
}

function readRequiredFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${label} is missing`);
  return readFileSync(path);
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
