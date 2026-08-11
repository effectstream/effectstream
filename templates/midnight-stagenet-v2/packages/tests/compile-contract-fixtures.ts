import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtures = '/fixtures';
const output = '/work/compiled-fixtures';
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const results: Record<string, { kind: 'compiler' | 'policy'; diagnostic: string }> = {};

compileSuccess('KeccakPureVectors');
compileSuccess('KeccakHostedProbe', ['--feature-zkir-v3']);
compileFailure('KeccakHostedProbe', 'KeccakHostedProbeNoV3', [], 'keccak256 is not supported in ZKIR v2');
compileSuccess('FieldCastGood', ['--skip-zk']);
compileFailure(
  'FieldCastBad',
  'FieldCastBad',
  ['--skip-zk'],
  'mismatch between actual return type Uint<0..1> and declared return type Field',
);
compileFailure(
  'ConstructorCCC',
  'ConstructorCCC',
  ['--skip-zk'],
  'constructor cannot call external contracts but calls circuit ping from external contract Target',
);
compileFailure(
  'ConstructorEvent',
  'ConstructorEvent',
  ['--skip-zk'],
  'constructor cannot emit an event but emits event Unpaused',
);
compileFailure(
  'UndisclosedCccArgument',
  'UndisclosedCccArgument',
  ['--skip-zk'],
  'potential witness-value disclosure must be declared but is not',
);
compileFailure('UndeclaredEvent', 'UndeclaredEvent', ['--skip-zk'], 'unbound identifier NotDeclared');
compileFailure('RecursiveInterface', 'RecursiveInterface', ['--skip-zk'], 'cycle involving type Recursive');

compileSuccess('WitnessCallee', ['--skip-zk']);
const witnessInfo = contractInfo('WitnessCallee');
policyFailure(
  'WitnessCallee',
  'called contracts must be witness-free: calls to witnesses in non-root contracts are not supported',
  () => {
    if (witnessInfo.witnesses?.length > 0) {
      throw new Error('called contracts must be witness-free: calls to witnesses in non-root contracts are not supported');
    }
  },
);

compileSuccess('PurityMismatchCallee', ['--skip-zk']);
compileSuccess('PurityMismatchGateway', ['--skip-zk']);
const calleeCircuit = contractInfo('PurityMismatchCallee').circuits?.[0];
const declaredCircuit = contractInfo('PurityMismatchGateway').contracts?.[0]?.circuits?.[0];
if (calleeCircuit?.pure !== false || declaredCircuit?.pure !== true) {
  throw new Error('Purity mismatch fixtures do not encode impure implementation vs pure interface');
}
policyFailure('PurityMismatch', 'contract interface purity does not match the callee implementation', () => {
  if (calleeCircuit.pure !== declaredCircuit.pure) {
    throw new Error('contract interface purity does not match the callee implementation');
  }
});

writeFileSync(join(output, 'compile-results.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify({ checkpoint: 'C06-build', results, status: 'pass' }));

function compileSuccess(name: string, flags: string[] = []): void {
  const result = compile(name, name, flags);
  if (result.exitCode !== 0 || result.stderr.includes('ZKIR not found')) {
    throw new Error(`${name} unexpectedly failed: ${result.stderr}`);
  }
}

function compileFailure(source: string, target: string, flags: string[], diagnostic: string): void {
  const result = compile(source, target, flags);
  if (result.exitCode === 0) throw new Error(`${source} unexpectedly compiled`);
  if (!result.stderr.includes(diagnostic)) {
    throw new Error(`${source} failed with an unrelated diagnostic; expected ${diagnostic}; got: ${result.stderr}`);
  }
  results[source] = { kind: 'compiler', diagnostic };
}

function policyFailure(name: string, diagnostic: string, enforce: () => void): void {
  let rejected = false;
  try {
    enforce();
  } catch (error) {
    if (!String(error).includes(diagnostic)) {
      throw new Error(`${name} failed with an unrelated policy diagnostic: ${String(error)}`);
    }
    rejected = true;
  }
  if (!rejected) throw new Error(`${name} unexpectedly passed its callee policy`);
  results[name] = { kind: 'policy', diagnostic };
}

function compile(source: string, target: string, flags: string[]) {
  const result = Bun.spawnSync(
    ['compactc', ...flags, join(fixtures, `${source}.compact`), join(output, target)],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  };
}

function contractInfo(name: string): any {
  const path = join(output, name, 'compiler/contract-info.json');
  const bytes = readFileSync(path);
  const manifest = JSON.parse(readFileSync(join(output, name, 'compiler/contract-manifest.json'), 'utf8'));
  const expected = manifest.compiler?.['contract-info.json']?.hash;
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (expected !== actual) throw new Error(`${name} contract-info is not authenticated by its compiler manifest`);
  return JSON.parse(bytes.toString('utf8'));
}
