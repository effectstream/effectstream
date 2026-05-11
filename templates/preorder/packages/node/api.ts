import { type Static, Type } from "@sinclair/typebox";
import { runPreparedQuery } from "@effectstream/db";
import {
  getUser,
  getUserItems,
  getParticipations,
  getRefunds,
  getAllItemsPurchasedQuantity,
  getCardanoPayments,
} from "@preorder/database";
import { launchpadsData, getLaunchpadBySlug } from "./launchpad-config.ts";

import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";


export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {

  // M2: List all launchpads
  server.get("/api/launchpads", async (_request, reply) => {
    const result = launchpadsData.map((l) => ({
      slug: l.slug,
      name: l.name,
      description: l.description,
      image: l.image,
    }));
    reply.send({ launchpads: result });
  });

  server.get("/api/first-block", async (_request, reply) => {
    try {
      const result = await dbConn.query(`
        SELECT * FROM effectstream.sync_protocol_pagination
        WHERE protocol_name = 'mainNtp'
        ORDER BY page_number ASC
        LIMIT 1
      `);
      if (!result || !result.rows.length) {
        reply.send({ timestamp: null });
        return;
      }
      const row = result.rows[0];
      const timestamp = row.page.root - (row.page_number * 1000);
      reply.send({ timestamp });
    } catch {
      reply.send({ timestamp: null });
    }
  });

  // M2: Single launchpad detail with purchased counts
  server.get<{ Params: { slug: string } }>(
    "/api/launchpad/:slug",
    async (request, reply) => {
      const lp = getLaunchpadBySlug(request.params.slug);
      if (!lp) {
        reply.code(404).send({ error: "Launchpad not found" });
        return;
      }

      const quantities = await runPreparedQuery(
        getAllItemsPurchasedQuantity.run({ launchpad: lp.address }, dbConn),
        "/api/launchpad",
      );

      const items = lp.items.map((item) => {
        const q = quantities.find((r) => r.item_id === item.id);
        return {
          ...item,
          purchased: Number(q?.sum ?? 0),
        };
      });

      reply.send({
        slug: lp.slug,
        name: lp.name,
        description: lp.description,
        image: lp.image,
        address: lp.address,
        cardanoPaymentAddress: lp.cardanoPaymentAddress,
        items,
        curatedPackages: lp.curatedPackages ?? [],
        timestampStartPublicSale: lp.timestampStartPublicSale,
        timestampEndSale: lp.timestampEndSale,
        referralDiscountBps: lp.referralDiscountBps,
        referrerRewardBps: lp.referrerRewardBps,
      });
    },
  );

  // M2: User data + items
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string };
  }>("/api/userData/:slug", async (request, reply) => {
    const lp = getLaunchpadBySlug(request.params.slug);
    if (!lp) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }

    const [user] = await runPreparedQuery(
      getUser.run({ launchpad: lp.address, wallet }, dbConn),
      "/api/userData",
    );
    const items = await runPreparedQuery(
      getUserItems.run({ launchpad: lp.address, wallet }, dbConn),
      "/api/userData/items",
    );

    reply.send({ user: user ?? null, items });
  });

  // M2: Participation history
  server.get<{
    Params: { slug: string };
    Querystring: { wallet: string };
  }>("/api/participations/:slug", async (request, reply) => {
    const lp = getLaunchpadBySlug(request.params.slug);
    if (!lp) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }

    const participations = await runPreparedQuery(
      getParticipations.run({ launchpad: lp.address, wallet }, dbConn),
      "/api/participations",
    );

    reply.send({ participations });
  });

  // M2: Refund-eligible participations
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string };
  }>("/api/refunds/:slug", async (request, reply) => {
    const lp = getLaunchpadBySlug(request.params.slug);
    if (!lp) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }

    const refunds = await runPreparedQuery(
      getRefunds.run({ launchpad: lp.address, wallet }, dbConn),
      "/api/refunds",
    );

    reply.send({ refunds });
  });

  // M5: Marketplace integration — item metadata
  server.get<{ Params: { slug: string } }>(
    "/api/marketplace/items/:slug",
    async (request, reply) => {
      const lp = getLaunchpadBySlug(request.params.slug);
      if (!lp) {
        reply.code(404).send({ error: "Launchpad not found" });
        return;
      }

      const quantities = await runPreparedQuery(
        getAllItemsPurchasedQuantity.run({ launchpad: lp.address }, dbConn),
        "/api/marketplace/items",
      );

      const items = lp.items.map((item) => {
        const q = quantities.find((r) => r.item_id === item.id);
        return {
          id: item.id,
          name: item.name,
          description: item.description,
          image: item.image,
          supply: item.supply ?? null,
          purchased: Number(q?.sum ?? 0),
          prices: "prices" in item ? item.prices : null,
        };
      });

      reply.send({
        launchpad: lp.slug,
        name: lp.name,
        items,
      });
    },
  );

  // M5: Marketplace integration — ownership records
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string };
  }>("/api/marketplace/ownership/:slug", async (request, reply) => {
    const lp = getLaunchpadBySlug(request.params.slug);
    if (!lp) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }

    const items = await runPreparedQuery(
      getUserItems.run({ launchpad: lp.address, wallet }, dbConn),
      "/api/marketplace/ownership",
    );

    reply.send({
      launchpad: lp.slug,
      wallet,
      items: items.map((i) => ({
        item_id: i.item_id,
        quantity: i.quantity,
      })),
    });
  });

  // Cardano payments info
  server.get<{
    Params: { slug: string };
  }>("/api/cardano-payments/:slug", async (request, reply) => {
    const lp = getLaunchpadBySlug(request.params.slug);
    if (!lp || !lp.cardanoPaymentAddress) {
      reply.code(404).send({ error: "Launchpad not found or no Cardano address" });
      return;
    }

    const payments = await runPreparedQuery(
      getCardanoPayments.run({ payment_address: lp.cardanoPaymentAddress }, dbConn),
      "/api/cardano-payments",
    );

    reply.send({ payments });
  });

};
