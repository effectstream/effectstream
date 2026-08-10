import { existsSync, readFileSync } from 'node:fs';

const expectedRuntime = '1.3.14';
const packageJsonPath = '/app/package.json';
const lockfilePath = '/app/bun.lock';

if (Bun.version !== expectedRuntime) {
  throw new Error(`Expected Bun ${expectedRuntime}, received ${Bun.version}`);
}

if (!existsSync(packageJsonPath) || !existsSync(lockfilePath)) {
  throw new Error('The scaffold image is missing its package manifest or lockfile');
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
  name?: string;
  private?: boolean;
};

if (
  packageJson.name !== '@effectstream/template-midnight-stagenet-v2' ||
  packageJson.private !== true
) {
  throw new Error('The scaffold package manifest does not match the expected template');
}

for (const forbiddenPath of [
  '/app/.context-excluded.sentinel',
  '/app/PLAN-midnight-stagenet-v2.md',
  '/app/packages/chains',
]) {
  if (existsSync(forbiddenPath)) {
    throw new Error(`Forbidden build-context path present: ${forbiddenPath}`);
  }
}

console.log(
  JSON.stringify({
    checkpoint: 'C01',
    runtime: `bun-${Bun.version}`,
    networkRequired: false,
    status: 'pass',
  }),
);
