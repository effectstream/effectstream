import type {
  CircuitContext,
  ContractState,
} from '@midnight-ntwrk/compact-runtime';

/**
 * Interface defining a generic contract simulator.
 *
 * @template P - Type representing the private contract state.
 * @template L - Type representing the public ledger state.
 */
export interface IContractSimulator<P, L> {
  /**
   * The deployed contract's address.
   */
  readonly contractAddress: string;

  /**
   * The current circuit context holding the contract state.
   */
  circuitContext: CircuitContext<P>;

  /**
   * Returns the current public ledger state.
   *
   * @returns The current ledger state of type L.
   */
  getPublicState(): L;

  /**
   * Returns the current private contract state.
   *
   * @returns The current private state of type P.
   */
  getPrivateState(): P;

  /**
   * Returns the original contract state.
   *
   * @returns The current contract state.
   */
  getContractState(): ContractState;
}

/**
 * Extracts pure circuits from a contract type.
 *
 * Pure circuits are those in `circuits` but not in `impureCircuits`.
 *
 * @template TContract - Contract type with `circuits` and `impureCircuits`.
 */
export type ExtractPureCircuits<TContract> = TContract extends {
  circuits: infer TCircuits extends Record<PropertyKey, unknown>;
  impureCircuits: infer TImpureCircuits extends Record<PropertyKey, unknown>;
}
  ? Omit<TCircuits, keyof TImpureCircuits>
  : never;

/**
 * Extracts impure circuits from a contract type.
 *
 * Impure circuits are those in `impureCircuits`.
 *
 * @template TContract - Contract type with `circuits` and `impureCircuits`.
 */
export type ExtractImpureCircuits<TContract> = TContract extends {
  impureCircuits: infer TImpureCircuits;
}
  ? TImpureCircuits
  : never;

/**
 * Transforms a collection of circuit functions by removing the explicit `CircuitContext` parameter,
 * producing a version of each function that can be called without passing the context explicitly.
 *
 * Each original circuit function is expected to have the signature:
 * `(ctx: CircuitContext<TState>, ...args) => { result: R; context: CircuitContext<TState> }`
 * or a compatible shape.
 *
 * The transformed type maps each key `K` of the input `Circuits` type to a new function
 * that takes the same parameters as the original, *except* the first `CircuitContext<TState>` argument,
 * and returns the `result` part `R` directly.
 *
 * @template Circuits - An object type whose values are circuit functions accepting a `CircuitContext<TState>`
 * and returning an object with `result` and optionally `context`.
 * @template TState - The type representing the private or contract state passed inside `CircuitContext`.
 */
export type ContextlessCircuits<Circuits, TState> = {
  [K in keyof Circuits]: Circuits[K] extends (
    ctx: CircuitContext<TState>,
    ...args: infer P
  ) => { result: infer R; context: CircuitContext<TState> }
    ? (...args: P) => R
    : never;
};

export type SimulatorOptions<PS, WGen extends (...args: any[]) => any> = {
  address?: string;
  coinPK?: string;
  privateState?: PS;
  witnesses?: ReturnType<WGen>;
};
