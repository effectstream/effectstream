---
slug: stakepool-delegation-technical
title: "Stake Pool Delegation Part 2: Building a Delegation State Machine"
authors: [effectstream]
tags: [cardano, stakepools, delegation, dolos, utxorpc, technical]
---

A step-by-step walkthrough of how the EffectStream [cardano-delegation template](https://github.com/effectstream/effectstream/tree/v-next/templates/cardano-delegation) works internally. We'll trace the full path from raw Cardano blocks to application state, covering the config, primitive, grammar, state machine, database, and API layers.

<!-- truncate -->

## Architecture overview

The delegation template is a complete EffectStream application. It connects to a local Cardano devnet (YACI DevKit + Dolos), watches for delegation certificates, and stores them in PostgreSQL. The orchestrator spins up all infrastructure with a single `bun run dev`.

```
Cardano (YACI DevKit)
    → Dolos (UTxORPC gRPC)
        → EffectStream Sync Node
            → PoolDelegation Primitive (extracts certificates)
                → State Machine (writes to DB)
                    → REST API (reads from DB)
                        → Frontend (Delegation Explorer)
```

## 1. Configuration: connecting the chains

The config defines two networks and two sync protocols. The NTP network provides the main clock, while the Cardano network connects to Dolos via UTxORPC:

```typescript
// packages/node/config.dev.ts
export const config = new ConfigBuilder()
  .setNamespace((builder) =>
    builder.setSecurityNamespace("cardano-delegation")
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "yaci",
        type: ConfigNetworkType.CARDANO,
        nodeUrl: "http://127.0.0.1:10000",
        network: "yaci",
      }),
  )
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        () => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).yaci,
        () => ({
          name: "parallelUtxoRpc",
          type: ConfigSyncProtocolType.CARDANO_UTXORPC_PARALLEL,
          rpcUrl: "http://127.0.0.1:50051",
          startChainPoint: "origin",
          confirmationDepth: 0,
          delayMs: yaciDevKitStartTime ?? 0,
          pollingInterval: 1000,
          headers: { "x-rpc-key": "dev" },
        }),
      ),
  )
```

The key detail is `CARDANO_UTXORPC_PARALLEL` - this tells EffectStream to use a parallel sync protocol that streams blocks from Dolos via gRPC, independently of the main NTP clock. The `confirmationDepth: 0` means we process blocks immediately (appropriate for a local devnet).

## 2. The primitive: filtering and extracting delegation certificates

The primitive is registered in the config with a pool filter:

```typescript
// packages/node/config.dev.ts
.buildPrimitives((builder) =>
  builder.addPrimitive(
    (syncProtocols) => (syncProtocols as any).parallelUtxoRpc,
    () => ({
      name: "CardanoPoolDelegation",
      type: PrimitiveTypeCardanoPoolDelegation,
      startBlockHeight: 1,
      stateMachinePrefix: "cardano-pool-delegation",
      pools: [
        "7301761068762f5900bde9eb7c1c15b09840285130f5b0f53606cc57",
        "82ec502f8c0a51e7c0db410e6722dd42df3b8e11f48e833f9fdf2941",
      ],
      network: "yaci",
    }),
  ),
)
```

The `pools` array filters which delegation events to track. Only delegations to these specific pool operator keyhashes will reach the state machine. Remove the filter to track all pools.

Under the hood, the primitive uses a UTxORPC predicate to tell Dolos to only send transactions containing certificates - filtering out the vast majority of transfer-only transactions at the gRPC level:

```typescript
// CardanoPoolDelegationPrimitive.getConfig()
predicate: { match: { cardano: { has_certificate: true } } }
```

The `getPayload()` method then iterates the certificates array, handling both pre-Conway (`stakeDelegation`) and Conway-era (`stakeRegDelegCert`, `stakeVoteDelegCert`) certificate types:

```typescript
// CardanoPoolDelegationPrimitive.getPayload()
for (const cert of tx.certificates) {
  const c = cert.certificate;
  if (c.case !== "stakeDelegation"
    && c.case !== "stakeRegDelegCert"
    && c.case !== "stakeVoteDelegCert") continue;

  const cred = stakeCredentialToHex(deleg.stakeCredential);
  const poolKeyhash = uint8ArrayToHexString(deleg.poolKeyhash);

  // Filter by configured pools (skip if not in our watch list)
  if (this.pools.length > 0
    && !this.pools.includes(poolKeyhash.toLowerCase())) continue;

  // Generate state machine input from the grammar
  const stateMachinePayload = generateRawStmInput(
    this.grammar, this.stateMachinePrefix, {
      address: cred.hash,
      pool: poolKeyhash,
      epoch: String(slotToEpoch(absoluteSlot, this.network)),
    }
  );
}
```

## 3. The grammar: defining the input shape

The grammar is a TypeBox schema that defines the shape of data flowing from the primitive into the state machine. It's intentionally minimal:

```typescript
// packages/node/grammar.ts
import { builtinGrammars } from "@effectstream/sm/grammar";

export const grammar = {
  "cardano-pool-delegation": builtinGrammars.cardanoPoolDelegation,
} as const satisfies GrammarDefinition;
```

The built-in grammar resolves to:

```typescript
// pool-delegation-grammar.ts
export const poolDelegationGrammar = [
  ["address", Type.String()],  // staking credential hash (hex)
  ["pool", Type.String()],     // pool operator keyhash (hex)
  ["epoch", Type.String()],    // computed from slot + network params
] as const;
```

The grammar key `"cardano-pool-delegation"` matches the `stateMachinePrefix` in the primitive config. This is how EffectStream routes primitive outputs to the correct state machine transition.

## 4. The state machine: turning events into application state

This is where on-chain data becomes application state. The state machine receives parsed delegation events and writes them to PostgreSQL:

```typescript
// packages/node/state-machine.ts
const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition("cardano-pool-delegation", function* (data) {
  const { address, pool, epoch } = data.parsedInput as {
    address: string;
    pool: string;
    epoch: string;
  };

  if (!address || !pool) return;

  // Insert the delegation record
  yield* World.resolve(insertDelegation, {
    block_height: data.blockHeight,
    address,
    pool,
    epoch,
    tx_hash: null,
  });

  // Update aggregate pool statistics
  yield* World.resolve(updatePoolStats, {
    pool,
    latest_epoch: epoch,
    latest_block: data.blockHeight,
  });
});
```

`World.resolve()` executes a [pgtyped](https://pgtyped.dev/) prepared query inside the EffectStream coroutine context. The queries run in the same transaction as the block processing, so if anything fails, the entire block rolls back cleanly.

The `appStateTransitions` export wires this into the EffectStream runtime:

```typescript
// packages/node/state-machine.ts
export const appStateTransitions: StartConfigAppStateTransitions =
  function* (
    blockHeight: number,
    input: BaseStfInput,
  ): SyncStateUpdateStream<void> {
    yield* stm.processInput(input);
  };
```

## 5. Database schema

The database has two tables - raw delegation events and aggregate pool statistics:

```sql
-- packages/database/migrations/000-init.sql
CREATE TABLE delegations (
  id SERIAL PRIMARY KEY,
  block_height INTEGER NOT NULL,
  address TEXT NOT NULL,
  pool TEXT NOT NULL,
  epoch TEXT NOT NULL,
  tx_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_delegations_pool ON delegations(pool);
CREATE INDEX idx_delegations_address ON delegations(address);

CREATE TABLE pool_stats (
  pool TEXT PRIMARY KEY,
  total_delegators INTEGER NOT NULL DEFAULT 0,
  latest_epoch TEXT NOT NULL DEFAULT '0',
  latest_block INTEGER NOT NULL DEFAULT 0
);
```

The `pool_stats` table is maintained by an upsert query that recalculates `total_delegators` on each new delegation:

```sql
INSERT INTO pool_stats (pool, total_delegators, latest_epoch, latest_block)
VALUES (:pool!, 1, :latest_epoch!, :latest_block!)
ON CONFLICT (pool) DO UPDATE SET
  total_delegators = (
    SELECT COUNT(DISTINCT address) FROM delegations WHERE pool = :pool!
  ),
  latest_epoch = GREATEST(pool_stats.latest_epoch, :latest_epoch!),
  latest_block = GREATEST(pool_stats.latest_block, :latest_block!)
```

## 6. REST API

The API layer exposes delegation data over HTTP. It's a standard Fastify router registered with the EffectStream runtime:

```typescript
// packages/node/api.ts
export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // All delegations (paginated)
  server.get("/api/delegations", async (request, reply) => {
    const { limit = "50", offset = "0" } = request.query as {
      limit?: string; offset?: string;
    };
    const result = await getDelegations.run(
      { limit: Number(limit), offset: Number(offset) }, dbConn,
    );
    reply.send(result);
  });

  // Delegations filtered by pool
  server.get("/api/delegations/:pool", async (request, reply) => {
    const { pool } = request.params as { pool: string };
    const result = await getDelegationsByPool.run(
      { pool, limit: Number(limit), offset: Number(offset) }, dbConn,
    );
    reply.send(result);
  });

  // Delegations filtered by staking address
  server.get("/api/delegations/by-address/:address", ...);

  // Aggregate pool statistics
  server.get("/api/pool-stats", ...);

  // Current sync heights
  server.get("/api/block-heights", ...);
};
```

## 7. Putting it all together: the entry point

The entry point wires config, grammar, state machine, API, and migrations into the EffectStream runtime:

```typescript
// packages/node/main.dev.ts
import { init, start } from "@effectstream/runtime";
import { main, suspend } from "effection";

main(function* () {
  yield* init();
  yield* withEffectstreamStaticConfig(config, function* () {
    yield* start({
      appName: "cardano-delegation",
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

## 8. The orchestrator: one command to run everything

The `start.dev.ts` orchestrator config launches the full stack in dependency order:

1. **PGLite** - embedded PostgreSQL (no external DB needed)
2. **YACI DevKit** - local Cardano devnet with instant block production
3. **Dolos** - lightweight Cardano node exposing UTxORPC gRPC
4. **Register test pool** - registers a second stake pool on the devnet
5. **Sync node** - the EffectStream application (config + state machine + API)
6. **Frontend** - builds and serves the Delegation Explorer dApp

```bash
git clone https://github.com/effectstream/effectstream.git
cd effectstream/templates/cardano-delegation
bun i
bun run dev
# Open http://localhost:10599
```

The orchestrator handles dependency ordering, port management, health checks, and graceful shutdown. Developers only need [Bun](https://bun.sh/) installed.

## Extending the template

To add your own delegation logic, modify the state machine transition in `packages/node/state-machine.ts`. The `data` object gives you:

- `data.parsedInput` - the delegation event (`address`, `pool`, `epoch`)
- `data.blockHeight` - the block number
- `data.blockTimestamp` - the block timestamp

For example, to unlock content for delegators of a specific pool:

```typescript
stm.addStateTransition("cardano-pool-delegation", function* (data) {
  const { address, pool } = data.parsedInput as {
    address: string; pool: string; epoch: string;
  };

  // Your custom logic here
  if (pool === PARTNER_POOL_HASH) {
    yield* World.resolve(unlockPremiumContent, {
      address,
      block_height: data.blockHeight,
    });
  }

  yield* World.resolve(insertDelegation, { ... });
});
```

---

- [Template source code](https://github.com/effectstream/effectstream/tree/v-next/templates/cardano-delegation)
- [PoolDelegation primitive source](https://github.com/effectstream/effectstream/tree/v-next/packages/node-sdk/sm/primitives/src/cardano-pool-delegation)
- [Overview blog post](/docs/blog/stakepool-delegation)
- [Cardano Primitives documentation](/docs/home/chains/cardano#primitives)
