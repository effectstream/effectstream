import BinWrapper from '@xhmikosr/bin-wrapper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const appVersion = '6.4.10';
const nodeVersion = '0.28.4';
const base = 'https://github.com/effectstream/binaries/releases/download/0.3.120';
const dest = path.join(__dirname, 'vendor');

const appBin = new BinWrapper()
  .src(`${base}/celestia-appd-linux-amd64-v${appVersion}.tar.gz`, 'linux', 'x64')
  .src(`${base}/celestia-appd-macos-amd64-v${appVersion}.tar.gz`, 'darwin', 'x64')
  .src(`${base}/celestia-appd-macos-arm64-v${appVersion}.tar.gz`, 'darwin', 'arm64')
  .dest(dest)
  .use('celestia-appd');

const bridgeBin = new BinWrapper()
  .src(`${base}/celestia-node-linux-amd64-v${nodeVersion}.tar.gz`, 'linux', 'x64')
  .src(`${base}/celestia-node-macos-amd64-v${nodeVersion}.tar.gz`, 'darwin', 'x64')
  .src(`${base}/celestia-node-macos-arm64-v${nodeVersion}.tar.gz`, 'darwin', 'arm64')
  .dest(dest)
  .use('celestia');

export { appBin, bridgeBin };

const CHAIN_ID = 'test';
const KEY_NAME = 'validator';
const KEYRING_BACKEND = 'test';
const FEES = '500utia';

