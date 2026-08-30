import {
  ConfigNetworkType,
  ConfigSyncProtocolType,
  type LedgerFieldType,
  type LedgerSchema,
  type SyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { World, type SyncStateUpdateStream } from "@effectstream/coroutine";
import {
  startPglite,
  type PgliteHandle,
} from "@effectstream/db/start-pglite";
import {
  init,
  start,
  type StartConfigApiRouter,
  type StartConfigGameStateTransitions,
  type VERSION,
} from "@effectstream/runtime";
import { Stm, type BaseStfInput } from "@effectstream/sm";
import { PrimitiveTypeMidnightGeneric } from "@effectstream/sm/builtin";
import { builtinGrammars } from "@effectstream/sm/grammar";
import { call, ensure, run } from "effection";

export type MidnightNetwork = "preview" | "preprod";

export type PgliteOptions = {
  /** `memory://` starts a fresh watch each time; a path resumes after restart. */
  dataDir?: string;
  /** TCP gateway port. Zero asks the OS for a free port. */
  port?: number;
};

export type PgliteDatabase = Readonly<{
  kind: "pglite";
  dataDir: string;
  port: number;
}>;

/** Configure the embedded database that `runNode` owns and closes. */
export function pglite(options: PgliteOptions = {}): PgliteDatabase {
  return {
    kind: "pglite",
    dataDir: options.dataDir ?? "memory://",
    port: options.port ?? 0,
  };
}

type LedgerValue<Field extends LedgerFieldType> =
  Field extends { type: "option"; value: infer Value extends LedgerFieldType }
    ? LedgerValue<Value> | null
    : Field extends { type: "map"; value: infer Value extends LedgerFieldType }
      ? Record<string, LedgerValue<Value>>
      : Field extends "boolean" ? boolean
      : string;

export type LedgerState<Schema extends LedgerSchema> = {
  [Field in keyof Schema]: LedgerValue<Schema[Field]>;
};

export type MidnightContractOptions<Schema extends LedgerSchema> = {
  network: MidnightNetwork;
  address: string;
  startBlockHeight: "latest" | number;
  ledger: Schema;
  /** Override the hosted v4 endpoint, mainly for compatible private indexers. */
  indexer?: string;
};

export type MidnightContractSource<Schema extends LedgerSchema> = Readonly<{
  kind: "midnight-contract";
  network: MidnightNetwork;
  address: string;
  startBlockHeight: "latest" | number;
  ledger: Schema;
  indexer: string;
}>;

/** Declare a read-only Midnight contract source without generated Compact code. */
export function midnightContract<const Schema extends LedgerSchema>(
  options: MidnightContractOptions<Schema>,
): MidnightContractSource<Schema> {
  const address = options.address.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(address)) {
    throw new Error("A Midnight contract address must contain exactly 64 hexadecimal characters.");
  }
  if (
    options.startBlockHeight !== "latest" &&
    (!Number.isSafeInteger(options.startBlockHeight) || options.startBlockHeight < 0)
  ) {
    throw new Error("startBlockHeight must be \"latest\" or a non-negative safe integer.");
  }
  if (Object.keys(options.ledger).length === 0) {
    throw new Error("A Midnight ledger schema must declare at least one field.");
  }
  for (const [name, field] of Object.entries(options.ledger)) {
    validateLedgerField(field, name);
  }

  return {
    kind: "midnight-contract",
    network: options.network,
    address,
    startBlockHeight: options.startBlockHeight,
    ledger: options.ledger,
    indexer: options.indexer ?? midnightIndexer(options.network),
  };
}

export type MidnightTransition<Schema extends LedgerSchema> = (event: {
  state: LedgerState<Schema>;
  blockHeight: number;
  blockTimestamp: number;
  network: MidnightNetwork;
  address: string;
}) => void | Promise<void>;

type AnyMidnightSource = MidnightContractSource<LedgerSchema>;
type TransitionFor<Source> = Source extends MidnightContractSource<infer Schema>
  ? MidnightTransition<Schema>
  : never;

