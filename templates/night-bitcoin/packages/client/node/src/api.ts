import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@paimaexample/db";
// TODO This files are not prepared.
import { insertQuote, tableExists } from "@night-bitcoin/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";
import { getIntentByOrderId } from "@night-bitcoin/database";
import { ENV } from "@paimaexample/utils/node-env";

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
    "tableExists"
  );
  isReady = result?.exists ?? false;
}
/**
 * Example for User Defined API Routes.
 * Register custom endpoints here.
 * @param server - The Fastify instance.
 * @param dbConn - The database connection.
 */
export const apiRouter: StartConfigApiRouter = function (
  server: fastify.FastifyInstance,
  dbConn: Pool
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
      "/api/intents"
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
    // { name: "Zenith Trade", port: 16104 },
    // { name: "Orion Exchange", port: 16105 },
    // { name: "Nexus Liquidity", port: 16106 },
    // { name: "Phoenix Finance", port: 16107 },
    // { name: "Galaxy Swaps", port: 16108 },
    // { name: "Infinity Pools", port: 16109 },
    // { name: "Polaris Trade", port: 16110 },
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
            BTC_DUST_LIMIT_SATS
          )} sats or less fail due to the Bitcoin dust limit.`,
        } as any);
        return;
      }
    }
    const quotes: Static<typeof GetQuotesResponseSchemaArray> = [];

    const quotePromises = fillers.map(filler => {
      return fetch(`http://localhost:${filler.port}/api/quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          fromToken,
          toToken,
          fromAmount
        }),
      }).then(res => {
        if (!res.ok) {
          throw new Error(`Filler ${filler.name} failed with status ${res.status}`);
        }
        return res.json();
      });
    });

    const results = await Promise.allSettled(quotePromises);

    for (const result of results) {
      if (result.status === 'fulfilled') {
        try {
          const quote: Static<typeof GetQuotesResponseSchema> = result.value;

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
              dbConn
            ),
            "/api/get-quotes"
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

  const FaucetQueryParamsSchema = Type.Object({
    address: Type.String(),
  });
  const FaucetResponseSchema = Type.Object({
    status: Type.String(),
    message: Type.String(),
  });
  /** This is a faucet endpoint to get funds in the midnight network */
  let isFaucetDustRunning = false;

  server.get<{
    Querystring: Static<typeof FaucetQueryParamsSchema>;
    Reply: Static<typeof FaucetResponseSchema>;
  }>("/api/faucet/nights", async (request) => {
    // This is unsafe, but it's only used for development purposes.
    if (isFaucetDustRunning) {
      return {
        status: "error",
        message: "Faucet is already running",
      };
    }
    const { address } = request.query;
    // TODO Validate if the address is valid midnight address
    let status = "success";
    let message = "";
    try {
      isFaucetDustRunning = true;
      const command = new Deno.Command(Deno.execPath(), {
        env: {
          MIDNIGHT_ADDRESS: address,
        },
        args: [
          "task",
          "-f",
          "@night-bitcoin/midnight-contracts",
          "midnight-faucet:start",
        ],
      });
      const { code, stdout, stderr } = await command.output();
      status = "done";
      message = "Faucet successfully completed";
    } catch (error: any) {
      status = "error";
      message = String(error);
    } finally {
      isFaucetDustRunning = false;
    }

    return {
      status,
      message,
    };
  });

  let isFaucetBtcRunning = false;

  server.get<{
    Querystring: Static<typeof FaucetQueryParamsSchema>;
    Reply: Static<typeof FaucetResponseSchema>;
  }>("/api/faucet/btc", async (request) => {
    // This is unsafe, but it's only used for development purposes.
    if (isFaucetBtcRunning) {
      return {
        status: "error",
        message: "Faucet is already running",
      };
    }
    const { address } = request.query;
    // TODO Validate if the address is valid midnight address
    let status = "success";
    let message = "";
    try {
      isFaucetBtcRunning = true;
      const command = new Deno.Command(Deno.execPath(), {
        env: {
          BTC_ADDRESS: address,
        },
        args: [
          "task",
          "-f",
          "@night-bitcoin/bitcoin-contracts",
          "faucet:btc",
        ],
      });
      const { code, stdout, stderr } = await command.output();
      status = "done";
      message = "Faucet successfully completed";
    } catch (error: any) {
      status = "error";
      message = String(error);
    } finally {
      isFaucetBtcRunning = false;
    }

    return {
      status,
      message,
    };
  });

  server.get("/api/check-processes", async (_request, reply) => {
    try {
      const response = await fetch(`http://localhost:${ENV.ORCHESTRATOR_PORT}/processes`);
      if (!response.ok) {
        return "LOADING";
      }
      const data = await response.json();
      const processes: any[] = data.processes || [];

      const syncProcess = processes.find((p: any) => p.name === "sync");
      const mintProcess = processes.find((p: any) => p.name === "mint-wallets-midnight");

      // We consider the process "there" if it is alive
      const isSyncRunning = syncProcess?.alive === true;
      const isMintRunning = mintProcess?.alive === true;

      if (!isSyncRunning) {
        return "LOADING";
      }

      if (isMintRunning) {
        return "FILLERS-NOT-READY";
      }

      return "READY";
    } catch (error) {
      console.error("Error in /api/check-processes:", error);
      return "LOADING";
    }
  });

  return Promise.resolve();
};
