import BinWrapper from '@xhmikosr/bin-wrapper';
import { verifyBinaryChecksum } from '@effectstream/binary-checksum';
import { CHECKSUMS } from './checksums.js';
import { buildValidatorArgs, resolveLimitLedgerSize } from './args.js';
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
    // `--bind-address`, loopback by default. In the pinned Agave 3.0.14 it only
    // covers the validator's own ports (gossip, TPU and the rest).
    //
    // CAVEAT: it does NOT keep the JSON-RPC or the faucet on loopback. Measured
    // on 3.0.14 (linux-x64), both listen on 0.0.0.0 whatever this says
    // (`ss -ltn`: 0.0.0.0:<rpcPort>, 0.0.0.0:<faucetPort>), and the RPC answers
    // on the machine's other addresses. 3.0.14 has no flag to bind them
    // elsewhere; the faucet has only the --faucet-per-request-sol-cap /
    // --faucet-per-time-sol-cap rate limits. The test validator has no
    // authentication: its state and SOL are worthless localnet ones, but anyone
    // who can reach this machine can use the RPC and the faucet, so don't run
    // this on an untrusted network.
    //
    // 0.0.0.0 itself makes 3.0.14 panic at start (`UnspecifiedIpAddr(0.0.0.0)`
    // in gossip). In a container, pass the container's own IP (`hostname -i`)
    // when gossip must be reachable from outside.
    bindAddress = process.env.SOLANA_BIND_ADDRESS ?? '127.0.0.1',
    // Programs to preload into the genesis ledger, as
    // `[{ address, soPath }, …]` -> `--bpf-program <address> <soPath>`. Callers
    // used to spawn the binary themselves to pass this, which duplicated all the
    // ledger/reset handling below AND skipped the checksum verification above.
    bpfPrograms = [],
    // Data shreds the validator keeps in rooted slots: `--limit-ledger-size
    // <n>`. Falls back to SOLANA_LIMIT_LEDGER_SIZE; unset = no flag, so the
    // validator keeps its own default (10,000 shreds in 3.0.14). With that
    // default an idle validator first purges 2,700-3,200 slots after the start
    // (~20-25 min) and from then on keeps only a few dozen slots, so a sync
    // that trails the tip by its confirmation depth, or re-syncs from an older
    // slot, finds the slots it needs already deleted. An idle validator writes
    // ~100 data shreds (~0.25 MB of ledger) per slot, so the limit keeps about
    // limit/100 slots; see the README's "Ledger size" for the disk cost.
    limitLedgerSize: limitLedgerSizeOption,
  } = options;

  // Refuse a bad limit before downloading or starting anything.
  const limitLedgerSize = resolveLimitLedgerSize(limitLedgerSizeOption, process.env);

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

  // Programs to preload are checked here (both fields set, the .so exists).
  const args = buildValidatorArgs({
    ledgerDir,
    rpcPort,
    faucetPort,
    bindAddress,
    bpfPrograms,
    reset,
    limitLedgerSize,
  });
  if (verbose && limitLedgerSize !== undefined) {
    console.log(`[solana-node] --limit-ledger-size ${limitLedgerSize}`);
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
    // The --limit-ledger-size value passed, or undefined (validator default).
    limitLedgerSize,
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