export type RunNodeOptions<
  Sources extends Record<string, AnyMidnightSource>,
> = {
  appName: string;
  appVersion?: VERSION;
  apiPort?: number;
  database: PgliteDatabase;
  sources: Sources;
  transitions: { [Name in keyof Sources]: TransitionFor<Sources[Name]> };
  api?: StartConfigApiRouter;
};

/**
 * Run the database, Effectstream runtime, named sources, transitions, and API
 * in this process. SIGINT/SIGTERM halt the task and close owned resources.
 */
export async function runNode<
  const Sources extends Record<string, AnyMidnightSource>,
>(options: RunNodeOptions<Sources>): Promise<void> {
  if (options.database.kind !== "pglite") {
    throw new Error("runNode currently requires the database returned by pglite().");
  }
  validateName(options.appName, "appName");

  const sourceEntries = Object.entries(options.sources) as [
    keyof Sources & string,
    AnyMidnightSource,
  ][];
  if (sourceEntries.length === 0) {
    throw new Error("runNode requires at least one source.");
  }
  for (const [name, source] of sourceEntries) {
    validateName(name, "source name");
    if (name === "clock") throw new Error('The source name "clock" is reserved.');
    if (source.kind !== "midnight-contract") {
      throw new Error(`Unsupported source kind for "${name}".`);
    }
    if (typeof options.transitions[name] !== "function") {
      throw new Error(`Source "${name}" requires a matching transition.`);
    }
  }

  const restoreEnvironment = applyEnvironment({
    PGLITE: "true",
    PGLITE_DATA_DIR: options.database.dataDir,
    DB_HOST: "127.0.0.1",
    DB_USER: "postgres",
    DB_NAME: "postgres",
    EFFECTSTREAM_API_PORT: String(options.apiPort ?? 9999),
    MQTT_BROKER: "false",
  });

  let database: PgliteHandle | undefined;
  let task: ReturnType<typeof run<void>> | undefined;
  let signalHandler: (() => void) | undefined;
  let shutdownRequested = false;
  try {
    database = await startPglite(options.database.port);
    process.env.DB_PORT = String(database.port);
    await database.db.waitReady;

    const grammar = Object.fromEntries(
      sourceEntries.map(([name]) => [name, builtinGrammars.midnightGeneric]),
    );
    const stm = new Stm(grammar as any);

    for (const [name, source] of sourceEntries) {
      (stm.addStateTransition as any)(name, function* (data: any) {
        const result = options.transitions[name]({
          state: data.parsedInput.payload,
          blockHeight: Number(data.blockHeight),
          blockTimestamp: Number(data.blockTimestamp),
          network: source.network,
          address: source.address,
        });
        if (isPromiseLike(result)) yield* World.promise(result);
      });
    }

    const gameStateTransitions: StartConfigGameStateTransitions = function* (
      _blockHeight: number,
      input: BaseStfInput,
    ): SyncStateUpdateStream<void> {
      yield* stm.processInput(input);
    };
    const syncInfo = makeSyncInfo(sourceEntries);
    const staticConfig = {
      securityNamespace: options.appName,
      allNetworks: { viemNetworks: {} },
    };
    const ownedDatabase = database;

    task = run(function* () {
      yield* ensure(function* () {
        yield* call(() => ownedDatabase.close({ force: true }));
      });
      yield* init();
      yield* withEffectstreamStaticConfig(staticConfig, function* () {
        yield* start({
          appName: options.appName,
          appVersion: options.appVersion ?? "1.0.0",
          syncInfo,
          grammar: grammar as any,
          gameStateTransitions,
          apiRouter: options.api,
          events: false,
        });
      });
    });

    signalHandler = () => {
      shutdownRequested = true;
      void task?.halt().catch((error) => {
        console.error("Effectstream shutdown failed:", error);
      });
    };
    process.once("SIGINT", signalHandler);
    process.once("SIGTERM", signalHandler);
    try {
      await task;
    } catch (error) {
      if (!shutdownRequested || (error as Error).message !== "halted") throw error;
    }
  } finally {
    if (signalHandler) {
      process.off("SIGINT", signalHandler);
      process.off("SIGTERM", signalHandler);
    }
    if (!task && database) await database.close({ force: true });
    restoreEnvironment();
  }
}