function execCmd(binPath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(binPath, args, { maxBuffer: 10 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${binPath} ${args.join(' ')} failed: ${stderr || error.message}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function patchFile(filePath, replacements) {
  let content = fs.readFileSync(filePath, 'utf-8');
  for (const [search, replace] of replacements) {
    if (search instanceof RegExp) {
      content = content.replace(search, replace);
    } else {
      content = content.replaceAll(search, replace);
    }
  }
  fs.writeFileSync(filePath, content);
}

async function initGenesis(appHome, verbose) {
  const appPath = appBin.path();
  const homeArgs = ['--home', appHome];
  const keyringArgs = [`--keyring-backend=${KEYRING_BACKEND}`];

  if (verbose) console.log('Initializing validator and node config files...');
  await execCmd(appPath, ['init', CHAIN_ID, '--chain-id', CHAIN_ID, ...homeArgs]);

  if (verbose) console.log('Adding a new key to the keyring...');
  await execCmd(appPath, ['keys', 'add', KEY_NAME, ...keyringArgs, ...homeArgs]);

  if (verbose) console.log('Getting validator address...');
  const validatorAddr = await execCmd(appPath, ['keys', 'show', KEY_NAME, '-a', ...keyringArgs, ...homeArgs]);

  if (verbose) console.log(`Adding genesis account for ${validatorAddr}...`);
  await execCmd(appPath, ['genesis', 'add-genesis-account', validatorAddr, '1000000000000000utia', ...homeArgs]);

  if (verbose) console.log('Creating a genesis tx...');
  await execCmd(appPath, [
    'genesis', 'gentx', KEY_NAME, '5000000000utia',
    '--fees', FEES,
    ...keyringArgs,
    '--chain-id', CHAIN_ID,
    ...homeArgs,
    '--commission-rate=0.05',
    '--commission-max-rate=1.0',
    '--commission-max-change-rate=1.0',
  ]);

  if (verbose) console.log('Collecting genesis txs...');
  await execCmd(appPath, ['genesis', 'collect-gentxs', ...homeArgs]);

  // Patch config.toml
  const configToml = path.join(appHome, 'config', 'config.toml');
  patchFile(configToml, [
    ['"tcp://127.0.0.1:26657"', '"tcp://0.0.0.0:26657"'],
    ['"null"', '"kv"'],
    ['discard_abci_responses = true', 'discard_abci_responses = false'],
    ['log_level = "info"', 'log_level = "*:error,p2p:info,state:info"'],
    [/^trace_type *=.*/m, 'trace_type = "local"'],
    [/^trace_pull_address *=.*/m, 'trace_pull_address = ":26661"'],
    [/^trace_push_batch_size *=.*/m, 'trace_push_batch_size = "1000"'],
  ]);

  // Patch genesis.json - override VotingPeriod from 1 week to 30 seconds
  const genesisJson = path.join(appHome, 'config', 'genesis.json');
  patchFile(genesisJson, [
    ['"604800s"', '"30s"'],
  ]);

  if (verbose) console.log('Genesis initialized.');
}

async function waitForGenesisBlock(rpcUrl = 'http://localhost:26657', timeout = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${rpcUrl}/block?height=1`);
      const data = await res.json();
      const hash = data?.result?.block_id?.hash;
      if (hash && hash !== 'null') return hash;
    } catch {
      // node not ready yet
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Timed out waiting for genesis block');
}

export async function run(options = {}) {
  const { dataDir, verbose = false, bridgeEnabled = true } = options;

  // Ensure both binaries are available
  await appBin.run(['version']);
  if (bridgeEnabled) {
    await bridgeBin.run(['version']);
  }

  const appHome = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'celestia-app-'));
  const genesisFile = path.join(appHome, 'config', 'genesis.json');

  // Initialize genesis if not already done
  if (!fs.existsSync(genesisFile)) {
    await initGenesis(appHome, verbose);
  }

  // Start celestia-appd
  if (verbose) console.log('Starting celestia-appd...');
  const appChild = spawn(appBin.path(), [
    'start',
    '--home', appHome,
    '--api.enable',
    '--grpc.enable',
    '--rpc.unsafe',
    '--grpc-web.enable',
    '--delayed-precommit-timeout', '1s',
  ], { stdio: verbose ? 'inherit' : 'pipe' });

  if (!verbose) {
    appChild.stderr.on('data', (data) => {
      console.error(`celestia-appd stderr: ${data}`);
    });
  }
  appChild.on('close', (code) => {
    if (code !== 0 && code !== null) {
      console.log(`celestia-appd exited with code ${code}`);
    }
  });

  let bridgeChild = null;
  let bridgeHome = null;

  if (bridgeEnabled) {
    // Wait for the consensus node to produce the genesis block
    if (verbose) console.log('Waiting for genesis block...');
    const genesisBlockHash = await waitForGenesisBlock();
    if (verbose) console.log(`Genesis block hash: ${genesisBlockHash}`);

    // Set up bridge node
    bridgeHome = path.join(os.tmpdir(), `.celestia-bridge-${CHAIN_ID}`);
    if (fs.existsSync(bridgeHome)) {
      fs.rmSync(bridgeHome, { recursive: true });
    }

    const celestiaCustom = `${CHAIN_ID}:${genesisBlockHash}`;
    const bridgeEnv = { ...process.env, CELESTIA_CUSTOM: celestiaCustom };

    if (verbose) console.log('Initializing bridge node...');
    await execCmd(bridgeBin.path(), ['bridge', 'init', '--core.ip', '127.0.0.1'], { env: bridgeEnv });

    // Disable pruning window for bridge nodes (required by celestia-node)
    const bridgeConfig = path.join(bridgeHome, 'config.toml');
    if (fs.existsSync(bridgeConfig)) {
      patchFile(bridgeConfig, [
        [/PruningWindow *=.*/m, 'PruningWindow = "0"'],
      ]);
    }

    // Wait a few seconds before starting bridge (matches original script)
    await new Promise(r => setTimeout(r, 6000));

    if (verbose) console.log('Starting celestia bridge node...');
    bridgeChild = spawn(bridgeBin.path(), [
      'bridge', 'start',
      '--core.ip', '127.0.0.1',
      '--rpc.skip-auth',
    ], { stdio: verbose ? 'inherit' : 'pipe', env: bridgeEnv });

    if (!verbose) {
      bridgeChild.stderr.on('data', (data) => {
        console.error(`celestia bridge stderr: ${data}`);
      });
    }
    bridgeChild.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.log(`celestia bridge exited with code ${code}`);
      }
    });
  }

  let bridgeAddress = null;
  if (bridgeChild) {
    // Wait for bridge RPC to be ready and get its address
    const start = Date.now();
    while (Date.now() - start < 30000) {
      try {
        bridgeAddress = await getBridgeAddress();
        if (bridgeAddress) break;
      } catch {
        // bridge RPC not ready yet
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const stop = () => {
    if (bridgeChild) bridgeChild.kill();
    appChild.kill();
  };

  return {
    appChild,
    bridgeChild,
    appHome,
    bridgeHome,
    bridgeAddress,
    stop,
  };
}

export async function fund(address, amount = '100000000utia', options = {}) {
  const { appHome, fees = '2000utia' } = options;
  const homeArgs = appHome ? ['--home', appHome] : [];

  const result = await execCmd(appBin.path(), [
    'tx', 'bank', 'send', KEY_NAME, address, amount,
    '--fees', fees,
    '--chain-id', CHAIN_ID,
    `--keyring-backend=${KEYRING_BACKEND}`,
    '--yes',
    ...homeArgs,
  ]);
  return result;
}

export async function getBridgeAddress(bridgeRpcUrl = 'http://localhost:26658') {
  const res = await fetch(bridgeRpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'state.AccountAddress', params: [] }),
  });
  const data = await res.json();
  return data.result || null;
}

if (import.meta.main) {
  const cliArgs = process.argv.slice(2);
  const command = cliArgs[0];
  const verbose = cliArgs.includes('--verbose');

  (async () => {
    try {
      switch (command) {
        case 'start-node': {
          console.log('Starting Celestia consensus node...');
          const { appHome } = await run({ verbose, bridgeEnabled: false });
          console.log(`Celestia node running. Data dir: ${appHome}`);
          break;
        }
        case 'start-bridge': {
          console.log('Starting Celestia devnet (node + bridge)...');
          const result = await run({ verbose, bridgeEnabled: true });
          console.log(`Celestia devnet running. Data dir: ${result.appHome}`);
          console.log(`Bridge home: ${result.bridgeHome}`);
          if (result.bridgeAddress) {
            console.log(`\nBridge wallet address: ${result.bridgeAddress}`);
            console.log(`\nTo fund the bridge node, run:`);
            console.log(`  celestia-appd tx bank send validator ${result.bridgeAddress} 100000000utia --fees 2000utia --chain-id test`);
          }
          break;
        }
        default: {
          console.log('Starting Celestia devnet (node + bridge)...');
          const res = await run({ verbose, bridgeEnabled: !cliArgs.includes('--no-bridge') });
          console.log(`Celestia devnet running. Data dir: ${res.appHome}`);
          if (res.bridgeAddress) {
            console.log(`Bridge wallet address: ${res.bridgeAddress}`);
          }
          break;
        }
      }
    } catch (error) {
      console.error('Failed to start Celestia:', error);
      process.exit(1);
    }
  })();
}
