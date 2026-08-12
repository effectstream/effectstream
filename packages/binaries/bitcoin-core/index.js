import BinWrapper from '@xhmikosr/bin-wrapper';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { verifyBinaryChecksum } from '@effectstream/binary-checksum';
import {
  artifactDirectory,
  assertDownloadAllowed,
} from '@effectstream/binary-runtime';
import { CHECKSUMS } from './checksums.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const version = '28.1';
// bitcoin.org stopped serving /bin/ (every release asset 404s there now); the
// binaries live on bitcoincore.org, which is the canonical host upstream links.
// The artifacts are byte-identical, so CHECKSUMS below is unchanged.
const base = `https://bitcoincore.org/bin/bitcoin-core-${version}`;
const dest = artifactDirectory({
  id: 'bitcoin-core',
  version,
  legacyDirectory: path.join(__dirname, 'vendor'),
});

const bin = new BinWrapper()
  .src(`${base}/bitcoin-${version}-x86_64-linux-gnu.tar.gz`, 'linux', 'x64')
  .src(`${base}/bitcoin-${version}-aarch64-linux-gnu.tar.gz`, 'linux', 'arm64')
  .src(`${base}/bitcoin-${version}-arm64-apple-darwin.tar.gz`, 'darwin', 'arm64')
  .src(`${base}/bitcoin-${version}-x86_64-apple-darwin.tar.gz`, 'darwin', 'x64')
  .dest(dest)
  .use('bin/bitcoind');

export default bin;

export const binaryVersion = version;
export const binaryPath = () => bin.path();

export async function downloadOnly() {
  if (!fs.existsSync(bin.path())) {
    assertDownloadAllowed('bitcoin-core');
    await bin.download();
  }
  verifyDownload(true);
  return bin.path();
}

export async function verify() {
  if (!fs.existsSync(bin.path())) {
    assertDownloadAllowed('bitcoin-core');
    await bin.download();
  }
  verifyDownload(false);
  return bin.path();
}

const DEFAULT_CONFIG = `
server=1
regtest=1
fallbackfee=0.00001
txindex=1

[regtest]
rpcallowip=0.0.0.0/0
rpcbind=0.0.0.0
rpcuser=dev
rpcpassword=devpassword
rpcport=18443
port=18334
fallbackfee=0.00001
`;

/**
 * Apple Silicon refuses to exec an arm64 Mach-O that carries no code signature
 * at all — the process is SIGKILLed before `main`, with no diagnostic beyond
 * exit 137. Upstream ships `bitcoin-*-arm64-apple-darwin.tar.gz` unsigned
 * (`codesign -dv` → "code object is not signed at all"), so an ad-hoc signature
 * has to be applied locally before first use. Every other binary in
 * packages/binaries/ already ships signed; this is bitcoin-core only.
 *
 * Not a security downgrade: an ad-hoc signature asserts nothing about origin,
 * it just satisfies the kernel's exec requirement. The x86_64 build is equally
 * unsigned and runs only because Rosetta is exempt from the rule.
 */
function adhocSignIfNeeded(binaryPath) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') return;
  try {
    const check = spawnSync('codesign', ['-dv', binaryPath], { encoding: 'utf8' });
    // "not signed at all" appears on stderr; anything already signed is left alone.
    if (!/not signed at all/.test(check.stderr ?? '')) return;
    const res = spawnSync('codesign', ['-s', '-', '-f', binaryPath], { encoding: 'utf8' });
    if (res.status !== 0) {
      console.warn(
        `[bitcoin-core] ad-hoc signing failed (${res.stderr?.trim()}); ` +
        `bitcoind will likely be killed on launch.`,
      );
    }
  } catch (error) {
    console.warn(`[bitcoin-core] could not ad-hoc sign bitcoind: ${error.message}`);
  }
}

/**
 * Verify the download, fail closed if it is not a pinned v28.1 build.
 *
 * ORDER MATTERS, and it is not obvious. `adhocSignIfNeeded` rewrites the Mach-O
 * in place on Apple Silicon, which changes its SHA-256. So the digest can only
 * be checked against the pinned table while the file is still pristine, i.e.
 * straight out of the archive and before signing.
 *
 * The consequence is that on darwin-arm64 verification is a download-time check
 * only: once signed, the file no longer matches any pinned digest and re-running
 * it would fail closed against a binary that is actually fine. Every other
 * platform leaves the file untouched, so it is re-verified on every run.
 * Do not move this below `adhocSignIfNeeded`.
 */
function verifyDownload(freshlyDownloaded) {
  const isAppleSilicon = process.platform === 'darwin' && process.arch === 'arm64';
  if (!freshlyDownloaded && isAppleSilicon) return;
  const flavour = verifyBinaryChecksum({
    binaryPath: bin.path(),
    checksums: CHECKSUMS,
    packageName: 'bitcoin-core',
    skipEnvVar: 'BITCOIN_CORE_SKIP_CHECKSUM',
    version,
  });
  return flavour;
}

export async function run(options = {}) {
  const { config, dataDir, verbose = false } = options;

  // Download first, verify second, sign third, THEN let bin.run() exec it —
  // `bin.run()` alone would try to execute the unsigned binary and be killed.
  const needsDownload = !fs.existsSync(bin.path());
  if (needsDownload) {
    assertDownloadAllowed('bitcoin-core');
    await bin.download();
  }
  const flavour = verifyDownload(needsDownload);
  if (verbose && flavour) {
    console.log(`[bitcoin-core] verified bitcoind v${version} (${flavour})`);
  }
  adhocSignIfNeeded(bin.path());

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
  // Bitcoin Core casts RLIMIT_NOFILE to int — RLIM_INFINITY overflows to negative,
  // causing "Not enough file descriptors available". Set a finite limit via shell.
  const child = spawn('/bin/sh', ['-c', 'ulimit -n 10240; exec "$@"', '_', bin.path(), ...args]);

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
      console.log("Starting Bitcoin Core regtest...");
      await run({ verbose });
    } catch (error) {
      console.error("Failed to start Bitcoin Core:", error);
      process.exit(1);
    }
  })();
}
