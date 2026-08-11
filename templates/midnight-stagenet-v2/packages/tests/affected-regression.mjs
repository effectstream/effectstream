import { spawnSync } from 'node:child_process';

const phases = [
  {
    name: 'v2-provider-boundary',
    command: 'node',
    args: ['/app/packages/tests/run-v2-provider-tests.mjs'],
    cwd: '/app',
  },
  {
    name: 'ledger-v9-runtime-v4-wasm',
    command: 'node',
    args: ['/app/packages/tests/run-v2-wasm-smoke.mjs'],
    cwd: '/app',
  },
  {
    name: 'shared-midnight-event-regression',
    command: 'bun',
    args: [
      'test',
      'packages/node-sdk/sync/test/midnight-contract-event-primitive.test.ts',
      'packages/node-sdk/sync/test/midnight-event-decoder.test.ts',
      'packages/node-sdk/sync/test/zswap-decoder.test.ts',
      'packages/node-sdk/sync/test/mint-decoder.test.ts',
      'packages/node-sdk/sm/primitives/src/midnight-token-mint/midnight-token-mint.test.ts',
    ],
    cwd: '/effectstream',
  },
  {
    name: 'template-state-machine-regression',
    command: 'bun',
    args: ['test', './packages/tests/state-machine.test.ts'],
    cwd: '/app',
  },
  {
    name: 'ci-registration-regression',
    command: 'bun',
    args: ['test', './templates/midnight-stagenet-v2/packages/tests/ci-registration.test.ts'],
    cwd: '/effectstream',
  },
];

for (const phase of phases) {
  const child = spawnSync(phase.command, phase.args, {
    cwd: phase.cwd,
    env: process.env,
    encoding: 'utf8',
    timeout: 10 * 60 * 1_000,
  });
  process.stdout.write(child.stdout ?? '');
  process.stderr.write(child.stderr ?? '');
  if (child.error) throw new Error(`${phase.name} failed to start: ${child.error.message}`);
  if (child.signal) throw new Error(`${phase.name} terminated by ${child.signal}`);
  if (child.status !== 0) throw new Error(`${phase.name} exited ${child.status}`);
}

console.log(JSON.stringify({
  checkpoint: 'C20-affected-regression',
  processIsolation: phases.map(({ name }) => name),
  network: 'none',
  status: 'pass',
}));
