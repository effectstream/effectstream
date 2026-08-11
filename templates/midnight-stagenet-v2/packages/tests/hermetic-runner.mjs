import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

const resultFile = '/tmp/c16-contract-result.json';
const databaseDir = '/tmp/c16-application-db';
const cursorFile = '/tmp/c16-contract-event-cursor.json';

rmSync(resultFile, { force: true });
rmSync(databaseDir, { force: true, recursive: true });
rmSync(cursorFile, { force: true });

run('contract-call', 'node', ['packages/tests/ccc-e2e.mjs'], {
  MIDNIGHT_V2_E2E_RESULT_FILE: resultFile,
});
run('application-initial', 'bun', ['/effectstream/packages/node-sdk/sync/test/hermetic-application-pass.ts', 'initial'], {
  MIDNIGHT_V2_E2E_RESULT_FILE: resultFile,
  MIDNIGHT_V2_APPLICATION_DB: databaseDir,
  MIDNIGHT_V2_CURSOR_FILE: cursorFile,
});
run('application-replay', 'bun', ['/effectstream/packages/node-sdk/sync/test/hermetic-application-pass.ts', 'replay'], {
  MIDNIGHT_V2_E2E_RESULT_FILE: resultFile,
  MIDNIGHT_V2_APPLICATION_DB: databaseDir,
  MIDNIGHT_V2_CURSOR_FILE: cursorFile,
});

console.log(JSON.stringify({
  checkpoint: 'C16',
  phases: ['contract-call', 'application-initial', 'application-replay'],
  processIsolation: 'Midnight-v2 Node process followed by two Bun application processes',
  publishedPorts: 0,
  status: 'pass',
}));

function run(phase, command, args, extraEnvironment) {
  const child = spawnSync(command, args, {
    cwd: '/app',
    env: { ...process.env, ...extraEnvironment },
    stdio: 'inherit',
    timeout: 20 * 60 * 1_000,
  });
  if (child.error) throw new Error(`${phase} failed to start: ${child.error.message}`);
  if (child.signal) throw new Error(`${phase} terminated by ${child.signal}`);
  if (child.status !== 0) throw new Error(`${phase} exited ${child.status}`);
}
