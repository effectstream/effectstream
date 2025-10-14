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
  type Maybe,
  Contract as MockMultiToken,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockMultiToken/contract/index.cjs'; // Combined imports
import {
  type MultiTokenPrivateState,
  MultiTokenWitnesses,
} from '../../witnesses/MultiTokenWitnesses.js';
import type { IContractSimulator } from '../types/test.js';

/**
 * @description A simulator implementation of a MultiToken contract for testing purposes.
 * @template P - The private state type, fixed to MultiTokenPrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class MultiTokenSimulator
  implements IContractSimulator<MultiTokenPrivateState, Ledger> {
  /** @description The underlying contract instance managing contract logic. */
  readonly contract: MockMultiToken<MultiTokenPrivateState>;

  /** @description The deployed address of the contract. */
  readonly contractAddress: string;

  /** @description The current circuit context, updated by contract operations. */
  circuitContext: CircuitContext<MultiTokenPrivateState>;

  /**
   * @description Initializes the mock contract if `uri` is provided.
   * If `uri` is none, the contract will not initialize (for testing).
   */
  constructor(uri: Maybe<string>) {
    this.contract = new MockMultiToken<MultiTokenPrivateState>(
      MultiTokenWitnesses,
    );
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(constructorContext({}, '0'.repeat(64)), uri);
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
   * @returns The private state of type MultiTokenPrivateState.
   */
  public getCurrentPrivateState(): MultiTokenPrivateState {
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
   * @description Initializes the contract. This is already executed in the simulator constructor;
   * however, this method enables the tests to assert it cannot be called again.
   * @param uri The base URI for all token URIs.
   */
  public initialize(uri: string) {
    this.circuitContext = this.contract.impureCircuits.initialize(
      this.circuitContext,
      uri,
    ).context;
  }

  /**
   * @description Returns the token URI.
   * @param id The token identifier to query.
   * @returns The token URI.
   */
  public uri(id: bigint): string {
    return this.contract.impureCircuits.uri(this.circuitContext, id).result;
  }

  /**
   * @description Returns the amount of `id` tokens owned by `account`.
   * @param account The account balance to query.
   * @param id The token identifier to query.
   * @returns The quantity of `id` tokens that `account` owns.
   */
  public balanceOf(
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
  ): bigint {
    return this.contract.impureCircuits.balanceOf(
      this.circuitContext,
      account,
      id,
    ).result;
  }

  /**
   * @description Enables or disables approval for `operator` to manage all of the caller's assets.
   * @param operator The ZswapCoinPublicKey or ContractAddress whose approval is set for the caller's assets.
   * @param approved The boolean value determining if the operator may or may not handle the
   * caller's assets.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public setApprovalForAll(
    operator: Either<ZswapCoinPublicKey, ContractAddress>,
    approved: boolean,
    sender?: CoinPublicKey,
  ) {
    this.circuitContext = this.contract.impureCircuits.setApprovalForAll(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      operator,
      approved,
    ).context;
  }

  /**
   * @description Queries if `operator` is an authorized operator for `owner`.
   * @param account The queried possessor of assets.
   * @param operator The queried handler of `account`'s assets.
   * @returns Whether or not `operator` has permission to handle `account`'s assets.
   */
  public isApprovedForAll(
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    operator: Either<ZswapCoinPublicKey, ContractAddress>,
  ): boolean {
    return this.contract.impureCircuits.isApprovedForAll(
      this.circuitContext,
      account,
      operator,
    ).result;
  }

  /**
   * @description Transfers ownership of `value` amount of `id` tokens from `from` to `to`.
   * The caller must be `from` or approved to transfer on their behalf.
   * @param from The owner from which the transfer originates.
   * @param to The recipient of the transferred assets.
   * @param id The unique identifier of the asset type.
   * @param value The quantity of `id` tokens to transfer.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public transferFrom(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
    value: bigint,
    sender?: CoinPublicKey,
  ) {
    this.circuitContext = this.contract.impureCircuits.transferFrom(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      from,
      to,
      id,
      value,
    ).context;
  }

  /**
   * @description Unsafe variant of `transferFrom` which allows transfers to contract addresses.
   * The caller must be `from` or approved to transfer on their behalf.
   * @param from The owner from which the transfer originates.
   * @param to The recipient of the transferred assets.
   * @param id The unique identifier of the asset type.
   * @param value The quantity of `id` tokens to transfer.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public _unsafeTransferFrom(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
    value: bigint,
    sender?: CoinPublicKey,
  ) {
    this.circuitContext = this.contract.impureCircuits._unsafeTransferFrom(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      from,
      to,
      id,
      value,
    ).context;
  }

  /**
   *  @description Transfers ownership of `value` amount of `id` tokens from `from` to `to`.
   * Does not impose restrictions on the caller, making it suitable for composition
   * in higher-level contract logic.
   * @param from The owner from which the transfer originates.
   * @param to The recipient of the transferred assets.
   * @param id The unique identifier of the asset type.
   * @param value The quantity of `id` tokens to transfer.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public _transfer(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
    value: bigint,
    sender?: CoinPublicKey,
  ) {
    this.circuitContext = this.contract.impureCircuits._transfer(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      from,
      to,
      id,
      value,
    ).context;
  }

  /**
   * @description Unsafe variant of `_transfer` which allows transfers to contract addresses.
   * Does not impose restrictions on the caller, making it suitable as a low-level
   * building block for advanced contract logic.
   * @param from The owner from which the transfer originates.
   * @param to The recipient of the transferred assets.
   * @param id The unique identifier of the asset type.
   * @param value The quantity of `id` tokens to transfer.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public _unsafeTransfer(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
    value: bigint,
    sender?: CoinPublicKey,
  ) {
    this.circuitContext = this.contract.impureCircuits._unsafeTransfer(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      from,
      to,
      id,
      value,
    ).context;
  }

  /**
   * @description Sets a new URI for all token types.
   * @param newURI The new base URI for all tokens.
   */
  public _setURI(newURI: string) {
    this.circuitContext = this.contract.impureCircuits._setURI(
      this.circuitContext,
      newURI,
    ).context;
  }

  /**
   * @description Creates a `value` amount of tokens of type `token_id`, and assigns them to `to`.
   * @param to The recipient of the minted tokens.
   * @param id The unique identifier for the token type.
   * @param value The quantity of `id` tokens that are minted to `to`.
   */
  public _mint(
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._mint(
      this.circuitContext,
      to,
      id,
      value,
    ).context;
  }

  /**
   * @description Creates a `value` amount of tokens of type `token_id`, and assigns them to `to`.
   * @param to The recipient of the minted tokens.
   * @param id The unique identifier for the token type.
   * @param value The quantity of `id` tokens that are minted to `to`.
   */
  public _unsafeMint(
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._unsafeMint(
      this.circuitContext,
      to,
      id,
      value,
    ).context;
  }

  /**
   * @description Destroys a `value` amount of tokens of type `token_id` from `from`.
   * @param from The owner whose tokens will be destroyed.
   * @param id The unique identifier of the token type.
   * @param value The quantity of `id` tokens that will be destroyed from `from`.
   */
  public _burn(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    id: bigint,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._burn(
      this.circuitContext,
      from,
      id,
      value,
    ).context;
  }

  /**
   * @description Enables or disables approval for `operator` to manage all of the caller's assets.
   * @param owner The ZswapCoinPublicKey or ContractAddress of the target owner.
   * @param operator The ZswapCoinPublicKey or ContractAddress whose approval is set for the
   * `owner`'s assets.
   * @param approved The boolean value determining if the operator may or may not handle the
   * `owner`'s assets.
   * @param sender - Optional. Sets the caller context if provided.
   */
  public _setApprovalForAll(
    owner: Either<ZswapCoinPublicKey, ContractAddress>,
    operator: Either<ZswapCoinPublicKey, ContractAddress>,
    approved: boolean,
    sender?: CoinPublicKey,
  ) {
    this.circuitContext = this.contract.impureCircuits._setApprovalForAll(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      owner,
      operator,
      approved,
    ).context;
  }
}
