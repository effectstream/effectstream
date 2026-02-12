import { test, expect } from "bun:test";
import type { EvmAddress } from "@effectstream/utils";
import { run } from "effection";
import type { ConfigSyncProtocolType, FlattenSyncProtocolIOFor } from "@effectstream/config";
import { Erc20Primitive } from "./../mod.ts";
import { PaimaPrimitiveRegistry } from "../../PrimitiveRegistry.ts";

// Mock data
const MOCK_CONTRACT_ADDRESS = "0x1234567890123456789012345678901234567890" as EvmAddress;
const MOCK_FROM = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MOCK_TO = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const MOCK_VALUE = 100n; // bigint

const PrimitiveTypeEVMERC20 = "EVM:ERC20";

function cleanup() {
    // Reset registry between tests
    PaimaPrimitiveRegistry.primitives = {};
}

test("Erc20Primitive - initializes correctly", () => {
  cleanup();
  const primitive = new Erc20Primitive({
    instanceName: "test-token",
    startBlockHeight: 100,
    contractAddress: MOCK_CONTRACT_ADDRESS,
    stateMachinePrefix: "transfer",
  });

  expect(primitive.instanceName).toEqual("test-token");
  expect(primitive.startBlockHeight).toEqual(100);
  expect(primitive.contractAddress).toEqual(MOCK_CONTRACT_ADDRESS);
  expect(primitive.internalTypeName).toEqual(PrimitiveTypeEVMERC20);

  const config = primitive.getConfig();
  expect(config.name).toEqual("test-token");
  expect(config.type).toEqual(PrimitiveTypeEVMERC20);
  expect(config.contractAddress).toEqual(MOCK_CONTRACT_ADDRESS);
});

test("Erc20Primitive - throws on invalid address", () => {
  cleanup();
  expect(() => {
    new Erc20Primitive({
      instanceName: "test-token",
      startBlockHeight: 100,
      contractAddress: "invalid-address" as EvmAddress,
      stateMachinePrefix: "transfer",
    });
  }).toThrow();
});

test("Erc20Primitive - getPayload generates correct state update", async () => {
  cleanup();
  const primitive = new Erc20Primitive({
    instanceName: "test-token",
    startBlockHeight: 100,
    contractAddress: MOCK_CONTRACT_ADDRESS,
    stateMachinePrefix: "transfer",
  });

  const mockTxData = {
    output: {
      payload: {
        from: MOCK_FROM,
        to: MOCK_TO,
        value: MOCK_VALUE,
      },
    },
  } as unknown as FlattenSyncProtocolIOFor<ConfigSyncProtocolType.EVM_RPC_PARALLEL>;

  await run(function* () {
    const generator = primitive.getPayload(123, mockTxData);
    const result = generator.next().value;

    if (!result) throw new Error("No payload generated");
    if (!('isBatched' in result)) throw new Error("Result is not a SyncStateUpdate");

    expect(result.isBatched).toEqual(false);
    expect(result.data.length).toEqual(1);

    const item = result.data[0];
    expect(item.accountingPayload.from).toEqual(MOCK_FROM);
    expect(item.accountingPayload.to).toEqual(MOCK_TO);
    // Compare string values to handle BigInt vs String mismatches in JSON serialization simulation
    expect(String(item.accountingPayload.value)).toEqual(String(MOCK_VALUE));

    expect(Array.isArray(item.stateMachinePayload)).toEqual(true);
    // @ts-ignore: safe to access
    expect(item.stateMachinePayload?.[0]).toEqual("transfer");
  });
});

test("Erc20Primitive - getPayload skips state machine payload if no prefix", async () => {
    cleanup();
    const primitive = new Erc20Primitive({
      instanceName: "test-token",
      startBlockHeight: 100,
      contractAddress: MOCK_CONTRACT_ADDRESS,
      stateMachinePrefix: undefined,
    });

    const mockTxData = {
      output: {
        payload: {
          from: MOCK_FROM,
          to: MOCK_TO,
          value: MOCK_VALUE,
        },
      },
    } as unknown as FlattenSyncProtocolIOFor<ConfigSyncProtocolType.EVM_RPC_PARALLEL>;

    await run(function* () {
      const generator = primitive.getPayload(123, mockTxData);
      const result = generator.next().value;

      if (!result) throw new Error("No payload generated");
      if (!('isBatched' in result)) throw new Error("Result is not a SyncStateUpdate");

      const item = result.data[0];
      expect(item.stateMachinePayload).toEqual(null);
    });
  });
