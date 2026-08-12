import {
  init,
  start,
  type StartConfigAppStateTransitions,
} from "@effectstream/runtime";
import { ENV } from "@effectstream/utils/node-env";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { SyncStateUpdateStream } from "@effectstream/coroutine";
import { World } from "@effectstream/coroutine";
import { Type } from "@sinclair/typebox";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import {
  type AddressAndType,
  AddressType,
  type EvmAddress,
  type EffectstreamBlockNumber,
  TypeboxHelpers,
  type StaticDecode,
} from "@effectstream/utils";
import { type JsonObject, Primitive } from "@effectstream/sm";
import { Value } from "@sinclair/typebox/value";
import {
  type CommandTuple,
  generateRawStmInput,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { getEvmEvent } from "@effectstream/config";

import { migrationTable } from "@e2e/evm-database";
import { getConnection, createScheduledData } from "@effectstream/db";
import { config } from "./config.ts";
import { grammar } from "./grammar.ts";
import { AddressType as AddressTypeUtil } from "@effectstream/utils";

// ── Custom Counter Primitive ─────────────────────────────────────────────────

const counterAbi = [
  {
    type: "event",
    name: "changedCount",
    inputs: [
      { name: "userAddress", type: "address", indexed: true, internalType: "address" },
      { name: "count", type: "int256", indexed: false, internalType: "int256" },
    ],
    anonymous: false,
  },
] as const;

const counterGrammar = [
  ["counter", Type.Number()],
] as const;

class EvmCounterPrimitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof counterGrammar
> {
  readonly internalTypeName = "EVM:CUSTOM-COUNTER";
  readonly abi: ReturnType<typeof getEvmEvent> = getEvmEvent(
    counterAbi,
    "changedCount(address,int256)",
  );
  override grammar = counterGrammar;
  readonly contractAddress: EvmAddress;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.contractAddress = Value.Decode(
      TypeboxHelpers.Evm.Address,
      config.contractAddress,
    );
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    primitiveTransactionData: FlattenSyncProtocolIOFor<
      ConfigSyncProtocolType.EVM_RPC_PARALLEL
    >,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload:
        | StaticDecode<CommandTuple<string, typeof counterGrammar>>
        | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { userAddress, count } = primitiveTransactionData.output.payload;
    const userAddressParsed = Value.Decode(
      TypeboxHelpers.Evm.Address,
      userAddress.toLowerCase(),
    );
    const countParsed = BigInt(count);
    const counterNumber = countParsed >= 0n
      ? Number(countParsed)
      : -Number(-countParsed);

    const accountingPayload: ParamToData<typeof counterGrammar> = {
      counter: counterNumber,
    };
    const stateMachinePayload:
      | StaticDecode<CommandTuple<string, typeof this.grammar>>
      | null = this.stateMachinePrefix
        ? generateRawStmInput(
          this.grammar,
          this.stateMachinePrefix,
          accountingPayload,
        )
        : null;

    return {
      isBatched: false,
      data: [
        {
          fromAddressAndType: {
            type: AddressType.EVM,
            address: userAddressParsed,
          },
          accountingPayload,
          stateMachinePayload,
        },
      ],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[
    ConfigSyncProtocolType.EVM_RPC_PARALLEL
  ] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
      scheduledPrefix: this.stateMachinePrefix,
    } as const;
  }

  override getIntermediatePrefix(): string[] {
    return [];
  }

  override getViewPrefix(): string[] {
    return [];
  }

  override getDynamicTables = (name: string): string | undefined => {
    return undefined;
  };
}

const userDefinedPrimitives = {
  "EVM:CUSTOM-COUNTER": EvmCounterPrimitive,
};

// ── State Machine ────────────────────────────────────────────────────────────

const stm = new Stm<typeof grammar, {}>(grammar);

const pool = getConnection();

// EffectstreamL2: ["add", "a", "b"] -> STM computes a+b and writes to game_results
stm.addStateTransition("add", function* (data) {
  const { a, b } = data.parsedInput;
  const result = a + b;
  console.log(`[STM] add: ${a} + ${b} = ${result}`);
  yield* World.promise(pool.query(
    "INSERT INTO game_results (a, b, result, block_height) VALUES ($1, $2, $3, $4)",
    [a, b, result, data.blockHeight],
  ));
});