/**
 * Build the runtime's sync configuration.
 *
 * Start boundaries are NOT resolved here. Every declared start — a number or
 * the `"latest"` sentinel — is passed through verbatim, and the generic runtime
 * (`@effectstream/runtime` `config-snapshot.ts`) resolves `"latest"` once via
 * the protocol's own start policy, commits the numeric boundary plus its
 * provenance, and reuses the committed value on every restart.
 *
 * The clock's `startTime` is likewise sampled fresh on every boot: the NTP
 * start policy restores the saved value from the config snapshot, so the
 * time→block mapping of an existing database is preserved without this facade
 * pre-reading the database itself.
 */
function makeSyncInfo(
  sources: [string, AnyMidnightSource][],
): SyncProtocolWithNetwork[] {
  const clock = {
    networkType: ConfigNetworkType.NTP,
    syncProtocolType: ConfigSyncProtocolType.NTP_MAIN,
    network: {
      name: "clock",
      type: ConfigNetworkType.NTP,
      startTime: Date.now(),
      blockTimeMS: 1_000,
    },
    syncProtocol: {
      name: "clock",
      type: ConfigSyncProtocolType.NTP_MAIN,
      startBlockHeight: 1,
      stopBlockHeight: null,
      pollingInterval: 1_000,
      requestTimeoutMs: 15_000,
      stepSize: 1_000,
    },
    primitives: [],
  };

  return [clock, ...sources.map(([name, source]) => {
    const protocolName = protocolNameFor(name);
    return {
      networkType: ConfigNetworkType.MIDNIGHT,
      syncProtocolType: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
      network: {
        name: protocolName,
        type: ConfigNetworkType.MIDNIGHT,
        networkId: source.network,
      },
      syncProtocol: {
        name: protocolName,
        type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
        indexer: source.indexer,
        startBlockHeight: source.startBlockHeight,
        stopBlockHeight: null,
        pollingInterval: 1_000,
        requestTimeoutMs: 15_000,
        stepSize: 10,
        paginationLimit: 50,
        confirmationDepth: 3,
        delayMs: 20_000,
      },
      // The primitive declares no start of its own: it inherits the protocol's
      // committed numeric boundary in the runtime (FR-007).
      primitives: [{
        id: name,
        syncProtocol: protocolName,
        primitive: {
          name,
          type: PrimitiveTypeMidnightGeneric,
          contractAddress: source.address,
          stateMachinePrefix: name,
          ledgerSchema: source.ledger,
          networkId: source.network,
        },
      }],
    };
  })] as unknown as SyncProtocolWithNetwork[];
}

function midnightIndexer(network: MidnightNetwork): string {
  return `https://indexer.${network}.midnight.network/api/v4/graphql`;
}

function protocolNameFor(sourceName: string): string {
  return `midnight-${sourceName}`;
}

function validateName(value: string, label: string): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error(`${label} must start with a letter and contain only letters, numbers, _ or -.`);
  }
}

function validateLedgerField(field: LedgerFieldType, path: string): void {
  if (typeof field === "string") {
    if (["uint8", "uint16", "uint32", "uint64", "uint128", "bytes", "boolean"].includes(field)) {
      return;
    }
    throw new Error(`Unsupported ledger type at "${path}": ${field}.`);
  }
  if (field.type === "map" || field.type === "option") {
    validateLedgerField(field.value, path);
    return;
  }
  throw new Error(`Unsupported ledger type at "${path}".`);
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return !!value && typeof (value as Promise<void>).then === "function";
}

function applyEnvironment(values: Record<string, string>): () => void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  previous.set("DB_PORT", process.env.DB_PORT);
  return () => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}
