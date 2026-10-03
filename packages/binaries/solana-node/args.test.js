// Unit tests for the validator argument list. Nothing here downloads or spawns
// the validator: the helpers are pure, and the run() cases fail before the
// download step.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { LIMIT_LEDGER_SIZE_ENV, buildValidatorArgs, resolveLimitLedgerSize } from './args.js';
import { run } from './index.js';

const LEDGER = '/tmp/solana-node-test/ledger';
const PROGRAM = { address: 'Prog1111111111111111111111111111111111111111', soPath: '/tmp/program.so' };
const exists = () => true;

// The exact list run() passed before `limitLedgerSize` existed.
const HISTORICAL = [
  '--ledger', LEDGER,
  '--rpc-port', '8899',
  '--faucet-port', '9900',
  '--bind-address', '127.0.0.1',
  '--bpf-program', PROGRAM.address, PROGRAM.soPath,
  '--reset',
];

function argsFor(limitOption, env) {
  return buildValidatorArgs(
    {
      ledgerDir: LEDGER,
      rpcPort: 8899,
      faucetPort: 9900,
      bindAddress: '127.0.0.1',
      bpfPrograms: [PROGRAM],
      reset: true,
      limitLedgerSize: resolveLimitLedgerSize(limitOption, env),
    },
    { exists },
  );
}

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

describe('limitLedgerSize unset', () => {
  test('the argument list is unchanged', () => {
    expect(argsFor(undefined, {})).toEqual(HISTORICAL);
    expect(argsFor(null, {})).toEqual(HISTORICAL);
  });

  test('a blank SOLANA_LIMIT_LEDGER_SIZE counts as unset', () => {
    expect(argsFor(undefined, { [LIMIT_LEDGER_SIZE_ENV]: '' })).toEqual(HISTORICAL);
    expect(argsFor(undefined, { [LIMIT_LEDGER_SIZE_ENV]: '   ' })).toEqual(HISTORICAL);
  });

  test('other run() options keep their historical shape', () => {
    const args = buildValidatorArgs(
      { ledgerDir: LEDGER, rpcPort: '18899', faucetPort: 19900, bindAddress: '10.0.0.5', reset: false },
      { exists },
    );
    expect(args).toEqual([
      '--ledger', LEDGER,
      '--rpc-port', '18899',
      '--faucet-port', '19900',
      '--bind-address', '10.0.0.5',
    ]);
  });
});

describe('limitLedgerSize set', () => {
  test('the option adds --limit-ledger-size N and changes nothing else', () => {
    const args = argsFor(50_000_000, {});
    expect(flagValue(args, '--limit-ledger-size')).toBe('50000000');
    expect(args.filter((a) => a === '--limit-ledger-size')).toHaveLength(1);
    const i = args.indexOf('--limit-ledger-size');
    const rest = [...args.slice(0, i), ...args.slice(i + 2)];
    expect(rest).toEqual(HISTORICAL);
  });

  test('SOLANA_LIMIT_LEDGER_SIZE adds the flag when the option is not given', () => {
    expect(flagValue(argsFor(undefined, { [LIMIT_LEDGER_SIZE_ENV]: '1000' }), '--limit-ledger-size')).toBe('1000');
    expect(flagValue(argsFor(undefined, { [LIMIT_LEDGER_SIZE_ENV]: ' 2000\n' }), '--limit-ledger-size')).toBe('2000');
  });

  test('the option wins over the env var', () => {
    const args = argsFor(50_000_000, { [LIMIT_LEDGER_SIZE_ENV]: '1000' });
    expect(flagValue(args, '--limit-ledger-size')).toBe('50000000');
  });

  test('the resolved value is a number', () => {
    expect(resolveLimitLedgerSize(1, {})).toBe(1);
    expect(resolveLimitLedgerSize(undefined, { [LIMIT_LEDGER_SIZE_ENV]: '1' })).toBe(1);
    expect(resolveLimitLedgerSize(undefined, { [LIMIT_LEDGER_SIZE_ENV]: String(Number.MAX_SAFE_INTEGER) })).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(resolveLimitLedgerSize(undefined, {})).toBeUndefined();
  });
});

describe('bad values are refused', () => {
  test('option: not a positive safe integer', () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '1000', 10n, true, {}]) {
      expect(() => resolveLimitLedgerSize(bad, {})).toThrow(/limitLedgerSize must be a positive integer/);
    }
  });

  test('env: not a plain positive integer', () => {
    for (const bad of ['0', '-5', '1.5', '1e6', '0x10', 'abc', '10 000', '+7', '9007199254740992']) {
      expect(() => resolveLimitLedgerSize(undefined, { [LIMIT_LEDGER_SIZE_ENV]: bad })).toThrow(
        /SOLANA_LIMIT_LEDGER_SIZE must be a positive integer/,
      );
    }
  });

  test('a bad option is refused even when the env var is valid', () => {
    expect(() => resolveLimitLedgerSize(0, { [LIMIT_LEDGER_SIZE_ENV]: '1000' })).toThrow(/limitLedgerSize/);
  });
});

describe('run() refuses a bad limit before downloading or spawning', () => {
  let saved;
  beforeEach(() => {
    saved = process.env[LIMIT_LEDGER_SIZE_ENV];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[LIMIT_LEDGER_SIZE_ENV];
    else process.env[LIMIT_LEDGER_SIZE_ENV] = saved;
  });

  test('a bad option', async () => {
    delete process.env[LIMIT_LEDGER_SIZE_ENV];
    await expect(run({ limitLedgerSize: -1 })).rejects.toThrow(/limitLedgerSize must be a positive integer/);
  });

  test('a bad SOLANA_LIMIT_LEDGER_SIZE (run() reads process.env)', async () => {
    process.env[LIMIT_LEDGER_SIZE_ENV] = 'lots';
    await expect(run({})).rejects.toThrow(/SOLANA_LIMIT_LEDGER_SIZE must be a positive integer/);
  });
});

describe('bpfPrograms checks are unchanged', () => {
  test('an entry without a path is refused', () => {
    expect(() =>
      buildValidatorArgs(
        { ledgerDir: LEDGER, rpcPort: 1, faucetPort: 2, bindAddress: '127.0.0.1', bpfPrograms: [{ address: 'x' }] },
        { exists },
      ),
    ).toThrow(/need both 'address' and 'soPath'/);
  });

  test('a missing .so is refused', () => {
    expect(() =>
      buildValidatorArgs(
        { ledgerDir: LEDGER, rpcPort: 1, faucetPort: 2, bindAddress: '127.0.0.1', bpfPrograms: [PROGRAM] },
        { exists: () => false },
      ),
    ).toThrow(/program binary not found at \/tmp\/program\.so/);
  });
});
