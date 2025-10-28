import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@paimaexample/db";
import {
  evmMidnightTableExists,
  getEvmMidnight,
} from "@multi-chain-transfer/database";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@paimaexample/runtime";
import type fastify from "fastify";

/**
 * Example for User Defined API Routes.
 * Register custom endpoints here.
 * @param server - The Fastify instance.
 * @param dbConn - The database connection.
 */
export const apiRouter: StartConfigApiRouter = async function (
  server: fastify.FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // Definition of API Inputs and Outputs.
  // These definition build the OpenAPI documentation.
  // And allow to have type safety for the API Endpoints.
  const TokenParamsSchema = Type.Object({});
  const TokenResponseSchema = Type.Array(Type.Object({
    token_id: Type.String(),
    owner: Type.Union([Type.Null(), Type.String()]),
    block_height: Type.Number(),
    chain: Type.String(),
    contract_address: Type.String(),
    amount: Type.String(),
  }));

  server.get<{
    Params: Static<typeof TokenParamsSchema>;
    Reply: Static<typeof TokenResponseSchema>;
  }>("/api/erc1155", async (request, reply) => {
    const [tableExists] = await runPreparedQuery(
      evmMidnightTableExists.run(undefined, dbConn),
      "evmMidnightTableExists",
    );
    if (!tableExists.exists) {
      reply.send([]);
      return;
    }

    const result = await runPreparedQuery(
      getEvmMidnight.run(undefined, dbConn),
      "/api/erc1155",
    );

    reply.send(result);
  });

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
          "@multi-chain-transfer/midnight-contracts",
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
};
