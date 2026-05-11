import { runPreparedQuery } from "@effectstream/db";
import {
  getNftLocks,
  getNftLocksByOwner,
  nftLocksTableExists,
} from "@projected-nft-preorder/database";
import {
  getHololockerScriptHash,
  getHololockerScriptAddress,
} from "@projected-nft-preorder/contracts-cardano";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {

  // ── NFT Locks (read-only, indexed via CardanoProjectedNFT primitive) ──────

  server.get("/api/locks", async (_request, reply) => {
    const [tableExists] = await runPreparedQuery(
      nftLocksTableExists.run(undefined, dbConn),
      "nftLocksTableExists",
    );
    if (!tableExists?.exists) {
      reply.send([]);
      return;
    }
    const result = await runPreparedQuery(
      getNftLocks.run(undefined, dbConn),
      "/api/locks",
    );
    reply.send(result);
  });

  server.get<{ Params: { address: string } }>("/api/locks/:address", async (request, reply) => {
    const { address } = request.params;
    const result = await runPreparedQuery(
      getNftLocksByOwner.run({ owner_address: address }, dbConn),
      "/api/locks/:address",
    );
    reply.send(result);
  });

  // ── Cardano Script Info (read-only) ───────────────────────────────────────

  server.get("/api/cardano/script-hash", async (_request, reply) => {
    try {
      reply.send({ scriptHash: getHololockerScriptHash() });
    } catch (e: any) {
      reply.code(500).send({ error: e.message });
    }
  });

  server.get("/api/cardano/script-address", async (_request, reply) => {
    try {
      reply.send({ scriptAddress: getHololockerScriptAddress() });
    } catch (e: any) {
      reply.code(500).send({ error: e.message });
    }
  });
};
