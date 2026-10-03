// Pure helpers for `run()` in ./index.js: they build the solana-test-validator
// argument list and resolve the options that need validating. Nothing here
// downloads or spawns anything, so the unit tests (./args.test.js) can call them
// directly.
import fs from 'node:fs';

/** Env var read by `run()` when the `limitLedgerSize` option is not given. */
export const LIMIT_LEDGER_SIZE_ENV = 'SOLANA_LIMIT_LEDGER_SIZE';

const DIGITS = /^[0-9]+$/;

// Printable form of a refused value (JSON.stringify throws on a bigint and
// prints NaN/Infinity as null).
function show(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return `${value}n (a bigint)`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function limitError(source, value) {
  return new Error(
    `[solana-node] ${source} must be a positive integer (a shred count for --limit-ledger-size); got ${show(value)}`,
  );
}

/**
 * The `--limit-ledger-size` value `run()` passes, or `undefined` to pass no
 * flag (the validator then keeps its own default, 10,000 shreds in Agave 3.0.14).
 *
 * The `limitLedgerSize` option wins; otherwise `SOLANA_LIMIT_LEDGER_SIZE` is
 * read, and an empty or blank variable counts as unset. Anything that is not a
 * positive safe integer is refused, from either source.
 *
 * @param {unknown} option the `limitLedgerSize` option (`undefined`/`null` = not given)
 * @param {Record<string, string | undefined>} [env]
 * @returns {number | undefined}
 */
export function resolveLimitLedgerSize(option, env = process.env) {
  if (option !== undefined && option !== null) {
    if (typeof option !== 'number' || !Number.isSafeInteger(option) || option <= 0) {
      throw limitError('limitLedgerSize', option);
    }
    return option;
  }
  const raw = env[LIMIT_LEDGER_SIZE_ENV];
  if (raw === undefined || raw.trim() === '') return undefined;
  const text = raw.trim();
  const value = Number(text);
  if (!DIGITS.test(text) || !Number.isSafeInteger(value) || value <= 0) {
    throw limitError(LIMIT_LEDGER_SIZE_ENV, raw);
  }
  return value;
}

/**
 * The solana-test-validator argument list. With `limitLedgerSize` undefined it
 * is exactly the list `run()` has always passed.
 *
 * @param {{
 *   ledgerDir: string,
 *   rpcPort: number | string,
 *   faucetPort: number | string,
 *   bindAddress: string,
 *   bpfPrograms?: Array<{ address: string, soPath: string }>,
 *   reset?: boolean,
 *   limitLedgerSize?: number,
 * }} options
 * @param {{ exists?: (path: string) => boolean }} [io] injectable for tests
 * @returns {string[]}
 */
export function buildValidatorArgs(
  { ledgerDir, rpcPort, faucetPort, bindAddress, bpfPrograms = [], reset = true, limitLedgerSize },
  { exists = fs.existsSync } = {},
) {
  const args = [
    '--ledger', ledgerDir,
    '--rpc-port', String(rpcPort),
    '--faucet-port', String(faucetPort),
    '--bind-address', bindAddress,
  ];

  if (limitLedgerSize !== undefined) {
    args.push('--limit-ledger-size', String(limitLedgerSize));
  }

  for (const { address, soPath } of bpfPrograms) {
    if (!address || !soPath) {
      throw new Error(
        `[solana-node] bpfPrograms entries need both 'address' and 'soPath'; got ${JSON.stringify({ address, soPath })}`,
      );
    }
    if (!exists(soPath)) {
      throw new Error(
        `[solana-node] program binary not found at ${soPath} (for ${address}). Build it before starting the validator.`,
      );
    }
    args.push('--bpf-program', address, soPath);
  }

  if (reset) {
    args.push('--reset');
  }

  return args;
}
