import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAGENET_PROFILE_DEFAULTS } from '../network-config/src/network-profile.ts';
import { constructV2Providers, PROVIDER_KINDS } from '../chains/midnight-contracts-v2/src/providers.mjs';
import { MIDNIGHT_V2_IPC_VERSION, redactBoundaryValue } from '../chains/midnight-contracts-v2/src/ipc.mjs';
import { assertNode22, assertSinglePhysicalCopy, claimRuntimeLane } from '../chains/midnight-contracts-v2/src/runtime-guard.mjs';

assertNode22();
if (process.release.name !== 'node') throw new Error('Provider package is not running under Node');

const lock = JSON.parse(await readFile('/app/compatibility-lock.json', 'utf8'));
const packageManifest = JSON.parse(await readFile('/app/packages/chains/midnight-contracts-v2/package.json', 'utf8'));
const legacyTree = await hashTree('/app/legacy/midnight-contracts');
if (legacyTree.files.length !== 16 || legacyTree.hash !== lock.baselines.legacyV1PackageTreeSha256) {
  throw new Error(`Legacy Midnight v1 package drifted: ${legacyTree.hash}`);
}
if (legacyTree.files.some((file) => /\.(?:test|spec)\.[cm]?[jt]s$/.test(file))) {
  throw new Error('Legacy Midnight v1 package gained a direct test that C08 does not execute');
}
const expectedPackages = {
  '@midnight-ntwrk/compact-js': lock.toolchain.compactJs,
  '@midnight-ntwrk/compact-runtime': lock.toolchain.compactRuntime,
  '@midnight-ntwrk/platform-js': lock.toolchain.platformJs,
  '@midnightntwrk/ledger-v9': lock.toolchain.ledgerV9,
  '@midnightntwrk/onchain-runtime-v4': lock.toolchain.onchainRuntimeV4,
  ...Object.fromEntries(
    [
      '@midnight-ntwrk/midnight-js-contracts',
      '@midnight-ntwrk/midnight-js-http-client-proof-provider',
      '@midnight-ntwrk/midnight-js-indexer-public-data-provider',
      '@midnight-ntwrk/midnight-js-level-private-state-provider',
      '@midnight-ntwrk/midnight-js-network-id',
      '@midnight-ntwrk/midnight-js-node-zk-config-provider',
      '@midnight-ntwrk/midnight-js-protocol',
      '@midnight-ntwrk/midnight-js-types',
      '@midnight-ntwrk/midnight-js-utils',
    ].map((name) => [name, lock.toolchain.midnightJs]),
  ),
  '@midnightntwrk/wallet-sdk': lock.toolchain.walletSdk,
  ...lock.toolchain.walletPackages,
};

for (const [name, expectedVersion] of Object.entries(expectedPackages)) {
  if (packageManifest.dependencies[name] !== expectedVersion) {
    throw new Error(`${name} is not pinned to ${expectedVersion} in the v2 package`);
  }
  const roots = await findPackageRoots('/app/node_modules', name);
  assertSinglePhysicalCopy(name, roots);
  const installed = JSON.parse(await readFile(join(roots[0], 'package.json'), 'utf8'));
  if (installed.version !== expectedVersion) throw new Error(`${name} resolved to ${installed.version}`);
}

const calls = [];
const factories = Object.fromEntries(
  PROVIDER_KINDS.map((kind) => [kind, (config) => {
    calls.push({ kind, config });
    return Object.freeze({ kind });
  }]),
);
const providers = constructV2Providers(STAGENET_PROFILE_DEFAULTS, factories);
if (JSON.stringify(Object.keys(providers)) !== JSON.stringify(PROVIDER_KINDS) || calls.length !== PROVIDER_KINDS.length) {
  throw new Error('Provider construction did not use each explicit fake exactly once');
}
if (calls.some(({ config }) => config.proofServerUrl !== STAGENET_PROFILE_DEFAULTS.proofServerUrl)) {
  throw new Error('Provider factories received a mutated or incomplete network profile');
}

let malformedFactoryCalls = 0;
const guardedFactories = Object.fromEntries(PROVIDER_KINDS.map((kind) => [kind, () => {
  malformedFactoryCalls += 1;
  return { kind };
}]));
expectFailure('missing proof config', 'requires proofServerUrl', () =>
  constructV2Providers({ ...STAGENET_PROFILE_DEFAULTS, proofServerUrl: undefined }, guardedFactories),
);
expectFailure('malformed node config', 'malformed nodeUrl', () =>
  constructV2Providers({ ...STAGENET_PROFILE_DEFAULTS, nodeUrl: 'not-a-url?seed=secret' }, guardedFactories),
);
expectFailure('credential-bearing proof config', 'rejects credentials or URL metadata in proofServerUrl', () =>
  constructV2Providers(
    { ...STAGENET_PROFILE_DEFAULTS, proofServerUrl: 'https://alice:secret@example.test/prove?token=private' },
    guardedFactories,
  ),
);
if (malformedFactoryCalls !== 0) throw new Error('Malformed provider config reached a provider factory');

