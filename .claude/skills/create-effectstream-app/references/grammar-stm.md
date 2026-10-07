# Grammar, State Machine, Events, and Custom Primitives

This file covers the `packages/node/` core: `grammar.ts`, `state-machine.ts`, `api.ts`, `main.dev.ts`, custom events, and custom primitives.

> **See also (concept docs).** For the "what is" and "why" — these are authoritative:
> - State machine concept + STF determinism: `docs/site/docs/home/100-components/102-state-machine.md`, `docs/site/docs/home/500-packages/520-node/sm.md`
> - Grammar concept incl. built-in `&`-prefixed system commands (RESERVED — do not shadow with custom keys): `docs/site/docs/home/100-components/111-grammar.md`
> - Built-in primitives catalog (full payload field tables per chain): `docs/site/docs/home/100-components/118-primitives.md`
> - API surface incl. built-in `/health`, `/block-heights`, `/addresses`, `/scheduled-data`, `/tables/:name`, `/primitives/:name`, `/rpc/evm`, `/grammar`, OpenAPI `/documentation`: `docs/site/docs/home/100-components/103-api.md`
> - Node startup + `init` + `start` + `withEffectstreamStaticConfig`: `docs/site/docs/home/100-components/117-node-startup.md`, `docs/site/docs/home/500-packages/520-node/runtime.md`
> - Deterministic randomness (`data.randomGenerator`, Prando, call-order matters): `docs/site/docs/home/100-components/113-randomness.md`
> - Sync service / ConfigBuilder / NTP_MAIN heartbeat concept: `docs/site/docs/home/100-components/101-sync-service.md`
> - L2 contract surface (`effectstreamSubmitGameInput`, batched inputs `&B`): `docs/site/docs/home/100-components/104-l2-contract.md`
> - Accounts abstraction (`&createAccount`, `&linkAddress`, primary address): `docs/site/docs/home/100-components/116-accounts.md`

## 1. Grammar (`grammar.ts`)

Defines all actions the state machine can process. Each key maps to a built-in grammar (chain event primitives) or a list of `[name, TypeboxSchema]` tuples (custom actions).

```ts
import { Type } from "@sinclair/typebox";
import type { GrammarDefinition } from "@effectstream/concise";
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  // Custom actions (submitted via EffectstreamL2 contract or batcher)
  createRoom: [
    ["roomName", Type.String({ maxLength: 32 })],
    ["maxPlayers", Type.Number({ minimum: 2, maximum: 8 })],
  ],

  // Built-in grammars for chain events → STM
  nftTransfer: builtinGrammars.evmErc721,
  tokenTransfer: builtinGrammars.evmErc20,
} as const satisfies GrammarDefinition;
```

