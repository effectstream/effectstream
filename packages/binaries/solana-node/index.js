import BinWrapper from '@xhmikosr/bin-wrapper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const version = '1.18.26';
const base = `https://github.com/solana-labs/solana/releases/download/v${version}`;
const dest = path.join(__dirname, 'vendor');

const bin = new BinWrapper()
  .src(`${base}/solana-release-x86_64-unknown-linux-gnu.tar.bz2`, 'linux', 'x64')
  .src(`${base}/solana-release-aarch64-unknown-linux-gnu.tar.bz2`, 'linux', 'arm64')
  .src(`${base}/solana-release-x86_64-apple-darwin.tar.bz2`, 'darwin', 'x64')
  .src(`${base}/solana-release-aarch64-apple-darwin.tar.bz2`, 'darwin', 'arm64')
  .dest(dest)
  .use('bin/solana-test-validator');

export default bin;

const DEFAULT_CONFIG = `
rpc_port=8899
rpc_bind_address=0.0.0.0
`;

export async function run(options = {}) {
  const {
    config,
    dataDir,
    verbose = false,
    reset = true,
    rpcPort = 8899,
    faucetPort = 9900,
  } = options;

  await bin.run(['--version']);

  const dataDirPath = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'solana-test-validator-'));

  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  const ledgerDir = path.join(dataDirPath, 'ledger');
  if (!fs.existsSync(ledgerDir)) {
    fs.mkdirSync(ledgerDir, { recursive: true });
  }

  const args = [
    '--ledger', ledgerDir,
    '--rpc-port', String(rpcPort),
    '--faucet-port', String(faucetPort),
    '--bind-address', '0.0.0.0',
  ];

  if (reset) {
    args.push('--reset');
  }

  const child = spawn(bin.path(), args);

  if (verbose) {
    child.stdout.on('data', (data) => {
      console.log(`solana-test-validator stdout: ${data}`);
    });
  }

  child.stderr.on('data', (data) => {
    console.error(`solana-test-validator stderr: ${data}`);
  });
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`solana-test-validator exited with code ${code}`);
    }
  });

  return {
    child,
    dataDir: dataDirPath,
    ledgerDir,
    rpcPort,
    faucetPort,
    stop: () => child.kill(),
  };
}

if (import.meta.main) {
  const cliArgs = process.argv.slice(2);
  const verbose = cliArgs.includes("--verbose");

  (async () => {
    try {
      console.log("Starting Solana test validator...");
      await run({ verbose });
    } catch (error) {
      console.error("Failed to start Solana test validator:", error);
      process.exit(1);
    }
  })();
}
