import {
  type CircuitContext,
  type CircuitResults,
  type CoinPublicKey,
  type ContractState,
  constructorContext,
  emptyZswapLocalState,
  QueryContext,
} from '@midnight-ntwrk/compact-runtime';
import { sampleContractAddress } from '@midnight-ntwrk/zswap';
import {
  type CoinInfo,
  type ContractAddress,
  type Either,
  type Ledger,
  ledger,
  type Maybe,
  Contract as MockShielded,
  type SendResult,
  type ZswapCoinPublicKey,
} from '../../../../artifacts/MockShieldedToken/contract/index.cjs'; // Combined imports
import {
  type ShieldedTokenPrivateState,
  ShieldedTokenWitnesses,
} from '../../witnesses/ShieldedTokenWitnesses.js';
import type { IContractSimulator } from '../types/test.js';

/**
 * @description A simulator implementation of a shielded token contract for testing purposes.
 * @template P - The private state type, fixed to ShieldedTokenPrivateState.
 * @template L - The ledger type, fixed to Contract.Ledger.
 */
export class ShieldedTokenSimulator
  implements IContractSimulator<ShieldedTokenPrivateState, Ledger> {
  /** @description The underlying contract instance managing contract logic. */
  readonly contract: MockShielded<ShieldedTokenPrivateState>;

  /** @description The deployed address of the contract. */
  readonly contractAddress: string;

  /** @description The current circuit context, updated by contract operations. */
  circuitContext: CircuitContext<ShieldedTokenPrivateState>;

  /**
   * @description Initializes the mock contract.
   */
  constructor(
    nonce: Uint8Array,
    name: Maybe<string>,
    symbol: Maybe<string>,
    decimals: bigint,
  ) {
    this.contract = new MockShielded<ShieldedTokenPrivateState>(
      ShieldedTokenWitnesses,
    );
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      constructorContext({}, '0'.repeat(64)),
      nonce,
      name,
      symbol,
      decimals,
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
   * @returns The private state of type ShieldedTokenPrivateState.
   */
  public getCurrentPrivateState(): ShieldedTokenPrivateState {
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
  public name(): Maybe<string> {
    return this.contract.impureCircuits.name(this.circuitContext).result;
  }

  /**
   * @description Returns the symbol of the token.
   * @returns The token name.
   */
  public symbol(): Maybe<string> {
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

  public mint(
    recipient: Either<ZswapCoinPublicKey, ContractAddress>,
    amount: bigint,
    sender?: CoinPublicKey,
  ): CircuitResults<ShieldedTokenPrivateState, CoinInfo> {
    const res = this.contract.impureCircuits.mint(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      recipient,
      amount,
    );

    this.circuitContext = res.context;
    return res;
  }

  public burn(
    coin: CoinInfo,
    amount: bigint,
    sender?: CoinPublicKey,
  ): CircuitResults<ShieldedTokenPrivateState, SendResult> {
    const res = this.contract.impureCircuits.burn(
      {
        ...this.circuitContext,
        currentZswapLocalState: sender
          ? emptyZswapLocalState(sender)
          : this.circuitContext.currentZswapLocalState,
      },
      coin,
      amount,
    );

    this.circuitContext = res.context;
    return res;
  }
}
