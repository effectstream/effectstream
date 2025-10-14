import {
  type CircuitContext,
  type CoinPublicKey,
  type ContractAddress,
  type ContractState,
  emptyZswapLocalState,
  QueryContext,
} from '@midnight-ntwrk/compact-runtime';
import type { IContractSimulator } from '../types/test.js';

/**
 * Constructs a `CircuitContext` from the given state and sender information.
 *
 * This is typically used at runtime to provide the necessary context
 * for executing circuits, including contract state, private state,
 * sender identity, and transaction data.
 *
 * @template P - The type of the contract's private state.
 * @param privateState - The current private state of the contract.
 * @param contractState - The full contract state, including public and private data.
 * @param sender - The public key of the sender (used in the circuit).
 * @param contractAddress - The address of the deployed contract.
 * @returns A fully populated `CircuitContext` for circuit execution.
 * @todo TODO: Move this utility to a generic package for broader reuse across contracts.
 */
export function useCircuitContext<P>(
  privateState: P,
  contractState: ContractState,
  sender: CoinPublicKey,
  contractAddress: ContractAddress,
): CircuitContext<P> {
  return {
    originalState: contractState,
    currentPrivateState: privateState,
    transactionContext: new QueryContext(contractState.data, contractAddress),
    currentZswapLocalState: emptyZswapLocalState(sender),
  };
}

/**
 * Prepares a new `CircuitContext` using the given sender and contract.
 *
 * Useful for mocking or updating the circuit context with a custom sender.
 *
 * @template P - The type of the contract's private state.
 * @template L - The type of the contract's ledger (public state).
 * @template C - The specific type of the contract implementing `MockContract`.
 * @param contract - The contract instance implementing `MockContract`.
 * @param sender - The public key to set as the sender in the new circuit context.
 * @returns A new `CircuitContext` with the sender and updated context values.
 * @todo TODO: Move this utility to a generic package for broader reuse across contracts.
 */
export function useCircuitContextSender<
  P,
  L,
  C extends IContractSimulator<P, L>,
>(contract: C, sender: CoinPublicKey): CircuitContext<P> {
  const currentPrivateState = contract.getPrivateState();
  const originalState = contract.getContractState();
  const contractAddress = contract.contractAddress;

  return {
    originalState,
    currentPrivateState,
    transactionContext: new QueryContext(originalState.data, contractAddress),
    currentZswapLocalState: emptyZswapLocalState(sender),
  };
}
