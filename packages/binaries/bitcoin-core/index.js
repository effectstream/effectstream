import BinWrapper from '@xhmikosr/bin-wrapper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const version = '28.1';
const base = `https://bitcoin.org/bin/bitcoin-core-${version}`;
const dest = path.join(__dirname, 'vendor');

const bin = new BinWrapper()
  .src(`${base}/bitcoin-${version}-x86_64-linux-gnu.tar.gz`, 'linux', 'x64')
  .src(`${base}/bitcoin-${version}-aarch64-linux-gnu.tar.gz`, 'linux', 'arm64')
  .src(`${base}/bitcoin-${version}-arm64-apple-darwin.tar.gz`, 'darwin', 'arm64')
  .src(`${base}/bitcoin-${version}-x86_64-apple-darwin.tar.gz`, 'darwin', 'x64')
  .dest(dest)
  .use('bin/bitcoind');

export default bin;

const DEFAULT_CONFIG = `
server=1
regtest=1
fallbackfee=0.00001

[regtest]
rpcuser=dev
rpcpassword=devpassword
rpcport=18443
port=18334
fallbackfee=0.00001
`;

export async function run(options = {}) {
  const { config, dataDir, verbose = false } = options;

  await bin.run(['--version']);

  const dataDirPath = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'bitcoin-core-'));

  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  const configPath = config || path.join(dataDirPath, 'bitcoin.conf');

  if (!config) {
    fs.writeFileSync(configPath, DEFAULT_CONFIG.trim());
  }

  const args = [`-datadir=${dataDirPath}`, `-conf=${configPath}`];
  const child = execFile(bin.path(), args);

  if (verbose) {
    child.stdout.on('data', (data) => {
      console.log(`bitcoind stdout: ${data}`);
    });
  }

  child.stderr.on('data', (data) => {
    console.error(`bitcoind stderr: ${data}`);
  });
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`bitcoind exited with code ${code}`);
    }
  });

  return {
    child,
    dataDir: dataDirPath,
    configPath,
    stop: () => child.kill(),
  };
}
