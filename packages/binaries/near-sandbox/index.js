import BinWrapper from '@xhmikosr/bin-wrapper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nearcoreVersion = '2.10.7';
const s3Base = 'https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore';
const dest = path.join(__dirname, 'vendor');

const bin = new BinWrapper()
  .src(`${s3Base}/Linux-x86_64/${nearcoreVersion}/near-sandbox.tar.gz`, 'linux', 'x64')
  .src(`${s3Base}/Linux-aarch64/${nearcoreVersion}/near-sandbox.tar.gz`, 'linux', 'arm64')
  .src(`${s3Base}/Darwin-arm64/${nearcoreVersion}/near-sandbox.tar.gz`, 'darwin', 'arm64')
  .dest(dest)
  .use('near-sandbox');

export default bin;

export async function run(options = {}) {
  const { dataDir, verbose = false, rpcPort = 3030 } = options;

  await bin.run(['--version']);

  const dataDirPath = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'near-sandbox-'));

  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  // Initialize sandbox if not already initialized
  const genesisPath = path.join(dataDirPath, 'genesis.json');
  if (!fs.existsSync(genesisPath)) {
    const initChild = execFile(bin.path(), [
      '--home', dataDirPath,
      'init',
      '--fast',
    ]);
    await new Promise((resolve, reject) => {
      initChild.on('close', (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error(`neard init exited with code ${code}`));
      });
    });
  }

  // Start sandbox node
  const args = [
    '--home', dataDirPath,
    'run',
  ];
  const child = execFile(bin.path(), args, {
    env: {
      ...process.env,
      NEAR_SANDBOX_RPC_PORT: String(rpcPort),
    },
  });

  if (verbose) {
    child.stdout?.on('data', (data) => {
      console.log(`neard stdout: ${data}`);
    });
  }

  child.stderr?.on('data', (data) => {
    console.error(`neard stderr: ${data}`);
  });
  child.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`neard exited with code ${code}`);
    }
  });

  return {
    child,
    dataDir: dataDirPath,
    rpcPort,
    stop: () => child.kill(),
  };
}

if (import.meta.main) {
  const cliArgs = process.argv.slice(2);
  const verbose = cliArgs.includes('--verbose');

  (async () => {
    try {
      console.log('Starting NEAR sandbox...');
      await run({ verbose });
    } catch (error) {
      console.error('Failed to start NEAR sandbox:', error);
      process.exit(1);
    }
  })();
}
