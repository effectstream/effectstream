import { readFile } from 'node:fs/promises';

import { ContractState as LedgerContractState } from '@midnight-ntwrk/midnight-js-protocol/ledger';
import {
  ContractState as RuntimeContractState,
  StateValue,
  decodeContractAddress,
  dummyContractAddress,
  encodeContractAddress,
} from '@midnight-ntwrk/midnight-js-protocol/onchain-runtime';

import { assertNode22, claimRuntimeLane } from '../chains/midnight-contracts-v2/src/runtime-guard.mjs';

assertNode22();
claimRuntimeLane('ledger-v9/runtime-v4');
if (process.release.name !== 'node') throw new Error('WASM smoke must run under Node');

const lock = JSON.parse(await readFile('/app/compatibility-lock.json', 'utf8'));
if (lock.toolchain.ledgerV9 !== '1.0.0-rc.3' || lock.toolchain.onchainRuntimeV4 !== '4.0.0-rc.3') {
  throw new Error('WASM smoke compatibility lane drifted');
}

const ledgerState = new LedgerContractState();
const serialized = ledgerState.serialize();
const restored = LedgerContractState.deserialize(serialized);
const roundTrip = restored.serialize();
if (!equalBytes(serialized, roundTrip)) throw new Error('Ledger-v9 ContractState did not round-trip deterministically');
const header = new TextDecoder().decode(serialized.subarray(0, 32));
if (!header.startsWith('midnight:contract-state[v8]:')) throw new Error('Ledger-v9 state did not use ContractState[v8]');

const address = dummyContractAddress();
const encodedAddress = encodeContractAddress(address);
if (decodeContractAddress(encodedAddress) !== address) throw new Error('Runtime-v4 contract address did not encode/decode');

const stateValue = StateValue.newArray().arrayPush(StateValue.newNull());
const encodedStateValue = stateValue.encode();
const decodedStateValue = StateValue.decode(encodedStateValue);
if (decodedStateValue.type() !== 'array' || decodedStateValue.asArray()?.length !== 1) {
  throw new Error('Runtime-v4 StateValue did not perform a deterministic state round-trip');
}
const runtimeState = new RuntimeContractState();
const runtimeSerialized = runtimeState.serialize();
if (!equalBytes(runtimeSerialized, RuntimeContractState.deserialize(runtimeSerialized).serialize())) {
  throw new Error('Runtime-v4 ContractState did not round-trip deterministically');
}

console.log(JSON.stringify({
  checkpoint: 'C08-wasm',
  runtime: process.version,
  ledgerStateHeader: 'midnight:contract-state[v8]',
  ledgerBytes: serialized.length,
  onchainRuntime: 'address encode/decode + StateValue encode/decode + ContractState round-trip',
  imports: ['@midnight-ntwrk/midnight-js-protocol/ledger', '@midnight-ntwrk/midnight-js-protocol/onchain-runtime'],
  status: 'pass',
}));

function equalBytes(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}
