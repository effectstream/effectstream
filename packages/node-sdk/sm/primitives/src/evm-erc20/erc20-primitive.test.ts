import { assertEquals, assertThrows } from "jsr:@std/assert";
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

Deno.test("Erc20Primitive - initializes correctly", () => {
  cleanup();
  const primitive = new Erc20Primitive({
    instanceName: "test-token",
    startBlockHeight: 100,
    contractAddress: MOCK_CONTRACT_ADDRESS,
    stateMachinePrefix: "transfer",
  });

  assertEquals(primitive.instanceName, "test-token");
  assertEquals(primitive.startBlockHeight, 100);
  assertEquals(primitive.contractAddress, MOCK_CONTRACT_ADDRESS);
  assertEquals(primitive.internalTypeName, PrimitiveTypeEVMERC20);
  
  const config = primitive.getConfig();
  assertEquals(config.name, "test-token");
  assertEquals(config.type, PrimitiveTypeEVMERC20);
  assertEquals(config.contractAddress, MOCK_CONTRACT_ADDRESS);
});

Deno.test("Erc20Primitive - throws on invalid address", () => {
  cleanup();
  assertThrows(() => {
    new Erc20Primitive({
      instanceName: "test-token",
      startBlockHeight: 100,
      contractAddress: "invalid-address" as EvmAddress,
      stateMachinePrefix: "transfer",
    });
  });
});

Deno.test("Erc20Primitive - getPayload generates correct state update", async () => {
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

    assertEquals(result.isBatched, false);
    assertEquals(result.data.length, 1);
    
    const item = result.data[0];
    assertEquals(item.accountingPayload.from, MOCK_FROM);
    assertEquals(item.accountingPayload.to, MOCK_TO);
    // Compare string values to handle BigInt vs String mismatches in JSON serialization simulation
    assertEquals(String(item.accountingPayload.value), String(MOCK_VALUE));
    
    assertEquals(Array.isArray(item.stateMachinePayload), true);
    // @ts-ignore: safe to access
    assertEquals(item.stateMachinePayload?.[0], "transfer");
  });
});

Deno.test("Erc20Primitive - getPayload skips state machine payload if no prefix", async () => {
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
      assertEquals(item.stateMachinePayload, null);
    });
  });
