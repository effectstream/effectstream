import {
  type CircuitContext,
  type ContractState,
  constructorContext,
  QueryContext,
  sampleContractAddress,
} from '@midnight-ntwrk/compact-runtime';
import {
  type Ledger,
  ledger,
  Contract as MockPausable,
} from '../../../../artifacts/MockPausable/contract/index.cjs';
import {
  type PausablePrivateState,
  PausableWitnesses,
} from '../../witnesses/PausableWitnesses.js';
import type { IContractSimulator } from '../types/test.js';

/**
 * @description A simulator implementation of an utils contract for testing purposes.
 * @template P - The private state type, fixed to UtilsPrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class PausableSimulator
  implements IContractSimulator<PausablePrivateState, Ledger>
{
  /** @description The underlying contract instance managing contract logic. */
  readonly contract: MockPausable<PausablePrivateState>;

  /** @description The deployed address of the contract. */
  readonly contractAddress: string;

  /** @description The current circuit context, updated by contract operations. */
  circuitContext: CircuitContext<PausablePrivateState>;

  /**
   * @description Initializes the mock contract.
   */
  constructor() {
    this.contract = new MockPausable<PausablePrivateState>(PausableWitnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(constructorContext({}, '0'.repeat(64)));
    this.circuitContext = {
      currentPrivateState,
      currentZswapLocalState,
      originalState: currentContractState,
      transactionContext: new QueryContext(
        currentContractState.data,
        sampleContractAddress(),
      ),
    };
    this.contractAddress = this.circuitContext.transactionContext.address;
  }

  /**
   * @description Retrieves the current public ledger state of the contract.
   * @returns The ledger state as defined by the contract.
   */
  public getCurrentPublicState(): Ledger {
    return ledger(this.circuitContext.transactionContext.state);
  }

  /**
   * @description Retrieves the current private state of the contract.
   * @returns The private state of type UtilsPrivateState.
   */
  public getCurrentPrivateState(): PausablePrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /**
   * @description Retrieves the current contract state.
   * @returns The contract state object.
   */
  public getCurrentContractState(): ContractState {
    return this.circuitContext.originalState;
  }

  /**
   * @description Returns true if the contract is paused, and false otherwise.
   * @returns True if paused.
   */
  public isPaused(): boolean {
    return this.contract.impureCircuits.isPaused(this.circuitContext).result;
  }

  /**
   * @description Makes a circuit only callable when the contract is paused.
   */
  public assertPaused() {
    this.circuitContext = this.contract.impureCircuits.assertPaused(
      this.circuitContext,
    ).context;
  }

  /**
   * @description Makes a circuit only callable when the contract is not paused.
   */
  public assertNotPaused() {
    this.circuitContext = this.contract.impureCircuits.assertNotPaused(
      this.circuitContext,
    ).context;
  }

  /**
   * @description Triggers a stopped state.
   */
  public pause() {
    this.circuitContext = this.contract.impureCircuits.pause(
      this.circuitContext,
    ).context;
  }

  /**
   * @description Lifts the pause on the contract.
   */
  public unpause() {
    this.circuitContext = this.contract.impureCircuits.unpause(
      this.circuitContext,
    ).context;
  }
}
