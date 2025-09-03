import {
  type CircuitContext,
  constructorContext,
  QueryContext,
  sampleContractAddress,
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger,
} from "../managed/counter-round-value/contract/index.cjs";
import { type CounterPrivateState, witnesses } from "../witnesses.js";

// This is over-kill for such a simple contract, but the same pattern can be used to test more
// complex contracts.
export class CounterSimulator {
  readonly contract: Contract<CounterPrivateState>;
  circuitContext: CircuitContext<CounterPrivateState>;

  constructor() {
    this.contract = new Contract<CounterPrivateState>(witnesses);
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState,
    } = this.contract.initialState(
      constructorContext({ privateCounter: 0 }, "0".repeat(64)),
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
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.transactionContext.state);
  }

  public getPrivateState(): CounterPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  public increment(): Ledger {
    // Update the current context to be the result of executing the circuit.
    this.circuitContext = this.contract.impureCircuits.increment(
      this.circuitContext,
      1n,
      2n,
      Uint8Array.from(
        "test A".padEnd(128, " ").split("").map((c) => c.charCodeAt(0)),
      ),
      Uint8Array.from(
        "test B".padEnd(128, " ").split("").map((c) => c.charCodeAt(0)),
      ),
    ).context;
    return ledger(this.circuitContext.transactionContext.state);
  }
}
