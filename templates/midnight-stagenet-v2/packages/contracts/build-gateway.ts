import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = import.meta.dir;
const sibling = join(root, 'managed/CryptoEventSink');
const contractInfoPath = join(sibling, 'compiler/contract-info.json');
const compilerManifestPath = join(sibling, 'compiler/contract-manifest.json');

if (!existsSync(contractInfoPath) || !existsSync(compilerManifestPath)) {
  throw new Error('Required sibling bundle is missing: managed/CryptoEventSink/compiler/contract-info.json');
}

const contractInfoBytes = readFileSync(contractInfoPath);
const contractInfo = JSON.parse(contractInfoBytes.toString('utf8'));
const compilerManifest = JSON.parse(readFileSync(compilerManifestPath, 'utf8'));
const authenticatedInfoHash = compilerManifest.compiler?.['contract-info.json']?.hash;
if (authenticatedInfoHash !== createHash('sha256').update(contractInfoBytes).digest('hex')) {
  throw new Error('CryptoEventSink contract-info.json is not authenticated by its compiler manifest');
}

const circuit = contractInfo.circuits?.[0];
if (
  contractInfo.circuits?.length !== 1 ||
  circuit?.name !== 'hashStoreAndUnpause' ||
  circuit?.pure !== false ||
  circuit?.proof !== true ||
  circuit?.arguments?.length !== 1 ||
  circuit.arguments[0]?.type?.['type-name'] !== 'Bytes' ||
  circuit.arguments[0]?.type?.length !== 32 ||
  circuit?.['result-type']?.['type-name'] !== 'Bytes' ||
  circuit?.['result-type']?.length !== 32
) {
  throw new Error('CryptoEventSink sibling does not implement the required CCC interface');
}

const result = Bun.spawnSync(
  ['compactc', 'src/FeatureGateway.compact', 'managed/FeatureGateway'],
  { cwd: root, stdout: 'pipe', stderr: 'pipe' },
);
const stdout = new TextDecoder().decode(result.stdout);
const stderr = new TextDecoder().decode(result.stderr);
process.stdout.write(stdout);
process.stderr.write(stderr);
if (result.exitCode !== 0) throw new Error(`FeatureGateway compactc failed with exit ${result.exitCode}`);
if (stderr.includes('ZKIR not found')) {
  throw new Error('FeatureGateway compactc skipped final circuit compilation: ZKIR not found');
}
