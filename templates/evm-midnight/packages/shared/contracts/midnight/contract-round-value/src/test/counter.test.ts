import { CounterSimulator } from "./counter-simulator.js";
import {
  NetworkId,
  setNetworkId,
} from "@midnight-ntwrk/midnight-js-network-id";
import { describe, expect, it } from "vitest";

setNetworkId(NetworkId.Undeployed);

describe("Counter smart contract", () => {
  it("generates initial ledger state deterministically", () => {
    const simulator0 = new CounterSimulator();
    const simulator1 = new CounterSimulator();
    expect(simulator0.getLedger()).toEqual(simulator1.getLedger());
  });

  it("properly initializes ledger state and private state", () => {
    const simulator = new CounterSimulator();
    const initialLedgerState = simulator.getLedger();
    expect(initialLedgerState.round).toEqual(0n);
    const initialPrivateState = simulator.getPrivateState();
    expect(initialPrivateState).toEqual({ privateCounter: 0 });
  });

  it("increments the counter correctly", () => {
    const simulator = new CounterSimulator();
    const nextLedgerState = simulator.increment();
    expect(nextLedgerState.round).toEqual(1n);
    expect(nextLedgerState.contract_address).toEqual(1n);
    expect(nextLedgerState.token_id).toEqual(2n);
    expect(nextLedgerState.property_name).toEqual(
      Uint8Array.from(
        "test A".padEnd(128, " ").split("").map((c) => c.charCodeAt(0)),
      ),
    );
    expect(nextLedgerState.value).toEqual(
      Uint8Array.from(
        "test B".padEnd(128, " ").split("").map((c) => c.charCodeAt(0)),
      ),
    );

    const nextPrivateState = simulator.getPrivateState();
    expect(nextPrivateState).toEqual({ privateCounter: 0 });
  });
});
