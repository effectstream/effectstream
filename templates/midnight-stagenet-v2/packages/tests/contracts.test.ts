import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { keccak_256 } from '@noble/hashes/sha3.js';
import { ContractState } from '@midnight-ntwrk/midnight-js-protocol/ledger';

const compiled = '/app/compiled-fixtures';
const fixtures = '/fixtures';
const results = JSON.parse(readFileSync(join(compiled, 'compile-results.json'), 'utf8'));
const expectedDiagnostics = {
  KeccakHostedProbe: ['compiler', 'keccak256 is not supported in ZKIR v2'],
  FieldCastBad: ['compiler', 'mismatch between actual return type Uint<0..1> and declared return type Field'],
  ConstructorCCC: ['compiler', 'constructor cannot call external contracts'],
  ConstructorEvent: ['compiler', 'constructor cannot emit an event'],
  UndisclosedCccArgument: ['compiler', 'potential witness-value disclosure must be declared but is not'],
  UndeclaredEvent: ['compiler', 'unbound identifier NotDeclared'],
  RecursiveInterface: ['compiler', 'cycle involving type Recursive'],
  WitnessCallee: ['policy', 'called contracts must be witness-free'],
  PurityMismatch: ['policy', 'contract interface purity does not match the callee implementation'],
} as const;

for (const [name, [kind, diagnostic]] of Object.entries(expectedDiagnostics)) {
  if (results[name]?.kind !== kind || !results[name]?.diagnostic.includes(diagnostic)) {
    throw new Error(`${name} did not fail at its intended ${kind} boundary: ${JSON.stringify(results[name])}`);
  }
}

const pureModule = await import(join(compiled, 'KeccakPureVectors/contract/index.js'));
const hash32 = pureModule.pureCircuits?.hash32;
if (typeof hash32 !== 'function') throw new Error('KeccakPureVectors did not generate pureCircuits.hash32');

const vectors = [
  {
    label: '32 zero bytes',
    input: new Uint8Array(32),
    expectedHex: '290decd9548b62a8d60345a988386fc84ba6bc95484008f6362f93160ef3e563',
  },
  {
    label: '31-byte sequence plus trailing 0x00',
    input: Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 0 : index + 1)),
    expectedHex: 'e62d44eb3f37142e2c4acf891141fee41f69de96f40da77d75136c3dcd22883b',
  },
];
for (const { label, input, expectedHex } of vectors) {
  const expected = keccak_256(input);
  if (toHex(expected) !== expectedHex) {
    throw new Error(`${label} drifted from its pinned Keccak-256 vector`);
  }
  const actual = hash32(input);
  if (!(actual instanceof Uint8Array) || !equalBytes(actual, expected)) {
    throw new Error(`${label} does not match independent @noble/hashes Keccak-256`);
  }
  const sha3 = createHash('sha3-256').update(input).digest();
  if (equalBytes(actual, sha3)) throw new Error(`${label} accidentally uses SHA3-256 instead of Keccak-256`);
}

const probeBundle = join(compiled, 'KeccakHostedProbe');
const probeInfo = JSON.parse(readFileSync(join(probeBundle, 'compiler/contract-info.json'), 'utf8'));
if (
  probeInfo.circuits?.length !== 1 ||
  probeInfo.circuits[0]?.name !== 'hashAndStore' ||
  probeInfo.witnesses?.length !== 0 ||
  probeInfo.contracts?.length !== 0 ||
  probeInfo.ledger?.length !== 1 ||
  probeInfo.ledger[0]?.name !== 'lastDigest'
) {
  throw new Error('KeccakHostedProbe is not the isolated one-circuit/no-event/no-CCC hosted probe');
}
const probeSource = readFileSync(join(fixtures, 'KeccakHostedProbe.compact'), 'utf8');
if (
  !probeSource.includes('keccak256<Bytes<32>>') ||
  /\bemit\s*\(/.test(probeSource) ||
  /\bcontract\s+[A-Z]/.test(probeSource) ||
  /\bwitness\b/.test(probeSource)
) {
  throw new Error('KeccakHostedProbe source includes features outside the isolated hosted ZKIR-v3 probe');
}
const probeZkir = JSON.parse(readFileSync(join(probeBundle, 'zkir/hashAndStore.zkir'), 'utf8'));
const probeVerifier = readFileSync(join(probeBundle, 'keys/hashAndStore.verifier'))
  .subarray(0, 64)
  .toString('latin1');
if (
  probeZkir.version?.major !== 3 ||
  probeZkir.do_communications_commitment !== true ||
  !probeVerifier.startsWith('midnight:verifier-key[v7]')
) {
  throw new Error('KeccakHostedProbe did not compile as communications-enabled ZKIR-v3/v7');
}

const explicitField = readFileSync(join(fixtures, 'FieldCastGood.compact'), 'utf8');
const implicitField = readFileSync(join(fixtures, 'FieldCastBad.compact'), 'utf8');
if (!explicitField.includes('0 as Field') || implicitField.includes('as Field')) {
  throw new Error('Field migration fixtures do not isolate the explicit-cast requirement');
}

const currentState = new ContractState().serialize();
const currentHeader = 'midnight:contract-state[v8]:';
if (!new TextDecoder().decode(currentState.subarray(0, currentHeader.length)).startsWith(currentHeader)) {
  throw new Error('Ledger-v9 did not serialize ContractState with the v8 header');
}
ContractState.deserialize(currentState);
const ledger8Fixture = currentState.slice();
const versionOffset = currentHeader.indexOf('v8') + 1;
ledger8Fixture[versionOffset] = '6'.charCodeAt(0);
let rejectedLedger8 = false;
try {
  ContractState.deserialize(ledger8Fixture);
} catch (error) {
  rejectedLedger8 =
    String(error).includes("expected header tag 'midnight:contract-state[v8]:'") &&
    String(error).includes("got 'midnight:contract-state[v6]:'");
}
if (!rejectedLedger8) throw new Error('Ledger-v9 accepted or silently migrated a ContractState[v6] fixture');

console.log(
  JSON.stringify({
    checkpoint: 'C06',
    keccakVectors: vectors.map(({ label }) => label),
    independentImplementation: '@noble/hashes@2.2.0 keccak_256',
    compilerNegatives: Object.values(results).filter((result: any) => result.kind === 'compiler').length,
    policyNegatives: Object.values(results).filter((result: any) => result.kind === 'policy').length,
    hostedProbe: 'ZKIR-v3/verifier-key-v7',
    ledgerMigration: 'ContractState[v6] rejected; ContractState[v8] accepted',
    status: 'pass',
  }),
);

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