expectFailure('synthetic duplicate runtime', 'resolved to 2 physical copies', () =>
  assertSinglePhysicalCopy('@midnightntwrk/ledger-v9', ['/one', '/two']),
);
claimRuntimeLane('ledger-v9/runtime-v4');
expectFailure('mixed runtime lane', 'cannot share a process', () => {
  const symbol = Symbol.for('@effectstream/midnight-runtime-lane');
  globalThis[symbol] = 'ledger-v8/runtime-v3';
  try {
    claimRuntimeLane('ledger-v9/runtime-v4');
  } finally {
    globalThis[symbol] = 'ledger-v9/runtime-v4';
  }
});

const redacted = redactBoundaryValue({
  walletSeed: 'correct horse battery staple',
  privateStatePassword: 'hunter2',
  endpoint: 'https://alice:secret@example.test/path?token=abc#proof',
});
if (
  redacted.walletSeed !== '<redacted>' ||
  redacted.privateStatePassword !== '<redacted>' ||
  redacted.endpoint !== 'https://example.test/path' ||
  JSON.stringify(redacted).includes('horse') ||
  JSON.stringify(redacted).includes('hunter2') ||
  JSON.stringify(redacted).includes('alice')
) {
  throw new Error(`IPC redaction failed: ${JSON.stringify(redacted)}`);
}

const request = {
  protocol: MIDNIGHT_V2_IPC_VERSION,
  id: 'c08-round-trip',
  method: 'providers.construct',
  params: STAGENET_PROFILE_DEFAULTS,
};
const response = await runBunToNodeBridge(request);
if (
  !response.ok ||
  response.id !== request.id ||
  response.result?.runtime !== 'node' ||
  JSON.stringify(response.result?.providerKinds) !== JSON.stringify(PROVIDER_KINDS)
) {
  throw new Error(`Bun-to-Node provider boundary failed: ${JSON.stringify(response)}`);
}

console.log(JSON.stringify({
  checkpoint: 'C08-provider',
  runtime: process.version,
  exactPackages: Object.keys(expectedPackages).length,
  providerKinds: PROVIDER_KINDS,
  boundary: 'Bun launcher -> versioned Node worker IPC',
  legacyV1: `unchanged package tree (${legacyTree.files.length} files; no direct package tests)`,
  secrets: 'redacted',
  status: 'pass',
}));

async function findPackageRoots(nodeModules, packageName) {
  const matches = new Set();
  await walk(nodeModules, async (path, entry) => {
    if (entry.name !== 'package.json') return;
    try {
      const manifest = JSON.parse(await readFile(path, 'utf8'));
      if (manifest.name === packageName) matches.add(await realpath(dirname(path)));
    } catch {
      // Ignore non-package JSON and broken optional dependency links.
    }
  });
  if (matches.size === 0) throw new Error(`${packageName} is not installed`);
  return [...matches];
}

async function hashTree(root) {
  const files = [];
  await walk(root, async (path, entry) => {
    if (entry.isFile()) files.push(relative(root, path));
  });
  files.sort();
  const aggregate = createHash('sha256');
  for (const file of files) {
    const digest = createHash('sha256').update(await readFile(join(root, file))).digest('hex');
    aggregate.update(`${digest}  ${file}\n`);
  }
  return { files, hash: aggregate.digest('hex') };
}

async function walk(root, visit, seen = new Set()) {
  const resolved = await realpath(root);
  if (seen.has(resolved)) return;
  seen.add(resolved);
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) await walk(path, visit, seen);
    else if (entry.isSymbolicLink()) {
      try {
        const target = await realpath(path);
        const statEntries = await readdir(target, { withFileTypes: true });
        if (statEntries.length >= 0) await walk(target, visit, seen);
      } catch {
        // Ignore broken optional dependency links.
      }
    } else await visit(path, entry);
  }
}

function runBunToNodeBridge(message) {
  return new Promise((resolve, reject) => {
    const bridge = fileURLToPath(new URL('../chains/midnight-contracts-v2/src/bun-node-bridge.mjs', import.meta.url));
    const child = spawn('bun', [bridge], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code !== 0) return reject(new Error(`Bun bridge exited ${code}: ${stderr}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (error) {
        reject(new Error(`Bun bridge returned malformed output: ${stdout}; ${error}`));
      }
    });
    child.stdin.end(`${JSON.stringify(message)}\n`);
  });
}

function expectFailure(label, expected, operation) {
  try {
    operation();
  } catch (error) {
    if (String(error).includes(expected)) return;
    throw new Error(`${label} failed with unrelated diagnostic: ${error}`);
  }
  throw new Error(`${label} unexpectedly succeeded`);
}
