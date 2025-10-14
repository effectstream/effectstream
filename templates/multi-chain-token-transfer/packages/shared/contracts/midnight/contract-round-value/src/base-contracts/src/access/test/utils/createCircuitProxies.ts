import type { CircuitContext } from '@midnight-ntwrk/compact-runtime';
import type {
  ContextlessCircuits,
  ExtractImpureCircuits,
  ExtractPureCircuits,
} from '../types/test.js';

/**
 * Creates lazily-initialized circuit proxies for pure and impure contract functions.
 */
export function createCircuitProxies<
  P,
  ContractType extends {
    circuits: Record<PropertyKey, unknown>;
    impureCircuits: Record<PropertyKey, unknown>;
  },
>(
  contract: ContractType,
  getContext: () => CircuitContext<P>,
  getCallerContext: () => CircuitContext<P>,
  updateContext: (ctx: CircuitContext<P>) => void,
  createPureProxy: <C extends Record<PropertyKey, unknown>>(
    circuits: C,
    context: () => CircuitContext<P>,
  ) => ContextlessCircuits<C, P>,
  createImpureProxy: <C extends Record<PropertyKey, unknown>>(
    circuits: C,
    context: () => CircuitContext<P>,
    updateContext: (ctx: CircuitContext<P>) => void,
  ) => ContextlessCircuits<C, P>,
) {
  let pureProxy:
    | ContextlessCircuits<ExtractPureCircuits<ContractType>, P>
    | undefined;
  let impureProxy:
    | ContextlessCircuits<ExtractImpureCircuits<ContractType>, P>
    | undefined;

  return {
    get circuits() {
      if (!pureProxy) {
        pureProxy = createPureProxy(
          contract.circuits as ExtractPureCircuits<ContractType>,
          getContext,
        );
      }
      if (!impureProxy) {
        impureProxy = createImpureProxy(
          contract.impureCircuits as ExtractImpureCircuits<ContractType>,
          getCallerContext,
          updateContext,
        );
      }
      return {
        pure: pureProxy,
        impure: impureProxy,
      };
    },
    resetProxies() {
      pureProxy = undefined;
      impureProxy = undefined;
    },
  };
}
