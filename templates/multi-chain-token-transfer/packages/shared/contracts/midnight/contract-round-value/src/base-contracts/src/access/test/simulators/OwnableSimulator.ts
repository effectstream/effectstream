import {
  type CircuitContext,
  type CoinPublicKey,
  type ContractState,
  constructorContext,
  emptyZswapLocalState,
  QueryContext,
} from '@midnight-ntwrk/compact-runtime';
import { sampleContractAddress } from '@midnight-ntwrk/zswap';
import {
  type ContractAddress,
  type Either,
  type Ledger,
  ledger,
  Contract as MockOwnable,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockOwnable/contract/index.cjs'; // Combined imports
import {
  type OwnablePrivateState,
  OwnableWitnesses,
} from '../../witnesses/OwnableWitnesses.js';
import type { IContractSimulator } from '../types/test.js';

/**
 * @description A simulator implementation of a Ownable contract for testing purposes.
 * @template P - The private state type, fixed to OwnablePrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class OwnableSimulator
  implements IContractSimulator<OwnablePrivateState, Ledger>
{
  /** @description The underlying contract instance managing contract logic. */
  readonly contract: MockOwnable<OwnablePrivateState>;

  /** @description The deployed address of the contract. */
  readonly contractAddress: string;

  /** @description The current circuit context, updated by contract operations. */
  circuitContext: CircuitContext<OwnablePrivateState>;

  /**
   * @description Initializes the mock contract.
   */
  constructor(
    initialOwner: Either<ZswapCoinPublicKey, ContractAddress>,
    isInit: boolean,
  ) {
    this.contract = new MockOwnable<OwnablePrivateState>(OwnableWitnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      constructorContext({}, '0'.repeat(64)),
      initialOwner,
      isInit,
    );
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
  public getPublicState(): Ledger {
    return ledger(this.circuitContext.transactionContext.state);
  }

  /**
   * @description Retrieves the current private state of the contract.
   * @returns The private state of type OwnablePrivateState.
   */
  public getPrivateState(): OwnablePrivateState {
    return this.circuitContext.currentPrivateState;
  }

  /**
   * @description Retrieves the current contract state.
   * @returns The contract state object.
   */
  public getContractState(): ContractState {
    return this.circuitContext.originalState;
  }

  /**
   * @description Returns the current contract owner.
   * @returns The contract owner.
   */
  public owner(): Either<ZswapCoinPublicKey, ContractAddress> {
    return this.contract.impureCircuits.owner(this.circuitContext).result;
  }

  /**
   * @description Transfers ownership of the contract to `newOwner`.
   * @param newOwner - The new owner.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public transferOwnership(
    newOwner: Either<ZswapCoinPublicKey, ContractAddress>,
    sender?: CoinPublicKey,
  ) {
    const res = this.contract.impureCircuits.transferOwnership(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      newOwner,
    );

    this.circuitContext = res.context;
  }

  /**
   * @description Unsafe variant of `transferOwnership`.
   * @param newOwner - The new owner.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public _unsafeTransferOwnership(
    newOwner: Either<ZswapCoinPublicKey, ContractAddress>,
    sender?: CoinPublicKey,
  ) {
    const res = this.contract.impureCircuits._unsafeTransferOwnership(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      newOwner,
    );

    this.circuitContext = res.context;
  }

  /**
   * @description Leaves the contract without an owner.
   * It will not be possible to call `assertOnlyOnwer` circuits anymore.
   * Can only be called by the current owner.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public renounceOwnership(sender?: CoinPublicKey) {
    const res = this.contract.impureCircuits.renounceOwnership({
      ...this.circuitContext,
      currentZswapLocalState: sender
        ? emptyZswapLocalState(sender)
        : this.circuitContext.currentZswapLocalState,
    });

    this.circuitContext = res.context;
  }

  /**
   * @description Throws if called by any account other than the owner.
   * Use this to restrict access of specific circuits to the owner.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public assertOnlyOwner(sender?: CoinPublicKey) {
    const res = this.contract.impureCircuits.assertOnlyOwner({
      ...this.circuitContext,
      currentZswapLocalState: sender
        ? emptyZswapLocalState(sender)
        : this.circuitContext.currentZswapLocalState,
    });

    this.circuitContext = res.context;
  }

  /**
   * @description Transfers ownership of the contract to `newOwner` without
   * enforcing permission checks on the caller.
   * @param newOwner - The new owner.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public _transferOwnership(
    newOwner: Either<ZswapCoinPublicKey, ContractAddress>,
    sender?: CoinPublicKey,
  ) {
    const res = this.contract.impureCircuits._transferOwnership(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      newOwner,
    );

    this.circuitContext = res.context;
  }

  /**
   * @description Unsafe variant of `_transferOwnership`.
   * @param newOwner - The new owner.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public _unsafeUncheckedTransferOwnership(
    newOwner: Either<ZswapCoinPublicKey, ContractAddress>,
    sender?: CoinPublicKey,
  ) {
    const res = this.contract.impureCircuits._unsafeUncheckedTransferOwnership(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      newOwner,
    );

    this.circuitContext = res.context;
  }
}
