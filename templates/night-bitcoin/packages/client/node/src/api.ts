import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@paimaexample/db";
// TODO This files are not prepared.
import { insertQuote, tableExists } from "@night-bitcoin/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";

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

  const tokens = ["btc", "eth", "m20", "wbtc"];
  const basePrices = [100000, 4000, 0.5, 100000];

  const getConversion = (
    fromAmount: number,
    fromToken: string,
    toToken: string
  ) => {
    const fromIndex = tokens.indexOf(fromToken);
    const toIndex = tokens.indexOf(toToken);
    if (fromIndex === -1 || toIndex === -1) {
      return 0;
    }
    const ratio = basePrices[fromIndex] / basePrices[toIndex];
    const randomPercent = Math.random() * 10 + 2; // [2, 12]
    const rate = ratio * (1 - randomPercent / 100);
    return rate * fromAmount;
  };

  const fillerNames = [
    "Alpha Liquidity",
    "Omega Swap",
    "Quantum Pools",
    "Zenith Trade",
    "Orion Exchange",
    "Nexus Liquidity",
    "Phoenix Finance",
    "Galaxy Swaps",
    "Infinity Pools",
    "Polaris Trade",
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
    const quotes: Static<typeof GetQuotesResponseSchemaArray> = [];

    const basisPoints = 10; // 0.01% * 10 = 0.1% => 10 basis points

    for (let i = 0; i < 10; i++) {
      try {
        const filler = fillerNames[i];

        const conversionRate = getConversion(fromAmount, fromToken, toToken);
        const fee = (basisPoints * conversionRate) / 10000;

        const quote: Static<typeof GetQuotesResponseSchema> = {
          orderId: orderId,
          fromToken: fromToken,
          filler: filler,
          toToken: toToken,
          fromAmount: fromAmount,
          toAmount: conversionRate - fee,
          fee: fee,
        };

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
    }

    reply.send(quotes);
  });

  // Definition of API Inputs and Outputs.
  // These definition build the OpenAPI documentation.
  // And allow to have type safety for the API Endpoints.
  const TokenParamsSchema = Type.Object({});
  const TokenResponseSchema = Type.Array(
    Type.Object({
      token_id: Type.String(),
      owner: Type.Union([Type.Null(), Type.String()]),
      block_height: Type.Number(),
      chain: Type.String(),
      contract_address: Type.String(),
      amount: Type.String(),
    })
  );

  server.get<{
    Params: Static<typeof TokenParamsSchema>;
    Reply: Static<typeof TokenResponseSchema>;
  }>("/api/erc1155", (request, reply) => {
    // const [tableExists] = await runPreparedQuery(
    //   evmMidnightTableExists.run(undefined, dbConn),
    //   "evmMidnightTableExists",
    // );
    // if (!tableExists.exists) {
    //   reply.send([]);
    //   return;
    // }

    // const result = await runPreparedQuery(
    //   getEvmMidnight.run(undefined, dbConn),
    //   "/api/erc1155",
    // );
    const result = [
      {
        token_id: "1",
        owner: "0x1234567890123456789012345678901234567890",
        block_height: 1,
        chain: "evm",
        contract_address: "0x1234567890123456789012345678901234567890",
        amount: "100",
      },
    ];
    reply.send(result);
  });

  // TODO This is good example when midnight is enabled.
  //      We need to add the faucet script somewhere to be called.
  //
  //   const FaucetQueryParamsSchema = Type.Object({
  //     address: Type.String(),
  //   });
  //   const FaucetResponseSchema = Type.Object({
  //     status: Type.String(),
  //     message: Type.String(),
  //   });
  //   /** This is a faucet endpoint to get funds in the midnight network */
  //   let isRunning = false;
  //   server.get<{
  //     Querystring: Static<typeof FaucetQueryParamsSchema>;
  //     Reply: Static<typeof FaucetResponseSchema>;
  //   }>("/api/faucet", async (request) => {
  //     // This is unsafe, but it's only used for development purposes.
  //     if (isRunning) {
  //       return {
  //         status: "error",
  //         message: "Faucet is already running",
  //       };
  //     }
  //     const { address } = request.query;
  //     // TODO Validate if the address is valid midnight address
  //     let status = "success";
  //     let message = "";
  //     try {
  //       isRunning = true;
  //       const command = new Deno.Command(Deno.execPath(), {
  //         env: {
  //           MIDNIGHT_ADDRESS: address,
  //         },
  //         args: [
  //           "task",
  //           "-f",
  //           "@night-bitcoin/midnight-contracts",
  //           "midnight-faucet:start",
  //         ],
  //       });
  //       const { code, stdout, stderr } = await command.output();
  //       status = "done";
  //       message = "Faucet successfully completed";
  //     } catch (error: any) {
  //       status = "error";
  //       message = String(error);
  //     } finally {
  //       isRunning = false;
  //     }

  //     return {
  //       status,
  //       message,
  //     };
  //   });

  const FaucetQueryParamsSchema = Type.Object({
    address: Type.String(),
  });
  const FaucetResponseSchema = Type.Object({
    status: Type.String(),
    message: Type.String(),
  });
  /** This is a faucet endpoint to get funds in the midnight network */
  let isRunning = false;
  server.get<{
    Querystring: Static<typeof FaucetQueryParamsSchema>;
    Reply: Static<typeof FaucetResponseSchema>;
  }>("/api/faucet", async (request) => {
    // This is unsafe, but it's only used for development purposes.
    if (isRunning) {
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
      isRunning = true;
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
      isRunning = false;
    }

    return {
      status,
      message,
    };
  });

  return Promise.resolve();
};
