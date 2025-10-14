import type {
  CircuitContext,
  ContractState,
} from '@midnight-ntwrk/compact-runtime';
import type { ContextlessCircuits, IContractSimulator } from '../types/test.js';

/**
 * Abstract base class for simulating contract behavior.
 * Provides common functionality for managing circuit contexts and creating proxies
 * for pure and impure circuit functions.
 *
 * @template P - The type representing the private state of the contract.
 * @template L - The type representing the public ledger (contract) state.
 */
export abstract class AbstractContractSimulator<P, L>
  implements IContractSimulator<P, L>
{
  /**
   * The deployed contract's address.
   * Must be implemented by concrete subclasses.
   */
  abstract readonly contractAddress: string;

  /**
   * The current circuit context containing private state, contract state, and transaction context.
   * Must be implemented by concrete subclasses.
   */
  abstract circuitContext: CircuitContext<P>;

  /**
   * Retrieves the current public ledger state of the contract.
   * Must be implemented by concrete subclasses.
   *
   * @returns The current public ledger state.
   */
  abstract getPublicState(): L;

  /**
   * Retrieves the current private state from the circuit context.
   *
   * @returns The current private state of the contract.
   */
  public getPrivateState(): P {
    return this.circuitContext.currentPrivateState;
  }

  /**
   * Retrieves the original contract state from the circuit context.
   *
   * @returns The original contract state.
   */
  public getContractState(): ContractState {
    return this.circuitContext.originalState;
  }

  /**
   * Creates a proxy wrapper around pure circuits.
   * Pure circuits do not modify contract state, so only the result is returned.
   *
   * @template Circuits - The type of the circuits object to proxy.
   * @param circuits - The original circuits object containing functions accepting a CircuitContext.
   * @param context - A function returning the current CircuitContext to pass to circuit functions.
   * @returns A proxy with contextless circuits that accept the original arguments and return only results.
   */
  protected createPureCircuitProxy<Circuits extends object>(
    circuits: Circuits,
    context: () => CircuitContext<P>,
  ): ContextlessCircuits<Circuits, P> {
    return new Proxy(circuits, {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver);

        if (typeof original !== 'function') return original;

        return (...args: any[]) => {
          const ctx = context();

          const fn = original as (
            ctx: CircuitContext<P>,
            ...args: any[]
          ) => { result: any };

          return fn(ctx, ...args).result;
        };
      },
    }) as ContextlessCircuits<Circuits, P>;
  }

  /**
   * Creates a proxy wrapper around impure circuits.
   * Impure circuits can modify contract state, so the circuit context is updated accordingly.
   *
   * @template Circuits - The type of the circuits object to proxy.
   * @param circuits - The original circuits object containing functions accepting a CircuitContext.
   * @param context - A function returning the current CircuitContext to pass to circuit functions.
   * @param updateContext - A callback to update the circuit context with the new context returned by the circuit.
   * @returns A proxy with contextless circuits that accept the original arguments, update context, and return results.
   */
  protected createImpureCircuitProxy<Circuits extends object>(
    circuits: Circuits,
    context: () => CircuitContext<P>,
    updateContext: (ctx: CircuitContext<P>) => void,
  ): ContextlessCircuits<Circuits, P> {
    return new Proxy(circuits, {
      get(target, prop, receiver) {
        const original = Reflect.get(target, prop, receiver);

        if (typeof original !== 'function') return original;

        return (...args: any[]) => {
          const ctx = context();

          const fn = original as (
            ctx: CircuitContext<P>,
            ...args: any[]
          ) => { result: any; context: CircuitContext<P> };

          const { result, context: newCtx } = fn(ctx, ...args);
          updateContext(newCtx);
          return result;
        };
      },
    }) as ContextlessCircuits<Circuits, P>;
  }

  /**
   * Optional method to reset any cached circuit proxies.
   * Concrete subclasses can override this to clear proxies if needed.
   */
  public resetCircuitProxies?(): void {}
}
