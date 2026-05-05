import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  increment(context: __compactRuntime.CircuitContext<PS>,
            contract_address__0: Uint8Array,
            token_id__0: Uint8Array,
            property_name__0: Uint8Array,
            value__0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  increment(context: __compactRuntime.CircuitContext<PS>,
            contract_address__0: Uint8Array,
            token_id__0: Uint8Array,
            property_name__0: Uint8Array,
            value__0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  increment(context: __compactRuntime.CircuitContext<PS>,
            contract_address__0: Uint8Array,
            token_id__0: Uint8Array,
            property_name__0: Uint8Array,
            value__0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
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

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
