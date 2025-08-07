import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<T> = {
}

export type ImpureCircuits<T> = {
  increment(context: __compactRuntime.CircuitContext<T>,
            contract_address__0: Uint8Array,
            token_id__0: Uint8Array,
            property_name__0: Uint8Array,
            value__0: Uint8Array): __compactRuntime.CircuitResults<T, []>;
}

export type PureCircuits = {
}

export type Circuits<T> = {
  increment(context: __compactRuntime.CircuitContext<T>,
            contract_address__0: Uint8Array,
            token_id__0: Uint8Array,
            property_name__0: Uint8Array,
            value__0: Uint8Array): __compactRuntime.CircuitResults<T, []>;
}

export type Ledger = {
  readonly round: bigint;
  readonly contract_address: Uint8Array;
  readonly token_id: Uint8Array;
  readonly property_name: Uint8Array;
  readonly value: Uint8Array;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<T, W extends Witnesses<T> = Witnesses<T>> {
  witnesses: W;
  circuits: Circuits<T>;
  impureCircuits: ImpureCircuits<T>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<T>): __compactRuntime.ConstructorResult<T>;
}

export declare function ledger(state: __compactRuntime.StateValue): Ledger;
export declare const pureCircuits: PureCircuits;
