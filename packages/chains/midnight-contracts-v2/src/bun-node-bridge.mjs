import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (typeof Bun === 'undefined') throw new Error('The v2 provider bridge must be launched by Bun');

const worker = fileURLToPath(new URL('./provider-worker.mjs', import.meta.url));
const child = spawn('node', [worker], { stdio: ['inherit', 'inherit', 'inherit'] });
child.once('error', (error) => {
  process.stderr.write(`Node provider worker failed: ${error.message}\n`);
  process.exitCode = 1;
});
child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
