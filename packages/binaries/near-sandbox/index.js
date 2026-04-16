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

// BinWrapper uses the `arch` npm package for architecture detection, which
// misreports arm64 as x64 under Bun. Map platform/arch using process.arch
// directly to get the correct download URL.
const archMap = {
  'linux-x64': 'Linux-x86_64',
  'linux-arm64': 'Linux-aarch64',
  'darwin-x64': 'Darwin-x86_64',
  'darwin-arm64': 'Darwin-arm64',
};

const platformKey = `${process.platform}-${process.arch}`;
const archDir = archMap[platformKey];
if (!archDir) {
  throw new Error(`Unsupported platform: ${platformKey}`);
}

const bin = new BinWrapper()
  // Provide the correct URL for this platform first so BinWrapper picks it up
  .src(`${s3Base}/${archDir}/${nearcoreVersion}/near-sandbox.tar.gz`, process.platform, process.arch)
  .dest(dest)
  .use('near-sandbox');

export default bin;

export async function run(options = {}) {
  const { dataDir, verbose = false, rpcPort = 3030 } = options;

  // Ensure binary is downloaded. BinWrapper.run() triggers the download.
  // If arch detection is broken, the download() call inside may fail with
  // "No binary found" because os-filter-obj uses the same broken `arch` package.
  // Work around this by downloading manually when the binary is missing.
  const binPath = bin.path();
  if (!fs.existsSync(binPath)) {
    const url = `${s3Base}/${archDir}/${nearcoreVersion}/near-sandbox.tar.gz`;
    fs.mkdirSync(dest, { recursive: true });
    const tarPath = path.join(dest, 'near-sandbox.tar.gz');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download NEAR sandbox: ${res.status}`);
    fs.writeFileSync(tarPath, new Uint8Array(await res.arrayBuffer()));
    const { execFileSync } = await import('node:child_process');
    // Archive contains <archDir>/near-sandbox — strip the leading directory
    execFileSync('tar', ['xzf', tarPath, '-C', dest, '--strip-components=1']);
    fs.unlinkSync(tarPath);
    fs.chmodSync(binPath, 0o755);
  }

  // Verify the binary works
  const { execFileSync } = await import('node:child_process');
  execFileSync(binPath, ['--version']);

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
