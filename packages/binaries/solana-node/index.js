import BinWrapper from '@xhmikosr/bin-wrapper';
import { verifyBinaryChecksum } from '@effectstream/binary-checksum';
import {
  artifactDirectory,
  assertDownloadAllowed,
} from '@effectstream/binary-runtime';
import { CHECKSUMS } from './checksums.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Agave is the maintained continuation of solana-labs/solana; the old org
// publishes nothing past 1.18.x, which is EOL.
//
// ⚠️ DO NOT BUMP PAST 3.0.x WITHOUT READING THIS.
// Agave >= 3.1 hard-asserts io_uring support on Linux and panics during init
// where it is unavailable:
//
//   [INFO agave_io_uring] io_uring NOT supported: Function not implemented (os error 38)
//   thread 'main' panicked at fs/src/dirs.rs:27:9:
//   assertion failed: io_uring_supported()
//     3: solana_accounts_db::utils::create_accounts_run_and_snapshot_dirs
//     4: solana_test_validator::TestValidator::start
//
// The entire e2e suite runs inside Docker (.github/Dockerfile), and Docker's
// DEFAULT SECCOMP PROFILE blocks the io_uring syscalls, so 3.1+ cannot start in
// CI as configured. macOS builds are unaffected (io_uring is Linux-only, so the
// assert isn't compiled in) — which is exactly why 4.x passes every local check
// and dies in CI.
//
// Verified: 4.1.2 ✗  4.0.3 ✗  3.1.14 ✗  3.0.14 ✓  2.3.13 ✓
//
// This pin is a CI-configuration constraint, NOT an upstream dead end. On a
// kernel that supports io_uring, the block is purely seccomp:
//   default profile      -> io_uring_setup errno=1  (EPERM)
//   seccomp=unconfined   -> io_uring_setup OK
// So 3.1+/4.x becomes viable by relaxing seccomp for the e2e container —
// preferably a minimal custom profile allowing only io_uring_setup/enter/
// register, rather than blanket `unconfined`. Docker dropped io_uring from its
// default allowlist over a run of kernel LPE bugs, so that is a deliberate
// trade-off to make explicitly, not a rubber stamp. See PR #815 discussion.
// (Docker-on-Apple-Silicon is a separate matter: emulated amd64 has no io_uring
// at all, and no seccomp setting helps there.)
const version = '3.0.14';
const base = `https://github.com/anza-xyz/agave/releases/download/v${version}`;
const dest = artifactDirectory({
  id: 'solana-node',
  version,
  legacyDirectory: path.join(__dirname, 'vendor'),
});

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

export const binaryVersion = version;
export const binaryPath = () => bin.path();
export const toolPath = (name) => path.join(dest, 'bin', name);

export async function downloadOnly() {
  if (!fs.existsSync(bin.path())) {
    assertDownloadAllowed('solana-node');
    await bin.download();
  }
  verifyChecksum(bin.path());
  return bin.path();
}

export async function verify() {
  if (!fs.existsSync(bin.path())) {
    assertDownloadAllowed('solana-node');
    await bin.download();
  }
  verifyChecksum(bin.path());
  return bin.path();
}

/**
 * Fail closed if the downloaded validator isn't one of the builds we pinned.
 * Digests live in ./checksums.js. Set SOLANA_NODE_SKIP_CHECKSUM=1 to bypass when
 * intentionally testing a locally-built validator.
 *
 * The set-membership rationale (rather than a lookup by `os.arch()`) now lives
 * with the shared helper in @effectstream/binary-checksum, since it applies to
 * every wrapper and not just this one.
 */
function verifyChecksum(binaryPath) {
  return verifyBinaryChecksum({
    binaryPath,
    checksums: CHECKSUMS,
    packageName: 'solana-node',
    skipEnvVar: 'SOLANA_NODE_SKIP_CHECKSUM',
    version,
  });
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
    // Programs to preload into the genesis ledger, as
    // `[{ address, soPath }, …]` -> `--bpf-program <address> <soPath>`. Callers
    // used to spawn the binary themselves to pass this, which duplicated all the
    // ledger/reset handling below AND skipped the checksum verification above.
    bpfPrograms = [],
  } = options;

  // Download (if needed) and verify BEFORE executing anything. `bin.run()`
  // would execute the binary to check its version first, which defeats the
  // point of verifying it.
  if (!fs.existsSync(bin.path())) {
    assertDownloadAllowed('solana-node');
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

  for (const { address, soPath } of bpfPrograms) {
    if (!address || !soPath) {
      throw new Error(
        `[solana-node] bpfPrograms entries need both 'address' and 'soPath'; got ${JSON.stringify({ address, soPath })}`,
      );
    }
    if (!fs.existsSync(soPath)) {
      throw new Error(
        `[solana-node] program binary not found at ${soPath} (for ${address}). Build it before starting the validator.`,
      );
    }
    args.push('--bpf-program', address, soPath);
  }

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
      if (cliArgs.includes('--path')) {
        console.log(bin.path());
        return;
      }
      if (cliArgs.includes('--download-only')) {
        console.log(await downloadOnly());
        return;
      }
      if (cliArgs.includes('--verify')) {
        console.log(await verify());
        return;
      }
      console.log("Starting Solana test validator...");
      await run({ verbose });
    } catch (error) {
      console.error("Failed to start Solana test validator:", error);
      process.exit(1);
    }
  })();
}
