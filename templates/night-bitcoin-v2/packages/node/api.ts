import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@effectstream/db";
import {
  insertQuote,
  tableExists,
  getIntentByOrderId,
} from "@night-bitcoin/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";
import { ENV } from "@effectstream/utils/node-env";

const SATS_PER_BTC = 100_000_000n;
const BTC_DUST_LIMIT_SATS = 546n;

const toSatoshis = (amount: number): bigint | null => {
  if (!Number.isFinite(amount)) return null;
  const sats = Math.round(amount * Number(SATS_PER_BTC));
  if (!Number.isFinite(sats)) return null;
  try {
    return BigInt(sats);
  } catch (_) {
    return null;
  }
};

let isReady = false;

async function ensureReady(dbConn: Pool) {
  if (isReady) return;
  const [result] = await runPreparedQuery(
    tableExists.run(undefined, dbConn),
    "tableExists",
  );
  isReady = result?.exists ?? false;
}

/**
 * User-defined API routes registered with the runtime.
 * Exposes endpoints used by the frontend to query intents, request quotes
 * from fillers, and trigger development-only faucets.
 */
export const apiRouter: StartConfigApiRouter = function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  const GetIntentsParamsSchema = Type.Object({
    orderId: Type.String(),
  });
  const GetIntentsResponseSchema = Type.Object({
    order_id: Type.String(),
    user_address: Type.String(),
    origin_chain_id: Type.String(),
    open_deadline: Type.String(),
    fill_deadline: Type.String(),
    max_spent_token: Type.String(),
    max_spent_amount: Type.String(),
    max_spent_recipient: Type.String(),
    max_spent_chain_id: Type.String(),
    min_received_token: Type.String(),
    min_received_amount: Type.String(),
    min_received_recipient: Type.String(),
    min_received_chain_id: Type.String(),
    destination_chain_id: Type.String(),
    destination_settler: Type.String(),
    origin_data: Type.String(),
    status: Type.String(),
    resolved_by: Type.Union([Type.Null(), Type.String()]),
  });
  server.get<{
    Querystring: Static<typeof GetIntentsParamsSchema>;
    Reply: Static<typeof GetIntentsResponseSchema>;
  }>("/api/intents", async (request, reply) => {
    await ensureReady(dbConn);
    if (!isReady) {
      reply.status(500).send({ message: "Database not ready" } as any);
      return;
    }
    const { orderId } = request.query;
    const [result] = await runPreparedQuery(
      getIntentByOrderId.run({ order_id: orderId }, dbConn),
      "/api/intents",
    );
    if (!result) {
      reply.status(404).send({ message: "Intent not found" } as any);
      return;
    }
    reply.send(result);
  });

  const GetQuotesParamsSchema = Type.Object({
    orderId: Type.String(),
    fromToken: Type.String(),
    toToken: Type.String(),
    fromAmount: Type.Number(),
  });
  const GetQuotesResponseSchema = Type.Object({
    orderId: Type.String(),
    fromToken: Type.String(),
    filler: Type.String(),
    toToken: Type.String(),
    fromAmount: Type.Number(),
    toAmount: Type.Number(),
    fee: Type.Number(),
  });
  const GetQuotesResponseSchemaArray = Type.Array(GetQuotesResponseSchema);

  const fillers = [
    { name: "Alpha Liquidity", port: 16101 },
    { name: "Omega Swap", port: 16102 },
    { name: "Quantum Pools", port: 16103 },
  ];

  server.post<{
    Body: Static<typeof GetQuotesParamsSchema>;
    Reply: Static<typeof GetQuotesResponseSchemaArray>;
  }>("/api/get-quotes", async (request, reply) => {
    await ensureReady(dbConn);
    if (!isReady) {
      reply.status(500).send({ message: "Database not ready" } as any);
      return;
    }
    const { orderId, fromToken, toToken, fromAmount } = request.body;
    const lowercaseFromToken = fromToken.toLowerCase();

    if (lowercaseFromToken === "btc") {
      const sats = toSatoshis(fromAmount);
      if (sats === null) {
        reply.status(400).send({
          message: "Enter a valid BTC amount before requesting quotes.",
        } as any);
        return;
      }
      if (sats <= BTC_DUST_LIMIT_SATS) {
        reply.status(400).send({
          message: `Quote requests of ${Number(
            BTC_DUST_LIMIT_SATS,
          )} sats or less fail due to the Bitcoin dust limit.`,
        } as any);
        return;
      }
    }
    const quotes: Static<typeof GetQuotesResponseSchemaArray> = [];

    const quotePromises = fillers.map((filler) => {
      return fetch(`http://localhost:${filler.port}/api/quote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          orderId,
          fromToken,
          toToken,
          fromAmount,
        }),
      }).then((res) => {
        if (!res.ok) {
          throw new Error(`Filler ${filler.name} failed with status ${res.status}`);
        }
        return res.json();
      });
    });

    const results = await Promise.allSettled(quotePromises);

    for (const result of results) {
      if (result.status === "fulfilled") {
        try {
          const quote: Static<typeof GetQuotesResponseSchema> = result.value as Static<
            typeof GetQuotesResponseSchema
          >;

          await runPreparedQuery(
            insertQuote.run(
              {
                order_id: quote.orderId,
                from_token: quote.fromToken,
                filler: quote.filler,
                to_token: quote.toToken,
                from_amount: quote.fromAmount,
                to_amount: quote.toAmount,
                fee: quote.fee,
              },
              dbConn,
            ),
            "/api/get-quotes",
          );

          quotes.push(quote);
        } catch (error) {
          console.error(">>>", error);
        }
      } else {
        console.error("Error fetching quote:", result.reason);
      }
    }

    reply.send(quotes);
  });

  // BTC faucet still uses a permissive string schema. The NIGHTs faucet was
  // removed — dust is now auto-balanced by the batcher's MidnightBalancingAdapter.
  const FaucetQueryParamsSchema = Type.Object({
    address: Type.String(),
  });
  const FaucetResponseSchema = Type.Object({
    status: Type.String(),
    message: Type.String(),
  });

  let isFaucetBtcRunning = false;

  server.get<{
    Querystring: Static<typeof FaucetQueryParamsSchema>;
    Reply: Static<typeof FaucetResponseSchema>;
  }>("/api/faucet/btc", async (request, reply) => {
    if (isFaucetBtcRunning) {
      return reply.status(409).send({
        status: "error",
        message: "Faucet is already running",
      });
    }
    isFaucetBtcRunning = true;
    const { address } = request.query;
    try {
      const proc = Bun.spawn(
        [
          "bun",
          "run",
          "--filter",
          "@night-bitcoin/contracts-bitcoin",
          "faucet-btc",
        ],
        {
          env: { ...process.env, BTC_ADDRESS: address },
          // See /api/faucet/nights for why these are `inherit` not `pipe`.
          stdout: "inherit",
          stderr: "inherit",
        },
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        return reply.status(500).send({
          status: "error",
          message: `Faucet process exited with code ${exitCode}`,
        });
      }
      return {
        status: "done",
        message: "Faucet successfully completed",
      };
    } catch (error: any) {
      return reply.status(500).send({
        status: "error",
        message: error?.message ?? String(error),
      });
    } finally {
      isFaucetBtcRunning = false;
    }
  });

  server.get("/api/check-processes", async (_request, _reply) => {
    // 1. Sync node must be alive (otherwise we can't even read state).
    let processes: any[] = [];
    try {
      const response = await fetch(
        `http://localhost:${ENV.ORCHESTRATOR_PORT}/processes`,
      );
      if (!response.ok) return "LOADING";
      const data = await response.json();
      processes = data.processes ?? [];
    } catch (error) {
      console.error("Error in /api/check-processes:", error);
      return "LOADING";
    }

    const isAlive = (p: any) => p?.status === "running";

    const syncProcess = processes.find((p: any) => p.name === "sync");
    if (!isAlive(syncProcess)) return "LOADING";

    // 2. Every filler process must be running in the orchestrator. If any of
    //    them hasn't been spawned yet (e.g. mint-wallets-midnight is still
    //    running) or has crashed, we are not ready.
    const fillerProcs = processes.filter((p: any) =>
      typeof p.name === "string" && p.name.startsWith("filler:")
    );
    if (fillerProcs.length === 0 || !fillerProcs.every(isAlive)) {
      return "FILLERS-NOT-READY";
    }

    // 3. Each filler's HTTP server must actually answer. Process-alive does
    //    not imply the Fastify listen() has resolved — there's a startup
    //    window where the wallet is syncing and the port isn't bound yet.
    const probes = await Promise.allSettled(
      fillers.map((f) =>
        fetch(`http://localhost:${f.port}/api/health`, {
          signal: AbortSignal.timeout(1000),
        }).then((r) => r.ok),
      ),
    );
    if (
      !probes.every((p) => p.status === "fulfilled" && p.value === true)
    ) {
      return "FILLERS-NOT-READY";
    }

    return "READY";
  });

  return Promise.resolve();
};
