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
import { getConnection } from "@effectstream/db";
import { config } from "./config.ts";
import { grammar } from "./grammar.ts";

// ── Custom Counter Primitive ─────────────────────────────────────────────────
// Parses the Counter contract's `changedCount` event into one entry. The perf
// suite drives volume via Counter.bulkIncrement(n), which emits n such events
// per tx, so one tx ⇒ n entries.

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

// counter-stm: changedCount event -> one row in counter_results.
// Kept deliberately minimal (a single INSERT) so the measured throughput
// reflects the framework's fetch/parse/write pipeline, not app logic.
stm.addStateTransition("counter-stm", function* (data) {
  const { counter } = data.parsedInput;
  yield* World.promise(pool.query(
    "INSERT INTO counter_results (counter_value, block_height) VALUES ($1, $2)",
    [counter, data.blockHeight],
  ));
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
  console.log("Starting E2E Perf Node");

  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "e2e-perf",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      grammar,
      userDefinedPrimitives,
      dev: {
        applyDelayMs: parseInt(process.env["PERF_APPLY_DELAY_MS"] || "0", 10),
      },
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
