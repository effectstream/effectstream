// A contract's serialised state (hex, as the indexer serves it, or bytes) → the onchain-runtime
// ContractState, through this package's compact-runtime 0.20 (the runtime the Passport account and
// the bridge are compiled for). Used by tests over recorded states; the node reads live states
// through midnight-js's public data provider.
import { ContractState } from "@midnight-ntwrk/compact-runtime-0.20";

export function deserializeContractState(state: string | Uint8Array): ContractState {
  return ContractState.deserialize(typeof state === "string" ? Buffer.from(state.replace(/^0x/, ""), "hex") : state);
}
