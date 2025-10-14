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
  Contract as MockFungibleToken,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockFungibleToken/contract/index.cjs'; // Combined imports
import {
  type FungibleTokenPrivateState,
  FungibleTokenWitnesses,
} from '../../witnesses/FungibleTokenWitnesses.js';
import type { IContractSimulator } from '../types/test.js';

/**
 * @description A simulator implementation of a FungibleToken contract for testing purposes.
 * @template P - The private state type, fixed to FungibleTokenPrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class FungibleTokenSimulator
  implements IContractSimulator<FungibleTokenPrivateState, Ledger>
{
  /** @description The underlying contract instance managing contract logic. */
  readonly contract: MockFungibleToken<FungibleTokenPrivateState>;

  /** @description The deployed address of the contract. */
  readonly contractAddress: string;

  /** @description The current circuit context, updated by contract operations. */
  circuitContext: CircuitContext<FungibleTokenPrivateState>;

  /**
   * @description Initializes the mock contract.
   */
  constructor(name: string, symbol: string, decimals: bigint, init: boolean) {
    this.contract = new MockFungibleToken<FungibleTokenPrivateState>(
      FungibleTokenWitnesses,
    );
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      constructorContext({}, '0'.repeat(64)),
      name,
      symbol,
      decimals,
      init,
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
  public getCurrentPublicState(): Ledger {
    return ledger(this.circuitContext.transactionContext.state);
  }

  /**
   * @description Retrieves the current private state of the contract.
   * @returns The private state of type FungibleTokenPrivateState.
   */
  public getCurrentPrivateState(): FungibleTokenPrivateState {
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
   * @description Returns the token name.
   * @returns The token name.
   */
  public name(): string {
    return this.contract.impureCircuits.name(this.circuitContext).result;
  }

  /**
   * @description Returns the symbol of the token.
   * @returns The token name.
   */
  public symbol(): string {
    return this.contract.impureCircuits.symbol(this.circuitContext).result;
  }

  /**
   * @description Returns the number of decimals used to get its user representation.
   * @returns The account's token balance.
   */
  public decimals(): bigint {
    return this.contract.impureCircuits.decimals(this.circuitContext).result;
  }

  /**
   * @description Returns the value of tokens in existence.
   * @returns The total supply of tokens.
   */
  public totalSupply(): bigint {
    return this.contract.impureCircuits.totalSupply(this.circuitContext).result;
  }

  /**
   * @description Returns the value of tokens owned by `account`.
   * @param account The public key or contract address to query.
   * @returns The account's token balance.
   */
  public balanceOf(
    account: Either<ZswapCoinPublicKey, ContractAddress>,
  ): bigint {
    return this.contract.impureCircuits.balanceOf(this.circuitContext, account)
      .result;
  }

  /**
   * @description Returns the remaining number of tokens that `spender` will be allowed to spend on behalf of `owner`
   * through `transferFrom`. This value changes when `approve` or `transferFrom` are called.
   * @param owner The public key or contract address of approver.
   * @param spender The public key or contract address of spender.
   * @returns The `spender`'s allowance over `owner`'s tokens.
   */
  public allowance(
    owner: Either<ZswapCoinPublicKey, ContractAddress>,
    spender: Either<ZswapCoinPublicKey, ContractAddress>,
  ): bigint {
    return this.contract.impureCircuits.allowance(
      this.circuitContext,
      owner,
      spender,
    ).result;
  }

  /**
   * @description Moves a `value` amount of tokens from the caller's account to `to`.
   * @param to The recipient of the transfer, either a user or a contract.
   * @param value The amount to transfer.
   * @param sender The simulated caller.
   * @returns As per the IERC20 spec, this MUST return true.
   */
  public transfer(
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
    sender?: CoinPublicKey,
  ): boolean {
    const res = this.contract.impureCircuits.transfer(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      to,
      value,
    );

    this.circuitContext = res.context;
    return res.result;
  }

  /**
   * @description Unsafe variant of `transfer` which allows transfers to contract addresses.
   * @param to The recipient of the transfer, either a user or a contract.
   * @param value The amount to transfer.
   * @param sender The simulated caller.
   * @returns As per the IERC20 spec, this MUST return true.
   */
  public _unsafeTransfer(
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
    sender?: CoinPublicKey,
  ): boolean {
    const res = this.contract.impureCircuits._unsafeTransfer(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      to,
      value,
    );

    this.circuitContext = res.context;
    return res.result;
  }

  /**
   * @description Moves `value` tokens from `from` to `to` using the allowance mechanism.
   * `value` is the deducted from the caller's allowance.
   * @param from The current owner of the tokens for the transfer, either a user or a contract.
   * @param to The recipient of the transfer, either a user or a contract.
   * @param value The amount to transfer.
   * @param sender The simulated caller.
   * @returns As per the IERC20 spec, this MUST return true.
   */
  public transferFrom(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
    sender?: CoinPublicKey,
  ): boolean {
    const res = this.contract.impureCircuits.transferFrom(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      from,
      to,
      value,
    );

    this.circuitContext = res.context;
    return res.result;
  }

  /**
   * @description Unsafe variant of `transferFrom` which allows transfers to contract addresses.
   * @param from The current owner of the tokens for the transfer, either a user or a contract.
   * @param to The recipient of the transfer, either a user or a contract.
   * @param value The amount to transfer.
   * @param sender The simulated caller.
   * @returns As per the IERC20 spec, this MUST return true.
   */
  public _unsafeTransferFrom(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
    sender?: CoinPublicKey,
  ): boolean {
    const res = this.contract.impureCircuits._unsafeTransferFrom(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      from,
      to,
      value,
    );

    this.circuitContext = res.context;
    return res.result;
  }

  /**
   * @description Sets a `value` amount of tokens as allowance of `spender` over the caller's tokens.
   * @param spender The Zswap key or ContractAddress that may spend on behalf of the caller.
   * @param value The amount of tokens the `spender` may spend.
   * @param sender The simulated caller.
   * @returns Returns a boolean value indicating whether the operation succeeded.
   */
  public approve(
    spender: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
    sender?: CoinPublicKey,
  ): boolean {
    const res = this.contract.impureCircuits.approve(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      spender,
      value,
    );

    this.circuitContext = res.context;
    return res.result;
  }

  ///
  /// Internal
  ///

  /**
   * @description Moves a `value` amount of tokens from `from` to `to`.
   * This internal function is equivalent to {transfer}, and can be used to
   * e.g. implement automatic token fees, slashing mechanisms, etc.
   * @param from The owner of the tokens to transfer.
   * @param to The receipient of the transferred tokens.
   * @param value The amount of tokens to transfer.
   */
  public _transfer(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._transfer(
      this.circuitContext,
      from,
      to,
      value,
    ).context;
  }

  /**
   * @description Unsafe variant of `_transfer` which allows transfers to contract addresses.
   * @param from The owner of the tokens to transfer.
   * @param to The receipient of the transferred tokens.
   * @param value The amount of tokens to transfer.
   */
  public _unsafeUncheckedTransfer(
    from: Either<ZswapCoinPublicKey, ContractAddress>,
    to: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._unsafeUncheckedTransfer(
      this.circuitContext,
      from,
      to,
      value,
    ).context;
  }

  /**
   * @description Creates a `value` amount of tokens and assigns them to `account`,
   * by transferring it from the zero address. Relies on the `update` mechanism.
   * @param account The recipient of tokens minted.
   * @param value The amount of tokens minted.
   */
  public _mint(
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._mint(
      this.circuitContext,
      account,
      value,
    ).context;
  }

  /**
   * @description Unsafe variant of `_mint` which allows transfers to contract addresses.
   * @param account The recipient of tokens minted.
   * @param value The amount of tokens minted.
   */
  public _unsafeMint(
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._unsafeMint(
      this.circuitContext,
      account,
      value,
    ).context;
  }

  /**
   * @description Destroys a `value` amount of tokens from `account`, lowering the total supply.
   * Relies on the `_update` mechanism.
   * @param account The target owner of tokens to burn.
   * @param value The amount of tokens to burn.
   */
  public _burn(
    account: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._burn(
      this.circuitContext,
      account,
      value,
    ).context;
  }

  /**
   * @description Sets `value` as the allowance of `spender` over the `owner`'s tokens.
   * This internal function is equivalent to `approve`, and can be used to
   * e.g. set automatic allowances for certain subsystems, etc.
   * @param owner The owner of the tokens.
   * @param spender The spender of the tokens.
   * @param value The amount of tokens `spender` may spend on behalf of `owner`.
   */
  public _approve(
    owner: Either<ZswapCoinPublicKey, ContractAddress>,
    spender: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._approve(
      this.circuitContext,
      owner,
      spender,
      value,
    ).context;
  }

  /**
   * @description Updates `owner`'s allowance for `spender` based on spent `value`.
   * Does not update the allowance value in case of infinite allowance.
   * @param owner The owner of the tokens.
   * @param spender The spender of the tokens.
   * @param value The amount of token allowance to spend.
   */
  public _spendAllowance(
    owner: Either<ZswapCoinPublicKey, ContractAddress>,
    spender: Either<ZswapCoinPublicKey, ContractAddress>,
    value: bigint,
  ) {
    this.circuitContext = this.contract.impureCircuits._spendAllowance(
      this.circuitContext,
      owner,
      spender,
      value,
    ).context;
  }
}
