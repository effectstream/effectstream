import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * Shared integrity check for the `packages/binaries/*` wrappers.
 *
 * These packages download a prebuilt binary at install or first run and then
 * execute it. `@xhmikosr/bin-wrapper` has no integrity support and discards the
 * archive after extracting, so the only thing left to verify is the extracted
 * file we are about to run. That is what this checks.
 *
 * Kept dependency-free and plain ESM on purpose: every wrapper runs under bare
 * `node index.js`, with no build step and no transpiler.
 */

/**
 * Compare a binary against a set of pinned SHA-256 digests, and fail closed if
 * it is not one of them.
 *
 * Digests are matched as a **set**, not looked up by the running platform. Asset
 * selection in bin-wrapper goes through os-filter-obj and the `arch` package,
 * whose reported architecture has not always agreed with `os.arch()` (arch@2.x
 * had no notion of arm64 at all, so every Mac silently ran the x86_64 build
 * under Rosetta). Set membership is immune to that whole class of mismatch,
 * including deliberate emulation, while still proving the file is one of the
 * builds that were pinned. Which platform it turned out to be is returned for
 * logging rather than enforced.
 *
 * @param {object} options
 * @param {string} options.binaryPath Path to the extracted binary.
 * @param {Record<string, string>} options.checksums Platform key to hex SHA-256.
 * @param {string} options.packageName Used to prefix errors and warnings.
 * @param {string} options.skipEnvVar Env var that bypasses the check when '1'.
 * @param {string} [options.version] Included in the error, for context.
 * @returns {string | undefined} The matched platform key, or undefined if
 *   verification was skipped.
 */
export function verifyBinaryChecksum({
  binaryPath,
  checksums,
  packageName,
  skipEnvVar,
  version,
}) {
  if (process.env[skipEnvVar] === '1') {
    console.warn(
      `[${packageName}] checksum verification skipped (${skipEnvVar}=1)`,
    );
    return undefined;
  }

  const entries = Object.entries(checksums);
  if (entries.length === 0) {
    // A caller that passes an empty table has almost certainly forgotten to
    // regenerate it after a version bump. Silently accepting anything would
    // turn a fail-closed guard into a no-op, which is the failure this whole
    // module exists to prevent.
    throw new Error(
      `[${packageName}] no checksums are pinned, refusing to run ${binaryPath}. ` +
        `Regenerate them with \`bun scripts/generate-binary-checksums.ts\`, or set ` +
        `${skipEnvVar}=1 to bypass deliberately.`,
    );
  }

  // Read rather than stream: these are tens of megabytes, already on local disk,
  // and the wrapper is about to exec the whole thing anyway.
  const actual = crypto
    .createHash('sha256')
    .update(fs.readFileSync(binaryPath))
    .digest('hex');

  const match = entries.find(([, digest]) => digest === actual);
  if (!match) {
    throw new Error(
      `[${packageName}] checksum mismatch for ${binaryPath}\n` +
        `  got      ${actual}\n` +
        `  expected one of:\n` +
        entries
          .map(([platform, digest]) => `    ${digest}  (${platform})`)
          .join('\n') +
        `\nThis is not a pinned${version ? ` v${version}` : ''} build. Refusing to run it.` +
        `\nSet ${skipEnvVar}=1 if you are intentionally running a local build.`,
    );
  }
  return match[0];
}
