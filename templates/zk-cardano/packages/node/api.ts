import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@effectstream/db";
import { eligibleVotersTableExists, getEligibleVoter, getAllEligibleVoters, getProposals } from "@zk-cardano/database";
import { createFreshLucid, delegateToPool, YACI_GENESIS_POOL_HASH, YACI_GENESIS_POOL_BECH32, type FreshLucidResult } from "@zk-cardano/contracts-cardano";

const DOLOS_BLOCKFROST_URL = "http://localhost:3000";
import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

let frontendCardanoWallet: FreshLucidResult | null = null;
let frontendCardanoDelegated = false;

const EligibleVoterSchema = Type.Object({
  id: Type.Number(),
  staking_credential: Type.String(),
  pool: Type.String(),
  epoch: Type.Number(),
  block_height: Type.Number(),
  registered_at: Type.Union([Type.Null(), Type.String()]),
});

const ProposalSchema = Type.Object({
  id: Type.Number(),
  title: Type.Union([Type.Null(), Type.String()]),
  active: Type.Boolean(),
  block_height: Type.Number(),
  yes_count: Type.Number(),
  no_count: Type.Number(),
});

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  server.get<{
    Reply: Static<typeof EligibleVoterSchema>[];
  }>("/api/eligible", async (_request, reply) => {
    const [tableExists] = await runPreparedQuery(
      eligibleVotersTableExists.run(undefined, dbConn),
      "eligibleVotersTableExists",
    );
    if (!tableExists?.exists) {
      reply.send([]);
      return;
    }
    const result = await runPreparedQuery(
      getAllEligibleVoters.run(undefined, dbConn),
      "/api/eligible",
    );
    reply.send(result);
  });

  server.get<{
    Params: { credential: string };
    Reply: Static<typeof EligibleVoterSchema> | { error: string };
  }>("/api/eligible/:credential", async (request, reply) => {
    const { credential } = request.params;

    const [tableExists] = await runPreparedQuery(
      eligibleVotersTableExists.run(undefined, dbConn),
      "eligibleVotersTableExists",
    );
    if (!tableExists?.exists) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    const result = await runPreparedQuery(
      getEligibleVoter.run({ staking_credential: credential }, dbConn),
      "/api/eligible",
    );

    if (result.length === 0) {
      reply.code(404).send({ error: "not found" });
      return;
    }

    reply.send(result[0]);
  });

  server.get<{
    Reply: Static<typeof ProposalSchema>[];
  }>("/api/proposals", async (_request, reply) => {
    const result = await runPreparedQuery(
      getProposals.run(undefined, dbConn),
      "/api/proposals",
    );
    reply.send(result);
  });

  server.get("/api/contract-state", async (_request, reply) => {
    const proposals = await runPreparedQuery(
      getProposals.run(undefined, dbConn),
      "/api/contract-state",
    );
    const proposalCount = proposals.length;
    const totalYes = proposals.reduce((sum, p) => sum + Number(p.yes_count), 0);
    const totalNo = proposals.reduce((sum, p) => sum + Number(p.no_count), 0);
    const lastBlock = proposals.reduce((max, p) => Math.max(max, Number(p.block_height)), 0);
    reply.send({
      proposal_count: proposalCount,
      tally_yes: totalYes,
      tally_no: totalNo,
      last_block_height: lastBlock,
    });
  });

  server.post("/api/cardano/connect", async (_request, reply) => {
    try {
      if (frontendCardanoWallet) {
        const utxos = await frontendCardanoWallet.lucid.utxosAt(frontendCardanoWallet.address);
        const balanceLovelace = utxos.reduce((sum, u) => sum + u.assets.lovelace, 0n);
        reply.send({
          address: frontendCardanoWallet.address,
          staking_credential: frontendCardanoWallet.stakingCredential,
          seed_phrase: frontendCardanoWallet.seedPhrase,
          balance_lovelace: balanceLovelace.toString(),
          balance_ada: Number(balanceLovelace / 1_000_000n),
          utxo_count: utxos.length,
          utxos: utxos.slice(0, 5).map(u => ({
            tx_hash: u.txHash,
            output_index: u.outputIndex,
            lovelace: u.assets.lovelace.toString(),
          })),
        });
        return;
      }
      const result = await createFreshLucid();
      frontendCardanoWallet = result;
      frontendCardanoDelegated = false;
      const utxos = await result.lucid.utxosAt(result.address);
      const balanceLovelace = utxos.reduce((sum, u) => sum + u.assets.lovelace, 0n);
      reply.send({
        address: result.address,
        staking_credential: result.stakingCredential,
        seed_phrase: result.seedPhrase,
        balance_lovelace: balanceLovelace.toString(),
        balance_ada: Number(balanceLovelace / 1_000_000n),
        utxo_count: utxos.length,
        utxos: utxos.slice(0, 5).map(u => ({
          tx_hash: u.txHash,
          output_index: u.outputIndex,
          lovelace: u.assets.lovelace.toString(),
        })),
      });
    } catch (e: any) {
      reply.code(500).send({ error: e.message });
    }
  });

  server.get("/api/cardano/wallet", async (_request, reply) => {
    if (!frontendCardanoWallet) {
      reply.send({ connected: false });
      return;
    }
    let balanceLovelace = "0";
    let utxoCount = 0;
    try {
      const utxos = await frontendCardanoWallet.lucid.utxosAt(frontendCardanoWallet.address);
      balanceLovelace = utxos.reduce((sum, u) => sum + u.assets.lovelace, 0n).toString();
      utxoCount = utxos.length;
    } catch { /* ignore balance fetch errors */ }
    reply.send({
      connected: true,
      address: frontendCardanoWallet.address,
      staking_credential: frontendCardanoWallet.stakingCredential,
      seed_phrase: frontendCardanoWallet.seedPhrase,
      balance_lovelace: balanceLovelace,
      balance_ada: Number(BigInt(balanceLovelace) / 1_000_000n),
      utxo_count: utxoCount,
      delegated: frontendCardanoDelegated,
      pool_id: frontendCardanoDelegated ? YACI_GENESIS_POOL_HASH : null,
    });
  });

  server.post("/api/cardano/delegate", async (_request, reply) => {
    try {
      if (!frontendCardanoWallet) {
        reply.code(400).send({ error: "No wallet connected. Call POST /api/cardano/connect first." });
        return;
      }
      if (frontendCardanoDelegated) {
        reply.send({
          txHash: "already-delegated",
          poolId: YACI_GENESIS_POOL_HASH,
        });
        return;
      }
      const { txHash } = await delegateToPool(frontendCardanoWallet.lucid, YACI_GENESIS_POOL_BECH32);
      frontendCardanoDelegated = true;
      reply.send({ txHash, poolId: YACI_GENESIS_POOL_HASH });
    } catch (e: any) {
      reply.code(500).send({ error: e.message });
    }
  });
};
