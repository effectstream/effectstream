import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const validSecret = requiredEnv('MIDNIGHT_V2_WRITE_WALLET_SEED_FILE');
const seed = readFileSync(validSecret, 'utf8').trim();
const malformedSecret = '/tmp/c18-malformed-wallet-seed';
writeFileSync(malformedSecret, 'not-a-wallet-seed\n');

const unauthorized = runCase({
  RUN_STAGENET_WRITE_TESTS: '0',
  MIDNIGHT_V2_WRITE_WALLET_FUNDED: '1',
  MIDNIGHT_V2_WRITE_WALLET_SEED_FILE: validSecret,
});
assertSkipped(unauthorized, 'authorization-disabled');

const unfunded = runCase({
  RUN_STAGENET_WRITE_TESTS: '1',
  MIDNIGHT_V2_WRITE_WALLET_FUNDED: '0',
  MIDNIGHT_V2_WRITE_WALLET_SEED_FILE: validSecret,
});
assertSkipped(unfunded, 'funding-not-confirmed');

const malformed = runCase({
  RUN_STAGENET_WRITE_TESTS: '1',
  MIDNIGHT_V2_WRITE_WALLET_FUNDED: '1',
  MIDNIGHT_V2_WRITE_WALLET_SEED_FILE: malformedSecret,
  MIDNIGHT_V2_WRITE_MODE: 'local-substitute',
  MIDNIGHT_V2_RUN_ID: 'c18-malformed',
});
if (malformed.status === 0 || !malformed.stderr.includes('Supplied Midnight wallet secret is malformed')) {
  throw new Error('Malformed supplied credentials did not fail closed');
}

const runId = `c18-local-${process.pid}-${Date.now()}`;
const authorized = runCase({
  RUN_STAGENET_WRITE_TESTS: '1',
  MIDNIGHT_V2_WRITE_WALLET_FUNDED: '1',
  MIDNIGHT_V2_WRITE_WALLET_SEED_FILE: validSecret,
  MIDNIGHT_V2_WRITE_MODE: 'local-substitute',
  MIDNIGHT_V2_RUN_ID: runId,
});
if (authorized.status !== 0 || !authorized.stdout.includes('"checkpoint":"C18-write-canary"')) {
  process.stderr.write(authorized.stderr);
  throw new Error(`Authorized local write substitute failed with status ${authorized.status}`);
}

const allOutput = [
  unauthorized.stdout,
  unauthorized.stderr,
  unfunded.stdout,
  unfunded.stderr,
  malformed.stdout,
  malformed.stderr,
  authorized.stdout,
  authorized.stderr,
].join('\n');
if (allOutput.includes(seed)) throw new Error('C18 output leaked the wallet seed');
if (/privateStatePassword|witness|proofData|proof_data/i.test(allOutput)) {
  throw new Error('C18 output leaked witness/proof internals');
}
process.stdout.write(authorized.stdout);
console.log(JSON.stringify({
  checkpoint: 'C18-fixtures',
  cases: ['unauthorized-skip', 'funding-skip', 'malformed-fail', 'authorized-local-pass'],
  secretLeak: false,
  proofInternalsLeak: false,
  status: 'pass',
}));

function runCase(environment) {
  return spawnSync('node', ['packages/tests/write-canary.mjs'], {
    cwd: '/app',
    env: { ...process.env, ...environment },
    encoding: 'utf8',
    timeout: 20 * 60 * 1_000,
  });
}

function assertSkipped(result, reason) {
  if (
    result.status !== 0 ||
    !result.stdout.includes(`"reason":"${reason}"`) ||
    !result.stdout.includes('"providerInitialized":false') ||
    result.stdout.includes('"checkpoint":"C12"')
  ) {
    throw new Error(`${reason} did not skip before provider initialization`);
  }
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
