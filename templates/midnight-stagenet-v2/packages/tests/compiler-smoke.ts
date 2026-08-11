import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const managedDir = '/toolchain-smoke/managed';
const stderrPath = '/toolchain-smoke/compile.stderr';
const lock = JSON.parse(readFileSync('/app/compatibility-lock.json', 'utf8'));

const managerVersion = run('compact', ['--version']);
const compilerVersion = run('compactc', ['--version']);

if (!managerVersion.includes('0.5.1')) {
  throw new Error(`Unexpected Compact manager version: ${managerVersion}`);
}
if (compilerVersion.trim() !== '0.33.0') {
  throw new Error(`Unexpected Compact compiler version: ${compilerVersion}`);
}
if (
  lock.toolchain.compactManagerAsset.release !== 'midnightntwrk/compact@compact-v0.5.1' ||
  lock.toolchain.compactManagerAsset.arm64Sha256 !==
    'bbeb53b34c895aa52e13a6375cbfe90bd670b2e6a72ba23356d383664a9536cf' ||
  lock.toolchain.compactManagerAsset.amd64Sha256 !==
    '684c6b3d2eef9484aabba7a0820c166ae5c169f3aecf28cbea2074840263ba66' ||
  lock.toolchain.compactCompiler !== '0.33.0-rc.1' ||
  lock.toolchain.compactCompilerAsset.release !== 'LFDT-Minokawa/compact@compactc-v0.33.0-rc.1' ||
  lock.toolchain.compactCompilerAsset.arm64Sha256 !==
    'a186b604f73eff696016db517d18913a66162f5354e8b48f83e5c51ed77a04d9' ||
  lock.toolchain.compactCompilerAsset.amd64Sha256 !==
    'c1d5580c5ebfe94a7604e1cf74c85fa899545e266bdbe975d9c8e16ee6d9d168'
) {
  throw new Error('Compact manager/compiler release identity is not fully locked');
}

const files = listFiles(managedDir);
for (const requiredSuffix of ['.zkir', '.bzkir']) {
  if (!files.some((file) => file.endsWith(requiredSuffix))) {
    throw new Error(`Compiled smoke artifact is missing ${requiredSuffix}`);
  }
}

const manifestPath = files.find((file) => file.endsWith('/compiler/contract-manifest.json'));
if (!manifestPath) {
  throw new Error('Compiled smoke artifact is missing compiler/contract-manifest.json');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const expectedManifest = {
  'compiler-version': '0.33.0',
  'language-version': '0.25.0',
  'runtime-version': '0.18.0-rc.1',
};
for (const [key, expected] of Object.entries(expectedManifest)) {
  if (manifest[key] !== expected) {
    throw new Error(`Unexpected ${key}: ${String(manifest[key])}`);
  }
}

const verifierHeader = readFileSync(join(managedDir, 'keys/hashAndStore.verifier')).subarray(0, 64).toString('latin1');
const proverHeader = readFileSync(join(managedDir, 'keys/hashAndStore.prover')).subarray(0, 128).toString('latin1');
if (!verifierHeader.startsWith('midnight:verifier-key[v7]')) {
  throw new Error('Compiler did not emit a V7 verifier key');
}
if (!proverHeader.startsWith('midnight:prover-key[v7](ir-source[v3-generic])')) {
  throw new Error('Compiler did not emit a V3-backed V7 prover key');
}

const compilerStderr = readFileSync(stderrPath, 'utf8');
if (compilerStderr.includes('ZKIR not found')) {
  throw new Error('Compiler reported that ZKIR generation was skipped');
}

for (const file of files) {
  if (statSync(file).size === 0) throw new Error(`Empty compiler artifact: ${file}`);
}

console.log(
  JSON.stringify({
    checkpoint: 'C03-compiler',
    managerVersion: managerVersion.trim(),
    managerReleaseAsset: lock.toolchain.compactManagerAsset.release,
    compilerVersion: compilerVersion.trim(),
    releaseAsset: lock.toolchain.compactCompilerAsset.release,
    manifest: expectedManifest,
    keyFormat: 'verifier-key[v7]/prover-key[v7](ir-source[v3-generic])',
    artifactCount: files.length,
    zkirV3Artifacts: files.filter((file) => /\.b?zkir$/.test(file)).map((file) => file.slice(managedDir.length + 1)),
    status: 'pass',
  }),
);

function run(command: string, args: string[]): string {
  const result = Bun.spawnSync([command, ...args], { stderr: 'pipe', stdout: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString();
}

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) throw new Error(`Missing directory: ${directory}`);
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...listFiles(path));
    else files.push(path);
  }
  return files.sort();
}