**Wire format.** When submitting via `effectstreamSubmitGameInput` (or through the batcher), the JSON payload is `["grammarKey", value1, value2, ...]`. The first element must be the exact grammar object key (e.g. `"createRoom"`, not a short alias `"c"`); subsequent values should use proper JS types matching the Typebox schema. (Parsing runs TypeBox `Value.Parse`, whose Convert step coerces near-misses like `"4"` → `4` for `Type.Number()` — but don't lean on coercion; send the real types.)

> **`&`-prefixed keys are reserved for engine system commands** — `&B` (batched inputs), `&createAccount`, `&linkAddress`, `&unlinkAddress`. Never declare a custom grammar key that starts with `&`; it will collide with the engine. See `docs/site/docs/home/100-components/104-l2-contract.md`, `docs/site/docs/home/100-components/111-grammar.md`, and `docs/site/docs/home/100-components/116-accounts.md`.

### Built-in grammars (`@effectstream/sm/grammar`)

| Grammar key | Chain | Use |
|---|---|---|
| `evmErc20` | EVM | ERC-20 Transfer events (`{ from, to, value }`) |
| `evmErc721` | EVM | ERC-721 Transfer events (`{ from, to, tokenId, isBurn }`) |
| `evmErc1155` | EVM | ERC-1155 TransferSingle/TransferBatch (`{ type, from, to, tokenId, amount, isMint, isBurn, operator }`) |
| `midnightGeneric` | Midnight | Generic ledger contract state (`{ payload }`) |
| `midnightTokenMint` | Midnight | Token mint/burn events (`{ contractAddress, domainSep, rawTokenType, kind, amount, txHash, entryPoint }`) |
| `bitcoinAddress` | Bitcoin | Address transaction events |
| `utxorpcGeneric` | Cardano | Generic UTXO events |
| `cardanoMintBurn` | Cardano | Mint/burn (`{ txId, metadata, assets, inputAddresses, outputAddresses }`) |
| `cardanoTransfer` | Cardano | ADA/token transfers |
| `cardanoPoolDelegation` | Cardano | Stake delegation certs (`{ address, pool, epoch }`) |
| `cardanoDelayedAsset` | Cardano | Delayed asset claims |
| `cardanoProjectedNft` | Cardano | Projected NFT state |
| `availGeneric` | Avail | Application data submissions |
| `celestiaGeneric` | Celestia | Blob data events |
| `nearNep141` | NEAR | NEP-141 fungible token events |
| `nearNep171` | NEAR | NEP-171 NFT events |
| `nearNep245` | NEAR | NEP-245 multi-token events |
| `nearIntent` | NEAR | DIP-4 intent events |
| `nearGeneric` | NEAR | NEP-297 generic events |
| `nearAccountWatch` | NEAR | Function call tracking |
| `solanaProgramLog` | Solana | Program log messages (`{ slot, programId, logMessages }`) |
| `solanaAccountBalance` | Solana | Account lamport balance changes (`{ address, lamports, slot }`) |
| `solanaTokenAccount` | Solana | SPL token account state (`{ tokenAccount, mint, owner, amount, decimals, slot }`) |

## 2. State Machine (`state-machine.ts`)

Each grammar key maps to a state transition via `Stm.addStateTransition`. Transitions are generator functions that use `World.resolve` for typed queries and `World.promise` for raw async operations.

The STM owns deterministic transitions, scheduling, and every database effect. Do not recreate the legacy generic `game-logic` package, `tick.ts`, or round/match executor layers. Pure deterministic domain rules may stay beside the STM or, when multiple runtimes genuinely consume them, live in a purpose-named package such as `packages/chess-rules`. **All DB access uses pgtyped `PreparedQuery` exports from `@my-template/database`.**

```ts
import { Stm } from "@effectstream/sm";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import { insertRoom, insertOwnership } from "@my-template/database";
import { grammar } from "./grammar.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("createRoom", function* (data) {
  const { blockHeight, parsedInput, signerAddress: user } = data;
  // parsedInput is typed: { roomName: string, maxPlayers: number }
  yield* World.resolve(insertRoom, {
    room_name: parsedInput.roomName,
    max_players: parsedInput.maxPlayers,
    creator: user!,
    block_height: blockHeight,
  });
});

stm.addStateTransition("nftTransfer", function* (data) {
  const { to, tokenId } = data.parsedInput;
  yield* World.resolve(insertOwnership, {
    token_id: tokenId,
    owner: to,
    block_height: data.blockHeight,
  });
});

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
```

### Transition `data` fields

| Field | Description |
|---|---|
| `parsedInput` | Typed fields from the grammar |
| `blockHeight` | Block number this input was indexed at |
| `blockTimestamp` | Unix timestamp of the block |
| `signerAddress` | Wallet address that signed the transaction |
| `randomGenerator` | Deterministic PRNG (Prando) seeded by block hash. **Calls are stateful** — order matters across transitions in the same block, so don't reorder them defensively. Full contract: `docs/site/docs/home/100-components/113-randomness.md`. |
| `emit(event, payload)` | Emit a custom app event — see §3 |

## 3. Custom Events

Typed events declared in the STM and consumed in the frontend via MQTT. Two guarantees:

1. **Post-COMMIT delivery** — when a subscriber receives an event, a follow-up API query will see the rows the STF wrote. The frontend never races ahead of the database.
2. **Drop on rollback** — events emitted by an STF that throws (or by a block that fails to commit) are never published. No ghost events.

A purpose-specific `@my-template/app-events` package keeps event declarations in one place when both the state machine and frontend consume them. Do not create a generic `shared` package.

### Declare (`packages/app-events/app-events.ts`)

```ts
import { Type } from "@sinclair/typebox";
import { genEvent, registerEvents } from "@effectstream/event-client";

export const AppEvents = registerEvents({
  RoomCreated: genEvent({
    name: "RoomCreated",
    fields: [
      { name: "roomId",   type: Type.Integer(), indexed: true  },
      { name: "creator",  type: Type.String(),  indexed: true  },
      { name: "roomName", type: Type.String() },
      { name: "maxPlayers", type: Type.Number() },
    ],
  }),
});
```

`registerEvents` auto-prepends `blockHeight` as the first indexed field — apps never set it. Topic shape: `app/{topicHash}/{blockHeight}/{roomId}/{creator}`. Indexed fields of complex types are auto-hashed for MQTT compatibility.

```json
{
  "name": "@my-template/app-events",
  "version": "1.0.0",
  "exports": { ".": "./app-events.ts" },
  "dependencies": {
    "@effectstream/event-client": "<EFFECTSTREAM_VERSION_FROM_NPM>",
    "@sinclair/typebox": "0.34.41"
  }
}
```

### Emit (in STM transition)

```ts
import { AppEvents } from "@my-template/app-events";

stm.addStateTransition("createRoom", function* (data) {
  const { roomName, maxPlayers } = data.parsedInput;
  const [{ id: roomId }] = yield* World.resolve(insertRoom, { /* … */ });

  // Buffered now, published to MQTT after this block's COMMIT.
  // If the STF throws below, this event is dropped along with the DB writes.
  data.emit(AppEvents.RoomCreated, {
    roomId, creator: data.signerAddress!, roomName, maxPlayers,
  });
});
```

`data.emit` runs synchronously and never throws. The runtime promotes a per-input buffer → per-block buffer on STF success, drops on failure, flushes to MQTT after block COMMIT.

### Subscribe (in frontend)

```tsx
import { EventManager } from "@effectstream/event-client";
import { AppEvents } from "@my-template/app-events";

useEffect(() => {
  if (!walletAddress) return;
  let sym: symbol | undefined;
  let cancelled = false;
  EventManager.Instance.subscribe(
    {
      topic: AppEvents.RoomCreated,
      filter: {
        creator: walletAddress.toLowerCase(), // narrow to me
        roomId: undefined,                     // wildcard
        blockHeight: undefined,                // wildcard
      },
    },
    (event) => {
      console.log(`Room ${event.roomId} (${event.roomName}) at block ${event.blockHeight}`);
      setRefreshKey((k) => k + 1);
    },
  ).then((s) => { cancelled ? EventManager.Instance.unsubscribe(s) : (sym = s); });
  return () => { cancelled = true; if (sym) EventManager.Instance.unsubscribe(sym); };
}, [walletAddress]);
```

Set fields to `undefined` to wildcard (MQTT `+`); supply a value to narrow.

**Durability.** Events are live notifications, not a persistent log. A subscriber that connects after a block finalized will not see past events. Use the API to query DB state for replay.

**Replay.** If the engine re-syncs from genesis (e.g. after a reset), every STF re-runs and every event re-emits. Subscribers should be idempotent — treat events as "refresh this view" signals.

## 4. API Routes (`api.ts`)

> **The API is GET-only by default.** Every write to the DB must flow through the STM (on-chain tx → primitive → grammar → transition → DB write). That's what keeps the system deterministic: every full re-sync replays the same chain inputs and reaches the same state. A `POST /api/createRoom` that inserts a row directly **breaks determinism** — the row exists in the live DB but not in any replay, so a snapshot restore or a Phase B test will see the system diverge.
>
> Only add `POST` / `PATCH` / `DELETE` routes if the user **explicitly requests** them, and even then treat the route as an escape hatch: limit it to ephemeral state that doesn't need to be replayed (e.g. session tokens, off-chain analytics that the user has accepted will not survive a resync). Document in a comment why the route is non-deterministic-safe. If the user wants to "let the frontend create rooms," the right answer is almost always *route through the chain* (or through the batcher) — not a write API.

```ts
import { runPreparedQuery } from "@effectstream/db";
import { getRooms } from "@my-template/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // GET-only: reads from the DB that the STM populated.
  server.get("/api/rooms", async (_req, reply) => {
    const result = await runPreparedQuery(
      getRooms.run(undefined, dbConn),
      "/api/rooms",
    );
    reply.send(result);
  });
};
```

No raw SQL strings. All access via pgtyped-generated queries through `runPreparedQuery`.

The engine also ships several **built-in `/api/*` endpoints** the runtime serves automatically — don't re-implement them: `/health`, `/block-heights`, `/addresses`, `/scheduled-data`, `/tables/:name`, `/primitives/:name`, `/rpc/evm`, `/grammar`, plus an OpenAPI explorer at `/documentation`. See `docs/site/docs/home/100-components/103-api.md`.

## 5. Entry Point (`main.dev.ts`)

```ts
import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@effectstream/config";
import { config } from "./config.dev.ts";
import { grammar } from "./grammar.ts";
import { appStateTransitions } from "./state-machine.ts";
import { apiRouter } from "./api.ts";
import { migrationTable } from "@my-template/database";

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "my-template",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(config),
      appStateTransitions,
      migrations: migrationTable,
      apiRouter,
      grammar,
    });
  });
  yield* suspend();
});
```

### `StartConfig` fields

| Field | Required | Description |
|---|---|---|
| `appName` | Yes | Application identifier |
| `appVersion` | Yes | Semantic version (`"1.0.0"`) |
| `syncInfo` | Yes | From `toSyncProtocolWithNetwork(config)` |
| `appStateTransitions` | No¹ | The STM router function |
| `migrations` | No¹ | SQL migration table |
| `grammar` | No¹ | Grammar definition |
| `apiRouter` | No | Fastify route registration |
| `userDefinedPrimitives` | No | Custom primitive constructors (see §7) |
| `snapshotConfig` | No | Periodic DB snapshot settings |

¹ Optional in the `StartConfig` type (`packages/node-sdk/runtime/src/types.ts`), but a real app is inert without them — always provide all three.

## 6. Config (`config.dev.ts`)

Uses `ConfigBuilder` — networks → deployments → sync protocols → primitives.

```ts
import { contractAddressesEvmMain } from "@my-template/contracts-evm";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { PrimitiveTypeEVMEffectstreamL2, PrimitiveTypeEVMERC721 } from "@effectstream/sm/builtin";
import { hardhat } from "viem/chains";

export const config = new ConfigBuilder()
  .setNamespace((b) => b.setSecurityNamespace("my-template"))
  .buildNetworks((b) => b
    .addNetwork({
      name: "ntp",
      type: ConfigNetworkType.NTP,
      startTime: new Date().getTime(),
      blockTimeMS: 1000,
    })
    .addViemNetwork({ ...hardhat, name: "evmMain" })
  )
  .buildDeployments((b) => b
    .addDeployment(
      (n) => n.evmMain,
      () => ({
        name: "Erc721DevModule#Erc721Dev",
        address: contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"],
      }),
    )
  )
  .buildSyncProtocols((b) => b
    .addMain((n) => n.ntp, () => ({
      name: "mainNtp",
      type: ConfigSyncProtocolType.NTP_MAIN,
      chainUri: "",
      startBlockHeight: 1,
      pollingInterval: 1000,
    }))
    .addParallel((n) => n.evmMain, (network) => ({
      name: "parallelEvmRPC",
      type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
      chainUri: network.rpcUrls.default.http[0],
      startBlockHeight: 1,
      pollingInterval: 500,
      confirmationDepth: 1,
    }))
  )
  .buildPrimitives((b) => b
    // Only needed if the template uses user-submitted inputs via custom grammar
    // (effectstreamSubmitGameInput or the batcher). Adds an extra contract to scan,
    // so omit if all inputs come from other contract events (ERC20, Midnight, etc.).
    .addPrimitive((s) => s.parallelEvmRPC, () => ({
      name: "MyTemplateL2",
      type: PrimitiveTypeEVMEffectstreamL2,
      startBlockHeight: 0,
      contractAddress: contractAddressesEvmMain().chain31337["MyPaimaL2Module#MyPaimaL2"],
      // no stateMachinePrefix — the L2 primitive ignores it (grammar key comes from the payload)
    }))
    .addPrimitive((s) => s.parallelEvmRPC, () => ({
      name: "MyERC721",
      type: PrimitiveTypeEVMERC721,
      startBlockHeight: 0,
      contractAddress: contractAddressesEvmMain().chain31337["Erc721DevModule#Erc721Dev"],
      stateMachinePrefix: "nftTransfer",
    }))
  )
  .build();
```

> **`PrimitiveTypeEVMEffectstreamL2` — add only when needed.** This is an EVM-specific tool: a contract + scanner that lets users send arbitrary messages (concise/game inputs) to the backend via `effectstreamSubmitGameInput` or the batcher. It adds an extra contract to scan, which is expensive — so only include it when the template has standalone user actions that don't originate from events already emitted by other contracts (ERC20 transfers, Midnight state changes, etc.). When it IS needed and missing, the failure is silent: no error, no crash, just empty query results. The L2 primitive reads `EffectstreamGameInteraction` events from the L2 contract and routes them to the state machine via the grammar. Chain-event primitives (ERC20, ERC721, Midnight, etc.) handle their own event types but do NOT read L2 game inputs. Omit `stateMachinePrefix` on the L2 primitive — its constructor hardcodes it to `undefined` and ignores anything you pass; the grammar key is encoded inside the JSON payload, not derived from the prefix.

### Networks (`ConfigNetworkType`)

`NTP` (required, one per app), `EVM`, `MIDNIGHT`, `BITCOIN`, `CARDANO`, `AVAIL`, `CELESTIA`, `NEAR`, `SOLANA`, `MINA`.

### Sync Protocols (`ConfigSyncProtocolType`)

Every app: exactly one `addMain` (the `NTP_MAIN` clock) and one or more `addParallel`.

| Type | Network |
|---|---|
| `NTP_MAIN` | NTP |
| `EVM_RPC_PARALLEL` | EVM |
| `MIDNIGHT_PARALLEL` | MIDNIGHT |
| `BITCOIN_RPC_PARALLEL` | BITCOIN |
| `CARDANO_CARP_PARALLEL` / `CARDANO_UTXORPC_PARALLEL` | CARDANO |
| `AVAIL_PARALLEL` | AVAIL |
| `CELESTIA_PARALLEL` | CELESTIA |
| `NEAR_RPC_PARALLEL` | NEAR |
| `SOLANA_RPC_PARALLEL` | SOLANA |
| `MINA_PARALLEL` | MINA |

Common sync-protocol fields: `startBlockHeight`, `pollingInterval`, `confirmationDepth`, `stepSize`, `delayMs` (mainnet sync alignment).

### ⚠️ Silent killer: `stateMachinePrefix` vs `scheduledPrefix`

The `ConfigBuilder.addPrimitive(...)` TypeScript schema exposes **`stateMachinePrefix?: string`** as the documented field, and keeps **`scheduledPrefix?: string`** only as an `@deprecated`, type-level-only alias for old configs (`packages/effectstream-sdk/config/src/schema/sync-protocols/types.ts`, `BasePrimitive`). The built-in primitive constructors (`Nep141Primitive`, `Erc20Primitive`, `BitcoinAddressPrimitive`, …) read only **`stateMachinePrefix`** (per `packages/node-sdk/sm/primitives/Primitive.ts:38` — `this.stateMachinePrefix = config.stateMachinePrefix`). The engine's runtime spreads `primitiveConfig` straight into the constructor without renaming, so `scheduledPrefix` never reaches the runtime.

**The bug:** if you only set `scheduledPrefix` (copied from an old config, or picked from autocomplete), the constructor's `stateMachinePrefix` is `undefined`. The primitive then writes to `effectstream.primitive_accounting` (and any chain-specific IVM tables it ships with) but **never schedules an STM input**. User STM transitions silently never fire — no error, no crash, just empty `public.*` tables. The engine's own `e2e/` tests don't catch this because they only assert against `primitive_accounting` and IVM tables.

**The fix**: always use `stateMachinePrefix` (it typechecks directly — no cast needed) and never write `scheduledPrefix` in new code:

```ts
.addPrimitive((s) => s.parallelEvmRPC, () => ({
  name: "MyERC721",
  type: PrimitiveTypeEVMERC721,
  contractAddress: addresses.chain31337["…"],
  startBlockHeight: 0,
  stateMachinePrefix: "nftTransfer", // NOT scheduledPrefix — that name is a deprecated no-op
}))
```

The symptom of getting it wrong is identical to the symptom of forgetting `PrimitiveTypeEVMEffectstreamL2` (Core invariant §9) — silent empty results. Always run a typed application-table query (not just an assertion against `primitive_accounting`) in Phase B tests to surface this immediately.

### Built-in primitives (`@effectstream/sm/builtin`)

| Primitive | Grammar | Chain | Use |
|---|---|---|---|
| `PrimitiveTypeEVMEffectstreamL2` | Your grammar | EVM | Parses `effectstreamSubmitGameInput` calls |
| `PrimitiveTypeEVMERC721` / `EVMERC20` / `EVMERC1155` | `builtinGrammars.evm*` | EVM | Token transfer events |
| `PrimitiveTypeMidnightGeneric` | `builtinGrammars.midnightGeneric` | Midnight | Generic ledger state |
| `PrimitiveTypeMidnightNullifierAndCommitment` | — | Midnight | Zswap nullifier + commitment tracking |
| `PrimitiveTypeMidnightUnshieldedSpend` / `MidnightUnshieldedCreate` | — | Midnight | Unshielded UTXO spends/creates (payload incl. `value`, `tokenType`) |
| `PrimitiveTypeMidnightZswapRoot` | — | Midnight | Zswap Merkle-root tracking |
| `PrimitiveTypeMidnightTokenMint` | `builtinGrammars.midnightTokenMint` | Midnight | Token mint/burn events |
| `PrimitiveTypeBitcoinAddress` | `builtinGrammars.bitcoinAddress` | Bitcoin | Watch address transactions |
| `PrimitiveTypeUtxorpcGeneric` | `builtinGrammars.utxorpcGeneric` | Cardano | Generic UTXO events |
| `PrimitiveTypeCardanoMintBurn` / `CardanoTransfer` / `CardanoPoolDelegation` / `CardanoDelayedAsset` / `CardanoProjectedNFT` | respective `builtinGrammars.*` | Cardano | Five Cardano-specific event types |
| `PrimitiveTypeAvailGeneric` / `CelestiaGeneric` | respective | Avail/Celestia | DA data |
| `PrimitiveTypeNEAR{NEP141,NEP171,NEP245,Intent,Generic,AccountWatch}` | respective | NEAR | Token / intent / function-call tracking |
| `PrimitiveTypeSolana{ProgramLog,AccountBalance,TokenAccount}` | respective `builtinGrammars.solana*` | Solana | Program logs / lamport balances / SPL token accounts |

## 7. Custom Primitives

Extend `Primitive` from `@effectstream/sm` to parse arbitrary on-chain events. Register via `userDefinedPrimitives` in `start()`.

```ts
import { Primitive } from "@effectstream/sm";
import type { JsonObject } from "@effectstream/sm";
import type {
  ConfigSyncProtocolType,
  FlattenSyncProtocolIOFor,
  ProtocolPrimitiveMap,
} from "@effectstream/config";
import { getEvmEvent } from "@effectstream/config";
import {
  type AddressAndType, AddressType,
  type EvmAddress, type EffectstreamBlockNumber,
  TypeboxHelpers, type StaticDecode,
} from "@effectstream/utils";
import { Value } from "@sinclair/typebox/value";
import {
  generateRawStmInput,
  type CommandTuple,
  type ParamToData,
} from "@effectstream/concise";
import type { StateUpdateStream } from "@effectstream/coroutine";
import { Type } from "@sinclair/typebox";

const myEventAbi = [{
  type: "event",
  name: "MyEvent",
  inputs: [
    { name: "user", type: "address", indexed: true, internalType: "address" },
    { name: "value", type: "uint256", indexed: false, internalType: "uint256" },
  ],
  anonymous: false,
}] as const;

const myGrammar = [["value", Type.Number()]] as const;

class MyCustomPrimitive extends Primitive<
  ConfigSyncProtocolType.EVM_RPC_PARALLEL,
  typeof myGrammar
> {
  readonly internalTypeName = "EVM:MY-CUSTOM";
  readonly abi = getEvmEvent(myEventAbi, "MyEvent(address,uint256)");
  override grammar = myGrammar;
  readonly contractAddress: EvmAddress;

  constructor(config: {
    instanceName: string;
    startBlockHeight: number;
    contractAddress: EvmAddress;
    stateMachinePrefix: string | undefined;
  }) {
    super(config);
    this.contractAddress = Value.Decode(TypeboxHelpers.Evm.Address, config.contractAddress);
  }

  override *getPayload(
    _: EffectstreamBlockNumber,
    txData: FlattenSyncProtocolIOFor<ConfigSyncProtocolType.EVM_RPC_PARALLEL>,
  ): StateUpdateStream<{
    isBatched: boolean;
    data: {
      fromAddressAndType: AddressAndType;
      stateMachinePayload: StaticDecode<CommandTuple<string, typeof myGrammar>> | null;
      accountingPayload: JsonObject;
    }[];
  }> {
    const { user, value } = txData.output.payload;
    const accountingPayload: ParamToData<typeof myGrammar> = {
      value: Number(BigInt(value)),
    };
    const stateMachinePayload = this.stateMachinePrefix
      ? generateRawStmInput(this.grammar, this.stateMachinePrefix, accountingPayload)
      : null;

    return {
      isBatched: false,
      data: [{
        fromAddressAndType: {
          type: AddressType.EVM,
          address: Value.Decode(TypeboxHelpers.Evm.Address, user.toLowerCase()),
        },
        accountingPayload,
        stateMachinePayload,
      }],
    };
  }

  override getConfig(): ProtocolPrimitiveMap[ConfigSyncProtocolType.EVM_RPC_PARALLEL] {
    return {
      name: this.instanceName,
      type: this.internalTypeName,
      startBlockHeight: this.startBlockHeight,
      contractAddress: this.contractAddress as EvmAddress,
      abi: this.abi,
    } as const;
  }

  override getIntermediatePrefix(): string[] { return []; }
  override getViewPrefix(): string[] { return []; }
  override getDynamicTables = (_name: string): string | undefined => undefined;
}

// Register in start():
yield* start({
  // ...
  userDefinedPrimitives: { "EVM:MY-CUSTOM": MyCustomPrimitive },
});
```

Working example: `e2e/evm/node.ts` (`EvmCounterPrimitive`).
