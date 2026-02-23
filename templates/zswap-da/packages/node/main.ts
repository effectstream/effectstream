import {
  init,
  start,
  type StartConfigApiRouter,
  type StartConfigGameStateTransitions,
} from "@paimaexample/runtime";
import { main, suspend } from "effection";
import {
  toSyncProtocolWithNetwork,
  withEffectstreamStaticConfig,
} from "@paimaexample/config";
import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@paimaexample/config";
import type { GrammarDefinition } from "@paimaexample/concise";
import type { SyncStateUpdateStream } from "@paimaexample/coroutine";
import { World } from "@paimaexample/coroutine";
import { PaimaSTM } from "@paimaexample/sm";
import type { BaseStfInput } from "@paimaexample/sm";
import { builtinGrammars } from "@paimaexample/sm/grammar";
import { PrimitiveTypeCelestiaGeneric } from "@paimaexample/sm/builtin";
import type { BlockNumber } from "@paimaexample/utils";

// ─── Midnight Config ──────────────────────────────────────────────────────────

const MIDNIGHT_NETWORK_ID = Deno.env.get("MIDNIGHT_NETWORK_ID") ?? "undeployed";
const MIDNIGHT_NODE_URL = Deno.env.get("MIDNIGHT_NODE_HTTP") ?? "http://127.0.0.1:9944";
const MIDNIGHT_INDEXER = Deno.env.get("MIDNIGHT_INDEXER_HTTP") ?? "http://127.0.0.1:8088/api/v3/graphql";
const MIDNIGHT_INDEXER_WS = Deno.env.get("MIDNIGHT_INDEXER_WS") ?? "ws://127.0.0.1:8088/api/v3/graphql/ws";

// ─── Celestia Config ──────────────────────────────────────────────────────────

const CELESTIA_RPC_URL = Deno.env.get("CELESTIA_RPC_URL") ?? "http://127.0.0.1:26658";
const CELESTIA_NAMESPACE = Deno.env.get("CELESTIA_NAMESPACE") ?? "000000000000deadbeef";
const CELESTIA_FEE = parseInt(Deno.env.get("CELESTIA_FEE") ?? "2000");
const CELESTIA_GAS_LIMIT = parseInt(Deno.env.get("CELESTIA_GAS_LIMIT") ?? "100000");

// ─── Grammar ─────────────────────────────────────────────────────────────────
//
// We reuse the built-in Celestia generic grammar.
// Blobs arrive as { payload: { suppliedValue: string } } where suppliedValue
// is the raw bytes decoded as UTF-8 (our JSON-encoded ZSWAP).

const grammar = {
  "celestia-zswap": builtinGrammars.celestiaGeneric,
} as const satisfies GrammarDefinition;

// ─── Runtime Config ───────────────────────────────────────────────────────────

