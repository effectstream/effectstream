import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
}

export type ImpureCircuits<PS> = {
  mint_shielded(context: __compactRuntime.CircuitContext<PS>,
                domain_sep_0: Uint8Array,
                amount_0: bigint,
                nonce_0: bigint): __compactRuntime.CircuitResults<PS, { nonce: Uint8Array,
                                                                        color: Uint8Array,
                                                                        value: bigint
                                                                      }>;
  mint_unshielded(context: __compactRuntime.CircuitContext<PS>,
                  domainSep_0: Uint8Array,
                  amount_0: bigint,
                  recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, Uint8Array>;
  incrementNoun(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  mint_shielded(context: __compactRuntime.CircuitContext<PS>,
                domain_sep_0: Uint8Array,
                amount_0: bigint,
                nonce_0: bigint): __compactRuntime.CircuitResults<PS, { nonce: Uint8Array,
                                                                        color: Uint8Array,
                                                                        value: bigint
                                                                      }>;
  mint_unshielded(context: __compactRuntime.CircuitContext<PS>,
                  domainSep_0: Uint8Array,
                  amount_0: bigint,
                  recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, Uint8Array>;
  incrementNoun(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  mint_shielded(context: __compactRuntime.CircuitContext<PS>,
                domain_sep_0: Uint8Array,
                amount_0: bigint,
                nonce_0: bigint): __compactRuntime.CircuitResults<PS, { nonce: Uint8Array,
                                                                        color: Uint8Array,
                                                                        value: bigint
                                                                      }>;
  mint_unshielded(context: __compactRuntime.CircuitContext<PS>,
                  domainSep_0: Uint8Array,
                  amount_0: bigint,
                  recipient_0: { bytes: Uint8Array }): __compactRuntime.CircuitResults<PS, Uint8Array>;
  incrementNoun(context: __compactRuntime.CircuitContext<PS>): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly counter: bigint;
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