// ERC20: Transfer event -> writes to erc20_transfers
stm.addStateTransition("transfer-erc20", function* (data) {
  const { to, from, value } = data.parsedInput;
  console.log(`[STM] ERC20 transfer: ${value} from ${from} to ${to}`);
  yield* World.promise(pool.query(
    "INSERT INTO erc20_transfers (from_addr, to_addr, value, block_height) VALUES ($1, $2, $3, $4)",
    [from, to, String(value), data.blockHeight],
  ));
});

// ERC721: Transfer event -> writes to erc721_transfers
stm.addStateTransition("transfer-assets", function* (data) {
  const { to, from, tokenId } = data.parsedInput;
  console.log(`[STM] ERC721 transfer: token#${tokenId} from ${from} to ${to}`);
  yield* World.promise(pool.query(
    "INSERT INTO erc721_transfers (from_addr, to_addr, token_id, block_height) VALUES ($1, $2, $3, $4)",
    [from, to, String(tokenId), data.blockHeight],
  ));
});

// ERC1155: TransferSingle event -> writes to erc1155_transfers
stm.addStateTransition("transfer-erc1155", function* (data) {
  const { to, from, tokenId, amount } = data.parsedInput;
  console.log(`[STM] ERC1155 transfer: ${amount}x token#${tokenId} from ${from} to ${to}`);
  yield* World.promise(pool.query(
    "INSERT INTO erc1155_transfers (from_addr, to_addr, token_id, amount, block_height) VALUES ($1, $2, $3, $4, $5)",
    [from, to, String(tokenId), String(amount), data.blockHeight],
  ));
});

// Counter: changedCount event -> writes to counter_results
stm.addStateTransition("counter-stm", function* (data) {
  const { counter } = data.parsedInput;
  console.log(`[STM] counter: ${counter}`);
  yield* World.promise(pool.query(
    "INSERT INTO counter_results (counter_value, block_height) VALUES ($1, $2)",
    [counter, data.blockHeight],
  ));
});

// attack: writes to user_state_machine table
stm.addStateTransition("attack", function* (data) {
  const { playerId, moveId } = data.parsedInput;
  const msg = `attack playerId: ${playerId} with moveId: ${moveId}`;
  console.log(`[STM] ${msg}`);
  yield* World.promise(pool.query(
    "INSERT INTO user_state_machine (inputs, block_height) VALUES ($1, $2)",
    [msg, data.blockHeight],
  ));
});

// schedule: creates scheduled data for a future block or timestamp
stm.addStateTransition("schedule", function* (data) {
  const { tick, message, type } = data.parsedInput;
  const playerId = parseInt(message);
  const inputData = JSON.stringify(["attack", playerId, 1]);

  if (type === "block") {
    yield* createScheduledData(inputData, { blockHeight: data.blockHeight + tick }, {
      precompile: "0x0" as any,
    });
  } else {
    yield* createScheduledData(inputData, { timestamp: (data.blockTimestamp + tick) as any }, {
      precompile: "0x0" as any,
    });
  }
});

// throw_error: intentionally throws to test error resilience
stm.addStateTransition("throw_error", function* (_data) {
  throw new Error("This is a test error");
});

const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting E2E EVM Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-evm",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      grammar,
      userDefinedPrimitives,
      // Snapshots are opt-in: only enabled when EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS is set.
      snapshotConfig: ENV.EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS != null
        ? {
            intervalSeconds: ENV.EFFECTSTREAM_SNAPSHOT_INTERVAL_SECONDS,
            path: ENV.EFFECTSTREAM_SNAPSHOT_PATH,
            retention: {
              lastDayHourly: ENV.EFFECTSTREAM_SNAPSHOT_LAST_DAY_HOURLY,
              last3DaysSixHourly: ENV.EFFECTSTREAM_SNAPSHOT_LAST_3_DAYS_SIX_HOURLY,
              lastNDaysDaily: ENV.EFFECTSTREAM_SNAPSHOT_LAST_N_DAYS,
            },
          }
        : undefined,
    });
  });

  yield* suspend();
});
