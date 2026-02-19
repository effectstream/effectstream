import { AddressType } from "@effectstream/utils";
import { test } from "@effectstream/utils/runtime";
import { assertEquals } from "jsr:@std/assert";
import { EvmContractAdapter } from "./evm-contract-adapter.ts";
import type { HardhatArtifact } from "./evm-contract-adapter.ts";
import type { DefaultBatcherInput } from "../core/types.ts";

const CounterArtifact = {
  "contractName": "Counter",
  "abi": [
    {
      "inputs": [],
      "name": "getCount",
      "outputs": [
        {
          "internalType": "int256",
          "name": "",
          "type": "int256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "incrementCounter",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ]
} as const;

const TEST_CONFIG = {
  contractAddress: "0x0000000000000000000000000000000000000001" as const,
  privateKey:
    "0x59c6995e998f97a5a0044966f094538cde8d5b24de6cf1a9cd27d6a07f62fd81" as const,
  syncProtocolName: "parallelEvmContract",
  artifact: CounterArtifact as HardhatArtifact,
  rpcUrl: "http://127.0.0.1:8545",
} as const;

function makeInput(payload: unknown): DefaultBatcherInput {
  return {
    addressType: AddressType.EVM,
    address: "0x1234567890123456789012345678901234567890",
    signature: "0xsig",
    timestamp: "1700000000000",
    input: JSON.stringify(payload),
  };
}

test("EvmContractAdapter.validateInput accepts known method", async () => {
  const adapter = new EvmContractAdapter(TEST_CONFIG);
  const input = makeInput({ method: "incrementCounter", args: [] });
  const result = await adapter.validateInput(input);
  assertEquals(result.valid, true);
});

test("EvmContractAdapter.validateInput rejects unknown method", async () => {
  const adapter = new EvmContractAdapter(TEST_CONFIG);
  const input = makeInput({ method: "doesNotExist", args: [] });
  const result = await adapter.validateInput(input);
  assertEquals(result.valid, false);
  assertEquals(
    result.error?.includes('Function "doesNotExist" not found in ABI'),
    true,
  );
});

test("EvmContractAdapter.validateInput enforces nonpayable value", async () => {
  const adapter = new EvmContractAdapter(TEST_CONFIG);
  const input = makeInput({
    method: "incrementCounter",
    args: [],
    value: "1",
  });
  const result = await adapter.validateInput(input);
  assertEquals(result.valid, false);
  assertEquals(
    result.error?.includes("nonpayable"),
    true,
  );
});

