import BinWrapper from '@xhmikosr/bin-wrapper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import process from 'node:process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const version = '0.23.3';
const base = `https://github.com/ordinals/ord/releases/download/${version}`;
const dest = path.join(__dirname, 'vendor');

const bin = new BinWrapper()
  .src(`${base}/ord-${version}-x86_64-unknown-linux-gnu.tar.gz`, 'linux', 'x64')
  .src(`${base}/ord-${version}-aarch64-apple-darwin.tar.gz`, 'darwin', 'arm64')
  .src(`${base}/ord-${version}-x86_64-apple-darwin.tar.gz`, 'darwin', 'x64')
  .dest(dest)
  .use('ord');

export default bin;

export async function run(options = {}) {
  const {
    dataDir,
    bitcoinDataDir,
    chain = 'regtest',
    rpcUrl = 'http://dev:devpassword@127.0.0.1:18443',
    server = false,
    serverPort = 8080,
    verbose = false,
    args = [],
  } = options;

  await bin.run(['--version']);

  const dataDirPath = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'ord-'));

  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  // Parse RPC URL to extract components
  const rpcUrlObj = new URL(rpcUrl);
  const rpcUser = rpcUrlObj.username;
  const rpcPass = rpcUrlObj.password;
  const rpcHost = rpcUrlObj.hostname;
  // Always include port explicitly - use from URL or default
  const rpcPort = rpcUrlObj.port || (rpcUrlObj.protocol === 'https:' ? '443' : '80');
  // Construct URL ensuring port is always included - ord expects full URL with protocol
  const rpcUrlWithoutAuth = `${rpcUrlObj.protocol}//${rpcHost}:${rpcPort}`;

  // Build ord command arguments
  // Ord can use --bitcoin-rpc-url with --bitcoin-rpc-username and --bitcoin-rpc-password
  // This avoids needing the cookie file
  // Note: --bitcoin-rpc-url should be the full URL including protocol and port
  // Use --chain parameter (defaults to regtest)
  const ordArgs = [
    '--chain', chain,
    '--bitcoin-rpc-url', rpcUrlWithoutAuth,
    '--bitcoin-rpc-username', rpcUser,
    '--bitcoin-rpc-password', rpcPass,
    '--data-dir', dataDirPath,
  ];

  if (server) {
    ordArgs.push('server', '--http-port', String(serverPort));
  }

  // Add any additional args
  ordArgs.push(...args);

  const child = spawn(bin.path(), ordArgs, {
    stdio: verbose ? 'inherit' : 'pipe',
  });

  if (verbose && child.stdout) {
    child.stdout.on('data', (data) => {
      console.log(`ord stdout: ${data}`);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (data) => {
      console.error(`ord stderr: ${data}`);
    });
  }

  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`ord exited with code ${code}`);
    }
  });

  return {
    child,
    dataDir: dataDirPath,
    stop: () => child.kill(),
  };
}

export async function runCommand(command, options = {}) {
  const {
    rpcUrl = 'http://dev:devpassword@127.0.0.1:18443',
    dataDir,
    bitcoinDataDir,
    chain = 'regtest',
    verbose = false,
    serverUrl,
  } = options;

  await bin.run(['--version']);

  // Use provided dataDir or create a temporary one
  // Note: If dataDir is not provided, each command will use its own temp dir
  const dataDirPath = dataDir;

  if (dataDirPath && !fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath, { recursive: true });
  }

  // Parse RPC URL to extract components
  const rpcUrlObj = new URL(rpcUrl);
  const rpcUser = rpcUrlObj.username;
  const rpcPass = rpcUrlObj.password;
  const rpcHost = rpcUrlObj.hostname;
  // Always include port explicitly - use from URL or default
  const rpcPort = rpcUrlObj.port || (rpcUrlObj.protocol === 'https:' ? '443' : '80');
  // Construct URL ensuring port is always included
  const rpcUrlWithoutAuth = `${rpcUrlObj.protocol}//${rpcHost}:${rpcPort}`;

  // Build ord command arguments
  // Ord can use --bitcoin-rpc-url with --bitcoin-rpc-username and --bitcoin-rpc-password
  // This avoids needing the cookie file
  // Use --chain parameter (defaults to regtest)
  // Note: --http-port is only valid for 'ord server' command, not for CLI commands
  const ordArgs = [
    '--chain', chain,
    '--bitcoin-rpc-url', rpcUrlWithoutAuth,
    '--bitcoin-rpc-username', rpcUser,
    '--bitcoin-rpc-password', rpcPass,
    ...(dataDirPath ? ['--data-dir', dataDirPath] : []),
    ...(bitcoinDataDir ? ['--bitcoin-data-dir', bitcoinDataDir] : []),
  ];

  // If serverUrl is provided and command is a wallet command, add --server-url flag
  // Wallet commands need the ord server URL to query block count and other info
  // Note: --server-url must come AFTER 'wallet', not before it
  if (serverUrl && command.length > 0 && command[0] === 'wallet') {
    // Add 'wallet' first, then --server-url, then the rest of the command
    ordArgs.push('wallet', '--server-url', serverUrl, ...command.slice(1));
  } else {
    // Add the actual command as-is
    ordArgs.push(...command);
  }

  // Set environment variables for ord CLI commands
  // Note: ord also supports ORD_SERVER_URL environment variable, but --server-url flag is preferred
  const env = { ...process.env };

  return new Promise((resolve, reject) => {
    const child = execFile(bin.path(), ordArgs, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });

    if (verbose) {
      child.stdout.on('data', (data) => {
        console.log(`ord stdout: ${data}`);
      });
      child.stderr.on('data', (data) => {
        console.error(`ord stderr: ${data}`);
      });
    }
  });
}

