import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<T> = {
}

export type ImpureCircuits<T> = {
  name(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, string>;
  symbol(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, string>;
  decimals(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, bigint>;
  totalSupply(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, bigint>;
  balanceOf(context: __compactRuntime.CircuitContext<T>,
            account_0: { is_left: boolean,
                         left: { bytes: Uint8Array },
                         right: { bytes: Uint8Array }
                       }): __compactRuntime.CircuitResults<T, bigint>;
  mint(context: __compactRuntime.CircuitContext<T>,
       account_0: { is_left: boolean,
                    left: { bytes: Uint8Array },
                    right: { bytes: Uint8Array }
                  },
       value_0: bigint): __compactRuntime.CircuitResults<T, []>;
  transfer(context: __compactRuntime.CircuitContext<T>,
           to_0: { is_left: boolean,
                   left: { bytes: Uint8Array },
                   right: { bytes: Uint8Array }
                 },
           value_0: bigint): __compactRuntime.CircuitResults<T, boolean>;
  approve(context: __compactRuntime.CircuitContext<T>,
          spender_0: { is_left: boolean,
                       left: { bytes: Uint8Array },
                       right: { bytes: Uint8Array }
                     },
          value_0: bigint): __compactRuntime.CircuitResults<T, boolean>;
  allowance(context: __compactRuntime.CircuitContext<T>,
            owner_0: { is_left: boolean,
                       left: { bytes: Uint8Array },
                       right: { bytes: Uint8Array }
                     },
            spender_0: { is_left: boolean,
                         left: { bytes: Uint8Array },
                         right: { bytes: Uint8Array }
                       }): __compactRuntime.CircuitResults<T, bigint>;
  burnFrom(context: __compactRuntime.CircuitContext<T>,
           account_0: { is_left: boolean,
                        left: { bytes: Uint8Array },
                        right: { bytes: Uint8Array }
                      },
           value_0: bigint): __compactRuntime.CircuitResults<T, []>;
  transferFrom(context: __compactRuntime.CircuitContext<T>,
               from_0: { is_left: boolean,
                         left: { bytes: Uint8Array },
                         right: { bytes: Uint8Array }
                       },
               to_0: { is_left: boolean,
                       left: { bytes: Uint8Array },
                       right: { bytes: Uint8Array }
                     },
               value_0: bigint): __compactRuntime.CircuitResults<T, boolean>;
  transferToEvm(context: __compactRuntime.CircuitContext<T>,
                target_address_0: string,
                amount_0: bigint,
                txHash_0: Uint8Array): __compactRuntime.CircuitResults<T, []>;
}

export type PureCircuits = {
}

export type Circuits<T> = {
  name(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, string>;
  symbol(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, string>;
  decimals(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, bigint>;
  totalSupply(context: __compactRuntime.CircuitContext<T>): __compactRuntime.CircuitResults<T, bigint>;
  balanceOf(context: __compactRuntime.CircuitContext<T>,
            account_0: { is_left: boolean,
                         left: { bytes: Uint8Array },
                         right: { bytes: Uint8Array }
                       }): __compactRuntime.CircuitResults<T, bigint>;
  mint(context: __compactRuntime.CircuitContext<T>,
       account_0: { is_left: boolean,
                    left: { bytes: Uint8Array },
                    right: { bytes: Uint8Array }
                  },
       value_0: bigint): __compactRuntime.CircuitResults<T, []>;
  transfer(context: __compactRuntime.CircuitContext<T>,
           to_0: { is_left: boolean,
                   left: { bytes: Uint8Array },
                   right: { bytes: Uint8Array }
                 },
           value_0: bigint): __compactRuntime.CircuitResults<T, boolean>;
  approve(context: __compactRuntime.CircuitContext<T>,
          spender_0: { is_left: boolean,
                       left: { bytes: Uint8Array },
                       right: { bytes: Uint8Array }
                     },
          value_0: bigint): __compactRuntime.CircuitResults<T, boolean>;
  allowance(context: __compactRuntime.CircuitContext<T>,
            owner_0: { is_left: boolean,
                       left: { bytes: Uint8Array },
                       right: { bytes: Uint8Array }
                     },
            spender_0: { is_left: boolean,
                         left: { bytes: Uint8Array },
                         right: { bytes: Uint8Array }
                       }): __compactRuntime.CircuitResults<T, bigint>;
  burnFrom(context: __compactRuntime.CircuitContext<T>,
           account_0: { is_left: boolean,
                        left: { bytes: Uint8Array },
                        right: { bytes: Uint8Array }
                      },
           value_0: bigint): __compactRuntime.CircuitResults<T, []>;
  transferFrom(context: __compactRuntime.CircuitContext<T>,
               from_0: { is_left: boolean,
                         left: { bytes: Uint8Array },
                         right: { bytes: Uint8Array }
                       },
               to_0: { is_left: boolean,
                       left: { bytes: Uint8Array },
                       right: { bytes: Uint8Array }
                     },
               value_0: bigint): __compactRuntime.CircuitResults<T, boolean>;
  transferToEvm(context: __compactRuntime.CircuitContext<T>,
                target_address_0: string,
                amount_0: bigint,
                txHash_0: Uint8Array): __compactRuntime.CircuitResults<T, []>;
}

export type Ledger = {
  txHashes: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly lastTransfer: { target_address: string, amount: bigint };
  readonly actionName: bigint;
  readonly actionTarget: { is_left: boolean,
                           left: { bytes: Uint8Array },
                           right: { bytes: Uint8Array }
                         };
  readonly actionTargetAddress: string;
  readonly actionValue: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<T, W extends Witnesses<T> = Witnesses<T>> {
  witnesses: W;
  circuits: Circuits<T>;
  impureCircuits: ImpureCircuits<T>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<T>,
               name_0: string,
               symbol_0: string,
               decimals_0: bigint,
               initialOwner_0: { is_left: boolean,
                                 left: { bytes: Uint8Array },
                                 right: { bytes: Uint8Array }
                               }): __compactRuntime.ConstructorResult<T>;
}

export declare function ledger(state: __compactRuntime.StateValue): Ledger;
export declare const pureCircuits: PureCircuits;
