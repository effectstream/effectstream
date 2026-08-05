import { test, expect } from "bun:test";
import { run } from "effection";
import type { ConfigSyncProtocolType, FlattenSyncProtocolIOFor } from "@effectstream/config";
import { SolanaProgramLogPrimitive } from "./../mod.ts";
import { PrimitiveRegistry } from "../../PrimitiveRegistry.ts";

const PROGRAM_ID = "11111111111111111111111111111111";
const PrimitiveTypeSolanaProgramLog = "SOLANA:ProgramLog";

function cleanup() {
  PrimitiveRegistry.primitives = {};
}

test("SolanaProgramLogPrimitive - initializes correctly", () => {
  cleanup();
  const primitive = new SolanaProgramLogPrimitive({
    instanceName: "spl",
    startBlockHeight: 0,
    programId: PROGRAM_ID,
    stateMachinePrefix: "solana-program-log",
  });

  expect(primitive.instanceName).toEqual("spl");
  expect(primitive.startBlockHeight).toEqual(0);
  expect(primitive.programId).toEqual(PROGRAM_ID);
  expect(primitive.internalTypeName).toEqual(PrimitiveTypeSolanaProgramLog);

  const config = primitive.getConfig();
  expect(config.name).toEqual("spl");
  expect(config.type).toEqual(PrimitiveTypeSolanaProgramLog);
  expect(config.programId).toEqual(PROGRAM_ID);
  expect(config.scheduledPrefix).toEqual("solana-program-log");
});

test("SolanaProgramLogPrimitive - getPayload generates correct state update", async () => {
  cleanup();
  const primitive = new SolanaProgramLogPrimitive({
    instanceName: "spl",
    startBlockHeight: 0,
    programId: PROGRAM_ID,
    stateMachinePrefix: "solana-program-log",
  });

  const mockTxData = {
    syncProtocol: {
      name: "parallelSolanaRPC",
      blockNumber: 42,
      transactionHash: "5x…signature",
      contractAddress: PROGRAM_ID,
    },
    output: {
      payloadType: "solana:transaction",
      payload: {
        programId: PROGRAM_ID,
        slot: 42,
        logMessages: ["Program log: hi", "Program log: bye"],
      },
    },
  } as unknown as FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.SOLANA_RPC_PARALLEL
  >;

  await run(function* () {
    const generator = primitive.getPayload(123, mockTxData);
    const result = generator.next().value;

    if (!result) throw new Error("No payload generated");
    if (!("isBatched" in result)) {
      throw new Error("Result is not a SyncStateUpdate");
    }

    expect(result.isBatched).toEqual(false);
    expect(result.data.length).toEqual(1);

    const item = result.data[0];
    expect(item.accountingPayload.slot).toEqual(42);
    expect(item.accountingPayload.programId).toEqual(PROGRAM_ID);
    expect(item.accountingPayload.logMessages).toEqual([
      "Program log: hi",
      "Program log: bye",
    ]);

    expect(Array.isArray(item.stateMachinePayload)).toEqual(true);
    // @ts-ignore: safe to access
    expect(item.stateMachinePayload?.[0]).toEqual("solana-program-log");
  });
});

test("SolanaProgramLogPrimitive - getPayload skips state machine payload if no prefix", async () => {
  cleanup();
  const primitive = new SolanaProgramLogPrimitive({
    instanceName: "spl",
    startBlockHeight: 0,
    programId: PROGRAM_ID,
    stateMachinePrefix: undefined,
  });

  const mockTxData = {
    syncProtocol: {
      name: "parallelSolanaRPC",
      blockNumber: 7,
      transactionHash: "sig",
      contractAddress: PROGRAM_ID,
    },
    output: {
      payload: {
        programId: PROGRAM_ID,
        slot: 7,
        logMessages: ["Program log: x"],
      },
    },
  } as unknown as FlattenSyncProtocolIOFor<
    ConfigSyncProtocolType.SOLANA_RPC_PARALLEL
  >;

  await run(function* () {
    const generator = primitive.getPayload(123, mockTxData);
    const result = generator.next().value;

    if (!result) throw new Error("No payload generated");
    if (!("isBatched" in result)) {
      throw new Error("Result is not a SyncStateUpdate");
    }

    const item = result.data[0];
    expect(item.stateMachinePayload).toEqual(null);
  });
});
