import { describe, expect, test } from "bun:test";
import {
  ContractState,
  StateValue,
} from "@midnight-ntwrk/onchain-runtime";

describe("Midnight onchain runtime migration", () => {
  test("the config compatibility alias loads the v4 runtime surface", () => {
    expect(typeof ContractState).toBe("function");
    expect(typeof ContractState.deserialize).toBe("function");
    expect(typeof StateValue).toBe("function");
  });
});