export const localhostConfig = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("zswap-da-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: MIDNIGHT_NETWORK_ID as any,
        nodeUrl: MIDNIGHT_NODE_URL,
      })
      .addNetwork({
        name: "celestia",
        type: ConfigNetworkType.CELESTIA,
        rpcUrl: CELESTIA_RPC_URL,
      })
  )
  .buildDeployments((builder) => builder)
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (_network, _deployments) => ({
          name: "mainNtp",
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => (networks as any).midnight,
        (_network, _deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          delayMs: 18000,
          indexer: MIDNIGHT_INDEXER,
          indexerWs: MIDNIGHT_INDEXER_WS,
        }),
      )
      .addParallel(
        (networks) => (networks as any).celestia,
        (_network, _deployments) => ({
          name: "parallelCelestia",
          type: ConfigSyncProtocolType.CELESTIA_PARALLEL,
          startBlockHeight: 1 as BlockNumber,
          // Celestia block time is ~12s; poll every 6s and wait 1 block for safety
          pollingInterval: 6_000,
          delayMs: 12_000,
          confirmationDepth: 1,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder.addPrimitive(
      (syncProtocols) => (syncProtocols as any).parallelCelestia,
      (_network, _deployments, _syncProtocol) => ({
        name: "ZswapBlob",
        type: PrimitiveTypeCelestiaGeneric,
        startBlockHeight: 1,
        namespace: CELESTIA_NAMESPACE,
        stateMachinePrefix: "celestia-zswap",
      }),
    )
  )
  .build();

// ─── DB ref (set by apiRouter before sync starts) ─────────────────────────────

// deno-lint-ignore no-explicit-any
let _dbConn: any = null;

// ─── Celestia Submission Helper ───────────────────────────────────────────────

function namespaceToBase64(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(29); // 1-byte version prefix + 28-byte namespace ID
  const hexBytes = (clean.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16));
  bytes.set(hexBytes, 29 - hexBytes.length);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function submitToCelestia(
  data: string,
): Promise<{ txhash: string; height: string } | null> {
  const ns64 = namespaceToBase64(CELESTIA_NAMESPACE);
  const b64 = btoa(unescape(encodeURIComponent(data)));
  try {
    const res = await fetch(CELESTIA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "blob.Submit",
        params: [
          [{ namespace: ns64, data: b64, share_version: 0 }],
          { fee: CELESTIA_FEE, gasLimit: CELESTIA_GAS_LIMIT },
        ],
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(JSON.stringify(json.error));
    return json.result;
  } catch (e) {
    console.error("[Celestia submit error]", e);
    return null;
  }
}

// ─── State Machine ────────────────────────────────────────────────────────────

const stm = new PaimaSTM<typeof grammar, {}>(grammar);

stm.addStateTransition("celestia-zswap", function* (data) {
  const { payload } = data.parsedInput;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(payload.suppliedValue);
  } catch {
    return; // Not JSON — ignore
  }

  if (
    parsed._kind !== "zswap" ||
    !Array.isArray(parsed.gives) ||
    !Array.isArray(parsed.wants)
  ) {
    return; // Not a ZSWAP blob — ignore
  }

  if (!_dbConn) {
    console.error("[ZSWAP] DB connection not available");
    return;
  }

  yield* World.promise(
    _dbConn.query(
      `INSERT INTO zswap_da.zswaps (gives, wants, status, height)
       VALUES ($1::jsonb, $2::jsonb, 'pending', $3)`,
      [JSON.stringify(parsed.gives), JSON.stringify(parsed.wants), data.blockHeight],
    ),
  );

  console.log(
    `🌌 [ZSWAP] Saved at Celestia block ${data.blockHeight}`,
    `| gives: ${JSON.stringify(parsed.gives).slice(0, 80)}`,
  );
});

// ─── Game State Transitions ───────────────────────────────────────────────────

const gameStateTransitions: StartConfigGameStateTransitions = function* (
  _blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};

// ─── API Router ───────────────────────────────────────────────────────────────

export const apiRouter: StartConfigApiRouter = async function (
  server: any,
  dbConn: any,
): Promise<void> {
  // Store ref for state machine DB writes
  _dbConn = dbConn;

  // Ensure our schema and table exist
  await dbConn.query(`
    CREATE SCHEMA IF NOT EXISTS zswap_da;
    CREATE TABLE IF NOT EXISTS zswap_da.zswaps (
      id         SERIAL       PRIMARY KEY,
      gives      JSONB        NOT NULL,
      wants      JSONB        NOT NULL,
      status     TEXT         NOT NULL DEFAULT 'pending',
      height     BIGINT,
      created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );
  `);

  // GET /api/zswaps — list all ZSWAPs ordered by newest first
  server.get("/api/zswaps", async () => {
    const result = await dbConn.query(
      `SELECT * FROM zswap_da.zswaps ORDER BY created_at DESC`,
    );
    return result.rows;
  });

  // POST /api/zswap/submit — write a ZSWAP blob to Celestia DA
  server.post("/api/zswap/submit", {
    schema: {
      body: {
        type: "object",
        required: ["gives", "wants"],
        properties: {
          gives: { type: "array" },
          wants: { type: "array" },
        },
      },
    },
  }, async (request: any) => {
    const { gives, wants } = request.body;

    const blob = JSON.stringify({
      _kind: "zswap",
      gives,
      wants,
      createdAt: new Date().toISOString(),
    });

    const result = await submitToCelestia(blob);
    if (!result) {
      throw new Error("Failed to submit blob to Celestia");
    }

    return { success: true, txhash: result.txhash, height: result.height };
  });

  // POST /api/zswap/:id/accept — mark a ZSWAP as accepted
  server.post("/api/zswap/:id/accept", async (request: any) => {
    const { id } = request.params;
    await dbConn.query(
      `UPDATE zswap_da.zswaps SET status = 'accepted' WHERE id = $1`,
      [id],
    );
    return { success: true };
  });
};

// ─── Main ─────────────────────────────────────────────────────────────────────

main(function* () {
  yield* init();
  console.log("Starting ZSwap DA Node");

  yield* withEffectstreamStaticConfig(localhostConfig, function* () {
    yield* start({
      appName: "zswap-da",
      appVersion: "1.0.0",
      syncInfo: toSyncProtocolWithNetwork(localhostConfig),
      gameStateTransitions,
      migrations: undefined,
      apiRouter,
      grammar,
    });
  });

  yield* suspend();
});
