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
 * NOTE: this is deliberately a SET, not a platform->digest map, because
 * bin-wrapper cannot currently select an arm64 asset at all. It filters via
 * os-filter-obj@2 -> arch@^2, and arch@2.x has no notion of arm64 — the string
 * does not appear in its source. It returns only 'x64' or 'x86': `darwin` is
 * hardcoded to 'x64' (it predates Apple Silicon), and linux goes through
 * `getconf LONG_BIT`, which reports word size rather than ISA, so arm64 Linux
 * also answers 'x64'.
 *
 * Consequence: on Apple Silicon (and arm64 Linux) the `.src(..., 'arm64')`
 * entry below is unreachable and the x86_64 build is downloaded instead,
 * running under Rosetta. Keying this map on `os.arch()` would therefore fail
 * verification on every one of those machines. Membership in the pinned set
 * still proves the binary is one of the three official builds, which is the
 * property that matters here.
 *
 * This affects every bin-wrapper@5 package in `packages/binaries/`
 * (bitcoin-core, celestia, ord, near-sandbox, solana-node); the grafana ones
 * use bin-wrapper@13 -> @xhmikosr/os-filter-obj@3 -> arch@3 and are fine.
 * near-sandbox is worse off than the rest: it declares only the native triple,
 * so nothing matches and its download throws outright on Apple Silicon — its
 * source already carries a partial workaround comment about this. The repo-wide
 * fix is forcing `arch@3` in the root `overrides`, which needs all five
 * packages re-tested and is deliberately not bundled into this PR.
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
    // The test validator has no authentication, so binding 0.0.0.0 exposed the
    // RPC to the whole network. Default to loopback; override for container
    // setups that genuinely need to reach it from outside.
    //
    // CAVEAT: this only covers the RPC and gossip/TPU. The FAUCET ignores
    // --bind-address and always listens on 0.0.0.0 — there is no flag to
    // change that in Agave 4.1.2 (only the --faucet-per-request-sol-cap /
    // --faucet-per-time-sol-cap rate limits). It hands out worthless localnet
    // SOL, but anyone on the LAN can still reach it, so don't run this on an
    // untrusted network.
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

  // Keep a rolling tail of output even when quiet. The validator reports most
  // startup failures on STDOUT, which used to be discarded unless `verbose` —
  // so a failure surfaced as a bare "exited with code 1" with nothing to
  // diagnose from, in CI least of all.
  const TAIL_LINES = 40;
  const tail = [];
  const record = (stream) => (data) => {
    const text = String(data);
    if (verbose) {
      const log = stream === 'stderr' ? console.error : console.log;
      log(`solana-test-validator ${stream}: ${text}`);
    }
    for (const line of text.split('\n')) {
      if (line.trim() === '') continue;
      tail.push(`  [${stream}] ${line}`);
      if (tail.length > TAIL_LINES) tail.shift();
    }
  };

  child.stdout.on('data', record('stdout'));
  child.stderr.on('data', record('stderr'));

  child.on('close', (code) => {
    if (code === 0) return;
    console.error(
      `solana-test-validator exited with code ${code}.` +
      (verbose
        ? ''
        : ` Last output:\n${tail.length > 0 ? tail.join('\n') : '  (no output captured)'}`),
    );
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
