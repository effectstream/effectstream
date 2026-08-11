import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

const runId = requiredRunId(process.env.MIDNIGHT_V2_RUN_ID);
const resultFile = `/tmp/${runId}-write-result.json`;
const databaseDir = `/tmp/${runId}-application-db`;
const cursorFile = `/tmp/${runId}-contract-event-cursor.json`;
rmSync(resultFile, { force: true });
rmSync(databaseDir, { force: true, recursive: true });
rmSync(cursorFile, { force: true });

const write = run('hosted-write', 'node', ['packages/tests/write-canary.mjs'], {
  MIDNIGHT_V2_WRITE_MODE: 'hosted',
});
if (write.stdout.includes('"status":"skipped"')) {
  process.exit(0);
}
const initial = run('effectstream-initial', 'bun', [
  '/effectstream/packages/node-sdk/sync/test/hermetic-application-pass.ts',
  'initial',
], {
  MIDNIGHT_V2_E2E_RESULT_FILE: resultFile,
  MIDNIGHT_V2_APPLICATION_DB: databaseDir,
  MIDNIGHT_V2_CURSOR_FILE: cursorFile,
});
const replay = run('effectstream-replay', 'bun', [
  '/effectstream/packages/node-sdk/sync/test/hermetic-application-pass.ts',
  'replay',
], {
  MIDNIGHT_V2_E2E_RESULT_FILE: resultFile,
  MIDNIGHT_V2_APPLICATION_DB: databaseDir,
  MIDNIGHT_V2_CURSOR_FILE: cursorFile,
});

const result = JSON.parse(readFileSync(resultFile, 'utf8'));
if (
  result.networkId !== 'stagenet' ||
  !initial.stdout.includes('"networkId":"stagenet"') ||
  !replay.stdout.includes('"networkId":"stagenet"') ||
  result.wallet?.unshieldedNightPositive !== true ||
  result.wallet?.registeredNightUtxos < 1 ||
  result.wallet?.dustPositive !== true ||
  result.call.blockHeight < result.startingFinalizedBlock.height
) {
  throw new Error('Hosted wallet readiness or finalized-block evidence is incomplete');
}
console.log(JSON.stringify({
  checkpoint: 'C19-hosted-integrated',
  runId,
  networkId: 'stagenet',
  startingFinalizedBlock: result.startingFinalizedBlock,
  deploymentBlockHeight: result.startBlockHeight,
  transaction: {
    hash: result.call.transactionHash,
    blockHash: result.call.blockHash,
    blockHeight: result.call.blockHeight,
  },
  contracts: {
    sink: result.sinkAddress,
    gateway: result.gatewayAddress,
  },
  digest: result.expectedDigest,
  effectstreamProcessedCount: 1,
  effectstreamReplayApplied: false,
  status: 'pass',
}));

function run(phase, command, args, extraEnvironment) {
  const child = spawnSync(command, args, {
    cwd: '/app',
    env: { ...process.env, ...extraEnvironment },
    encoding: 'utf8',
    timeout: 30 * 60 * 1_000,
  });
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`;
  if (child.error) throw new Error(`${phase} failed to start: ${child.error.message}`);
  if (child.signal) throw new Error(`${phase} terminated by ${child.signal}`);
  if (child.status !== 0) {
    process.stderr.write(output);
    throw new Error(`${phase} exited ${child.status}`);
  }
  if (/privateStatePassword|witness|proofData|proof_data/i.test(output)) {
    throw new Error(`${phase} output contained private-state/witness/proof internals`);
  }
  process.stdout.write(child.stderr ?? '');
  process.stdout.write(child.stdout ?? '');
  return child;
}

function requiredRunId(value) {
  if (!value || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(value)) {
    throw new Error('MIDNIGHT_V2_RUN_ID must be 1-63 URL-safe alphanumeric/hyphen characters');
  }
  return value.toLowerCase();
}
