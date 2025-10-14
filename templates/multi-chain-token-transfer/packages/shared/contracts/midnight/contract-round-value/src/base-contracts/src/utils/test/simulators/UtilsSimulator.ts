import {
  type CircuitContext,
  type ContractState,
  constructorContext,
  QueryContext,
} from '@midnight-ntwrk/compact-runtime';
import { sampleContractAddress } from '@midnight-ntwrk/zswap';
import {
  type ContractAddress,
  type Either,
  type Ledger,
  ledger,
  Contract as MockUtils,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockUtils/contract/index.cjs'; // Combined imports
import {
  type UtilsPrivateState,
  UtilsWitnesses,
} from '../../witnesses/UtilsWitnesses.js';
import type { IContractSimulator } from '../types/test.js';

/**
 * @description A simulator implementation of an utils contract for testing purposes.
 * @template P - The private state type, fixed to UtilsPrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class UtilsSimulator
  implements IContractSimulator<UtilsPrivateState, Ledger>
{
  /** @description The underlying contract instance managing contract logic. */
  readonly contract: MockUtils<UtilsPrivateState>;

  /** @description The deployed address of the contract. */
  readonly contractAddress: string;

  /** @description The current circuit context, updated by contract operations. */
  circuitContext: CircuitContext<UtilsPrivateState>;

  /**
   * @description Initializes the mock contract.
   */
  constructor() {
    this.contract = new MockUtils<UtilsPrivateState>(UtilsWitnesses);
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
  public getCurrentPrivateState(): UtilsPrivateState {
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
   * @description Returns whether `keyOrAddress` is the zero address.
   * @param keyOrAddress The target value to check, either a ZswapCoinPublicKey or a ContractAddress.
   * @returns Returns true if `keyOrAddress` is zero.
   */
  public isKeyOrAddressZero(
    keyOrAddress: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    return this.contract.circuits.isKeyOrAddressZero(
      this.circuitContext,
      keyOrAddress,
    ).result;
  }

  /**
   * @description Returns whether `keyOrAddress` is equal to `other`. Assumes that a ZswapCoinPublicKey
   * and a ContractAddress can never be equal
   *
   * @public
   * @param {Either<ZswapCoinPublicKey, ContractAddress>} keyOrAddress The target value to check
   * @param {Either<ZswapCoinPublicKey, ContractAddress>} other The other value to check
   * @returns {boolean} Returns true if `keyOrAddress` is is equal to `other`.
   */
  public isKeyOrAddressEqual(
    keyOrAddress: Either<ZswapCoinPublicKey, ContractAddress>,
    other: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    return this.contract.circuits.isKeyOrAddressEqual(
      this.circuitContext,
      keyOrAddress,
      other,
    ).result;
  }

  /**
   * @description Returns whether `key` is the zero address.
   * @param key The target value to check.
   * @returns Returns true if `key` is zero.
   */
  public isKeyZero(key: ZswapCoinPublicKey): boolean {
    return this.contract.circuits.isKeyZero(this.circuitContext, key).result;
  }

  /**
   * @description Returns whether `keyOrAddress` is a ContractAddress type.
   * @param keyOrAddress The target value to check, either a ZswapCoinPublicKey or a ContractAddress.
   * @returns Returns true if `keyOrAddress` is a ContractAddress
   */
  public isContractAddress(
    keyOrAddress: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    return this.contract.circuits.isContractAddress(
      this.circuitContext,
      keyOrAddress,
    ).result;
  }

  /**
   * @description  A helper function that returns the empty string: ""
   * @returns The empty string: ""
   */
  public emptyString(): string {
    return this.contract.circuits.emptyString(this.circuitContext).result;
  }
}
