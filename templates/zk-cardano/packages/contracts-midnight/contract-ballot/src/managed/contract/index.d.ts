import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  private$secret_key(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  create_proposal(context: __compactRuntime.CircuitContext<PS>, text_0: string): __compactRuntime.CircuitResults<PS, bigint>;
  cast_vote(context: __compactRuntime.CircuitContext<PS>,
            proposal_id_0: bigint,
            proposal_id_bytes_0: Uint8Array,
            vote_yes_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  close_proposal(context: __compactRuntime.CircuitContext<PS>,
                 proposal_id_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  create_proposal(context: __compactRuntime.CircuitContext<PS>, text_0: string): __compactRuntime.CircuitResults<PS, bigint>;
  cast_vote(context: __compactRuntime.CircuitContext<PS>,
            proposal_id_0: bigint,
            proposal_id_bytes_0: Uint8Array,
            vote_yes_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  close_proposal(context: __compactRuntime.CircuitContext<PS>,
                 proposal_id_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  create_proposal(context: __compactRuntime.CircuitContext<PS>, text_0: string): __compactRuntime.CircuitResults<PS, bigint>;
  cast_vote(context: __compactRuntime.CircuitContext<PS>,
            proposal_id_0: bigint,
            proposal_id_bytes_0: Uint8Array,
            vote_yes_0: boolean): __compactRuntime.CircuitResults<PS, []>;
  close_proposal(context: __compactRuntime.CircuitContext<PS>,
                 proposal_id_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly deployer: Uint8Array;
  readonly proposal_count: bigint;
  proposal_active: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): boolean;
    [Symbol.iterator](): Iterator<[bigint, boolean]>
  };
  proposal_text: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: bigint): boolean;
    lookup(key_0: bigint): string;
    [Symbol.iterator](): Iterator<[bigint, string]>
  };
  readonly tally_yes: bigint;
  readonly tally_no: bigint;
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
