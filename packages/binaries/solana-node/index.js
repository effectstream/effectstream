import BinWrapper from '@xhmikosr/bin-wrapper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Agave is the maintained continuation of solana-labs/solana; the old org
// publishes nothing past 1.18.x, which is EOL.
const version = '4.1.2';
const base = `https://github.com/anza-xyz/agave/releases/download/v${version}`;
const dest = path.join(__dirname, 'vendor');

// NOTE: upstream ships NO aarch64-unknown-linux-gnu build — only the three
// targets below (plus Windows, which this repo doesn't support). Adding a
// linux/arm64 entry produces a 404 at download time, not a clean error.
const bin = new BinWrapper()
  .src(`${base}/solana-release-x86_64-unknown-linux-gnu.tar.bz2`, 'linux', 'x64')
  .src(`${base}/solana-release-x86_64-apple-darwin.tar.bz2`, 'darwin', 'x64')
  .src(`${base}/solana-release-aarch64-apple-darwin.tar.bz2`, 'darwin', 'arm64')
  .dest(dest)
  .use('bin/solana-test-validator');

export default bin;

/**
 * SHA-256 of the extracted `solana-test-validator` in each published v4.1.2
 * asset. bin-wrapper has no integrity support and discards the archive after
 * extracting, so this verifies the binary we are about to execute rather than
 * the tarball. Regenerate on every `version` bump with:
 *
 *   shasum -a 256 packages/binaries/solana-node/vendor/bin/solana-test-validator
 *
 * NOTE: this is deliberately a SET, not a platform->digest map. bin-wrapper
 * picks the asset via os-filter-obj, which depends on `arch@^2`, and arch@2.x
 * hardcodes `if (process.platform === 'darwin') return 'x64'` — it predates
 * Apple Silicon. So every Mac, including arm64, downloads the x86_64 build and
 * runs it under Rosetta. Keying on `os.arch()` would therefore fail
 * verification on every Apple Silicon machine. Membership in the pinned set
 * still proves the binary is one of the three official builds, which is the
 * property that matters. (The arch bug affects every bin-wrapper package in
 * `packages/binaries/`, not just this one — fixing it repo-wide means forcing
 * `arch@3` and re-testing all of them.)
 */
const CHECKSUMS = {
  'linux-x64': '493db974bc1a1eb62c413561dd9739455e5afd9abd7367fe7aff9389c0865ce2',
  'darwin-x64': 'f8a5780576f5d0674492b668fa9781e8d908bf9570f738c2b634b693b114fecd',
  'darwin-arm64': 'aa0fd7ccc9300a29e5bea0a4bc65b9de5a103b111bc09c654983494040e8eaf8',
};

/**
 * Fail closed if the downloaded validator isn't one of the builds we pinned.
 * Set SOLANA_NODE_SKIP_CHECKSUM=1 to bypass when intentionally testing a
 * locally-built validator.
 */
function verifyChecksum(binaryPath) {
  if (process.env.SOLANA_NODE_SKIP_CHECKSUM === '1') {
    console.warn('[solana-node] checksum verification skipped (SOLANA_NODE_SKIP_CHECKSUM=1)');
    return;
  }
  const actual = crypto
    .createHash('sha256')
    .update(fs.readFileSync(binaryPath))
    .digest('hex');

  const match = Object.entries(CHECKSUMS).find(([, digest]) => digest === actual);
  if (!match) {
    throw new Error(
      `[solana-node] checksum mismatch for ${binaryPath}\n` +
      `  got      ${actual}\n` +
      `  expected one of:\n` +
      Object.entries(CHECKSUMS)
        .map(([platform, digest]) => `    ${digest}  (${platform})`)
        .join('\n') +
      `\nThis is not a pinned v${version} build. Refusing to run it.`,
    );
  }
  return match[0];
}

export async function run(options = {}) {
  const {
    config,
    dataDir,
    verbose = false,
    reset = true,
    rpcPort = 8899,
    faucetPort = 9900,
    // The test validator has no authentication and its faucet hands out SOL to
    // anyone who asks, so binding 0.0.0.0 exposes both to the whole network.
    // Default to loopback; override for container setups that genuinely need
    // to reach it from outside.
    bindAddress = process.env.SOLANA_BIND_ADDRESS ?? '127.0.0.1',
  } = options;

  // Download (if needed) and verify BEFORE executing anything. `bin.run()`
  // would execute the binary to check its version first, which defeats the
  // point of verifying it.
  if (!fs.existsSync(bin.path())) {
    await bin.download();
  }
  const flavour = verifyChecksum(bin.path());
  if (verbose) {
    console.log(`[solana-node] verified solana-test-validator v${version} (${flavour})`);
  }

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
    '--bind-address', bindAddress,
  ];

  if (reset) {
    args.push('--reset');
  }

  // COPYFILE_DISABLE prevents macOS from materializing AppleDouble (`._`)
  // companion files when the validator archives/unarchives genesis, which
  // otherwise aborts ledger creation with
  // "Archive error: extra entry found: ._genesis.bin". No-op on Linux.
  const child = spawn(bin.path(), args, {
    env: { ...process.env, COPYFILE_DISABLE: "1" },
  });

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
