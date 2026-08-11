import { spawnSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, rmSync } from 'node:fs';

if (process.env.RUN_STAGENET_WRITE_TESTS !== '1') {
  skip('authorization-disabled');
} else if (process.env.MIDNIGHT_V2_WRITE_WALLET_FUNDED !== '1') {
  skip('funding-not-confirmed');
} else {
  const seedFile = process.env.MIDNIGHT_V2_WRITE_WALLET_SEED_FILE;
  if (!seedFile || !existsSync(seedFile)) skip('wallet-secret-unavailable');
  try {
    accessSync(seedFile, constants.R_OK);
  } catch {
    skip('wallet-secret-unreadable');
  }

  const seed = readFileSync(seedFile, 'utf8').trim();
  if (!/^[0-9a-f]{64}$/i.test(seed)) {
    throw new Error('Supplied Midnight wallet secret is malformed');
  }
  const runId = requiredRunId(process.env.MIDNIGHT_V2_RUN_ID);
  const mode = process.env.MIDNIGHT_V2_WRITE_MODE;
  if (mode !== 'local-substitute' && mode !== 'hosted') {
    throw new Error('MIDNIGHT_V2_WRITE_MODE must be local-substitute or hosted');
  }
  const resultFile = `/tmp/${runId}-write-result.json`;
  rmSync(resultFile, { force: true });
  const child = spawnSync('node', ['packages/tests/ccc-e2e.mjs'], {
    cwd: '/app',
    env: {
      ...process.env,
      MIDNIGHT_V2_E2E_RESULT_FILE: resultFile,
      MIDNIGHT_V2_E2E_WALLET_SEED_FILE: seedFile,
      MIDNIGHT_V2_RUN_ID: runId,
    },
    encoding: 'utf8',
    timeout: 20 * 60 * 1_000,
  });
  const combinedOutput = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  assertNoSensitiveOutput(combinedOutput, seed);
  if (child.error) throw new Error(`Write canary failed to start: ${child.error.message}`);
  if (child.signal) throw new Error(`Write canary terminated by ${child.signal}`);
  if (child.status !== 0) {
    process.stderr.write(combinedOutput);
    throw new Error(`Write canary contract path exited ${child.status}`);
  }
  process.stdout.write(combinedOutput);
  const result = JSON.parse(readFileSync(resultFile, 'utf8'));
  console.log(JSON.stringify({
    checkpoint: 'C18-write-canary',
    mode,
    runId,
    startBlockHeight: result.startBlockHeight,
    callBlockHeight: result.call.blockHeight,
    digest: result.expectedDigest,
    contracts: 2,
    localEvents: 1,
    indexedEvents: 1,
    status: 'pass',
  }));
}

function skip(reason) {
  console.log(JSON.stringify({
    checkpoint: 'C18-write-canary',
    reason,
    providerInitialized: false,
    deploymentInitialized: false,
    status: 'skipped',
  }));
  process.exit(0);
}

function requiredRunId(value) {
  if (!value || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(value)) {
    throw new Error('MIDNIGHT_V2_RUN_ID must be 1-63 URL-safe alphanumeric/hyphen characters');
  }
  return value.toLowerCase();
}

function assertNoSensitiveOutput(output, seed) {
  const forbidden = [seed, 'privateStatePassword', 'witness', 'proofData', 'proof_data'];
  const match = forbidden.find((value) => output.toLowerCase().includes(value.toLowerCase()));
  if (match) throw new Error('Write canary output contained forbidden secret or proof material');
}
