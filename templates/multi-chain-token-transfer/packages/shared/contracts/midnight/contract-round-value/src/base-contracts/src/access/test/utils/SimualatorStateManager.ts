import {
  type CircuitContext,
  type ConstructorContext,
  type ContractState,
  constructorContext,
  QueryContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';

/**
 * A composable utility class for managing Compact contract state in simulations.
 *
 * This class handles initialization and lifecycle management of the `CircuitContext`,
 * which includes private state, public (ledger) state, zswap local state, and transaction context.
 *
 * It is designed to be embedded compositionally inside contract simulator classes
 * (e.g., `FooSimulator`), enabling better separation of concerns and easier test setup.
 *
 * @template P - The type of the contract's private state.
 *
 * ### Responsibilities
 * - Initializes the contract state using the compiled contract's `.initialState` method.
 * - Stores and exposes the `CircuitContext` via getters/setters.
 * - Supports injection of private state and contract constructor arguments.
 * - Allows the owning simulator to update private state manually during testing.
 *
 * ### Example Usage:
 * ```ts
 * const contract = new MyContract(witnesses);
 * const manager = new SimulatorStateManager(
 *   contract,
 *   { foo: 1n },                 // initial private state
 *   '0'.repeat(64),              // coin public key
 *   sampleContractAddress(),     // optional contract address
 *   arg1, arg2                   // additional constructor args
 * );
 *
 * const context = manager.getContext();
 * ```
 */
export class SimulatorStateManager<P> {
  private context: CircuitContext<P>;

  /**
   * Creates an instance of `SimulatorStateManager`.
   *
   * @param contract - A compiled Compact contract instance (from artifacts), exposing `initialState()`.
   * @param privateState - The initial private state to inject into the contract.
   * @param coinPK - The caller's coin public key (used to create the constructor context).
   * @param contractAddress - Optional override for the contract's address. Defaults to `sampleContractAddress` if not provided.
   * @param contractArgs - Additional arguments to pass to the contract constructor (e.g., circuit params).
   */
  constructor(
    contract: {
      initialState: (
        ctx: ConstructorContext<P>,
        ...args: any[]
      ) => {
        currentPrivateState: P;
        currentContractState: ContractState;
        currentZswapLocalState: any;
      };
    },
    privateState: P,
    coinPK: string,
    contractAddress?: string,
    ...contractArgs: any[]
  ) {
    const initCtx = constructorContext(privateState, coinPK);

    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = contract.initialState(initCtx, ...contractArgs);

    this.context = {
      currentPrivateState,
      currentZswapLocalState,
      originalState: currentContractState,
      transactionContext: new QueryContext(
        currentContractState.data,
        contractAddress ?? sampleContractAddress(),
      ),
    };
  }

  /**
   * Retrieves the current `CircuitContext`, including private state,
   * zswap state, contract state, and transaction context.
   */
  getContext(): CircuitContext<P> {
    return this.context;
  }

  /**
   * Replaces the internal `CircuitContext` with a new one.
   *
   * Useful when circuits mutate state and return an updated context.
   */
  setContext(newContext: CircuitContext<P>) {
    this.context = newContext;
  }

  /**
   * Updates just the private state inside the existing context.
   *
   * This is a lightweight way to simulate local state changes without reconstructing the full context.
   *
   * @param newPrivateState - The new private state object to apply.
   */
  updatePrivateState(newPrivateState: P) {
    this.context.currentPrivateState = newPrivateState;
  }
}
