import { runPreparedQuery } from "@effectstream/db";
import {
  getUser,
  getUserItems,
  getParticipations,
  getRefunds,
  getAllItemsPurchasedQuantity,
  getCardanoPayments,
  getAllCampaigns,
  getCampaignBySlug,
  getProductsByCampaign,
  getCoins,
  getCuratedPackagesByCampaign,
  getCuratedPackageItemsByCampaign,
  getPaymentsByCampaign,
  getPaymentsByStatus,
  getPaymentsByWallet,
  getReferralRewardsByCampaign,
} from "@preorder/database";
import { MOCK_USDC_ADDRESS } from "./launchpad-config.ts";
import { EXTRA_ADDRESSES } from "./addresses.ts";
import { RECEIPT_POLICY_ID, RECEIPT_SCRIPT } from "./cardano-receipt.ts";

import type { Pool } from "pg";
import type { StartConfigApiRouter } from "@effectstream/runtime";
import type { FastifyInstance } from "fastify";

type CoinResponse = {
  token: string;
  symbol: string;
  chain: string;
  paymentToken: string;
  type: string;
  x: string;
  n: number;
  decimals: number;
};

type ItemResponse = {
  id: number;
  name: string;
  description: string;
  image?: string;
  supply?: number;
  purchased: number;
  kind: string; // 'standard' | 'reward'
  price: string; // unitless integer P (as string)
  amounts: Record<string, string>; // coin token -> smallest-unit amount = P * x * 10^n
  // Legacy shape (keyed by coin token, not address): `prices` for standard items, `freeAt` for
  // reward items. Lets the frontend index by the active coin id without further changes.
  prices?: Record<string, string>;
  freeAt?: Record<string, string>;
};

async function loadCoins(dbConn: Pool): Promise<CoinResponse[]> {
  const rows = await runPreparedQuery(getCoins.run(undefined, dbConn), "/coins");
  return rows.map((r) => ({
    token: r.token,
    symbol: r.symbol,
    chain: r.chain,
    paymentToken: r.payment_token,
    type: r.type,
    x: r.x,
    n: r.n,
    decimals: r.decimals,
  }));
}

// amount = P * x * 10^n in the coin's smallest unit — exact BigInt math, no float rounding.
function coinAmount(price: bigint, coin: CoinResponse): string {
  return (price * BigInt(coin.x) * (10n ** BigInt(coin.n))).toString();
}

// Per-item unitless price + derived per-coin amounts + on-chain purchased counts for a campaign.
async function loadItems(
  dbConn: Pool,
  campaignId: string,
  launchpad: string,
  coins: CoinResponse[],
): Promise<ItemResponse[]> {
  const products = await runPreparedQuery(
    getProductsByCampaign.run({ campaign_id: campaignId }, dbConn),
    "/loadItems/products",
  );
  const counts = await runPreparedQuery(
    getAllItemsPurchasedQuantity.run({ launchpad }, dbConn),
    "/loadItems/counts",
  );

  return products.map((p) => {
    const price = BigInt(p.price ?? 0);
    const amounts: Record<string, string> = {};
    for (const c of coins) amounts[c.token] = coinAmount(price, c);
    const purchased = Number(counts.find((c) => c.item_id === p.item_id)?.sum ?? 0);
    const item: ItemResponse = {
      id: p.item_id,
      name: p.name,
      description: p.description,
      image: p.image ?? undefined,
      supply: p.supply ?? undefined,
      purchased,
      kind: p.kind,
      price: price.toString(),
      amounts,
    };
    if (p.kind === "reward") item.freeAt = amounts;
    else item.prices = amounts;
    return item;
  });
}

async function loadCuratedPackages(dbConn: Pool, campaignId: string) {
  const packages = await runPreparedQuery(
    getCuratedPackagesByCampaign.run({ campaign_id: campaignId }, dbConn),
    "/curated/packages",
  );
  const items = await runPreparedQuery(
    getCuratedPackageItemsByCampaign.run({ campaign_id: campaignId }, dbConn),
    "/curated/items",
  );
  return packages.map((pkg) => ({
    name: pkg.package_name,
    description: pkg.description,
    items: items
      .filter((i) => i.package_name === pkg.package_name)
      .map((i) => ({ id: i.item_id, quantity: i.quantity })),
  }));
}

export const apiRouter: StartConfigApiRouter = async function (
  server: FastifyInstance,
  dbConn: Pool,
): Promise<void> {
  // Deployed contract addresses + admin, so the frontend can submit EffectstreamL2 inputs.
  server.get("/api/config", async (_request, reply) => {
    const coins = await loadCoins(dbConn);
    reply.send({
      launchpad: EXTRA_ADDRESSES.launchpadProxy,
      effectStreamL2: EXTRA_ADDRESSES.effectStreamL2,
      mockUsdc: MOCK_USDC_ADDRESS,
      admin: EXTRA_ADDRESSES.admin,
      chainId: 31337,
      evmRpc: "http://localhost:8545",
      cardanoReceiptPolicyId: RECEIPT_POLICY_ID,
      // Applied PlutusV3 script so the frontend can mint the on-chain purchase receipt.
      cardanoReceiptScript: RECEIPT_SCRIPT,
      coins,
    });
  });

  // List all campaigns (DB-backed).
  server.get("/api/launchpads", async (_request, reply) => {
    const campaigns = await runPreparedQuery(getAllCampaigns.run(undefined, dbConn), "/api/launchpads");
    reply.send({
      launchpads: campaigns.map((c) => ({
        slug: c.slug,
        name: c.name,
        description: c.description,
        image: c.image ?? undefined,
        status: c.status,
      })),
    });
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

  // Single campaign detail with purchased counts.
  server.get<{ Params: { slug: string } }>(
    "/api/launchpad/:slug",
    async (request, reply) => {
      const [campaign] = await runPreparedQuery(
        getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
        "/api/launchpad",
      );
      if (!campaign) {
        reply.code(404).send({ error: "Launchpad not found" });
        return;
      }
      const coins = await loadCoins(dbConn);
      const items = await loadItems(dbConn, campaign.campaign_id, campaign.launchpad_address, coins);
      const curatedPackages = await loadCuratedPackages(dbConn, campaign.campaign_id);

      reply.send({
        coins,
        slug: campaign.slug,
        name: campaign.name,
        description: campaign.description,
        image: campaign.image ?? undefined,
        address: campaign.launchpad_address,
        receiver: campaign.receiver,
        cardanoPaymentAddress: campaign.cardano_payment_address ?? undefined,
        status: campaign.status,
        items,
        curatedPackages,
        timestampStartPublicSale: Number(campaign.ts_start_public),
        timestampEndSale: Number(campaign.ts_end_sale),
        referralDiscountBps: campaign.referral_discount_bps,
        referrerRewardBps: campaign.referrer_reward_bps,
      });
    },
  );

  // User data + items.
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string };
  }>("/api/userData/:slug", async (request, reply) => {
    const [campaign] = await runPreparedQuery(
      getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
      "/api/userData/campaign",
    );
    if (!campaign) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }
    const launchpad = campaign.launchpad_address;
    const [user] = await runPreparedQuery(getUser.run({ launchpad, wallet }, dbConn), "/api/userData");
    const items = await runPreparedQuery(getUserItems.run({ launchpad, wallet }, dbConn), "/api/userData/items");
    reply.send({ user: user ?? null, items });
  });

  // Participation history.
  server.get<{
    Params: { slug: string };
    Querystring: { wallet: string };
  }>("/api/participations/:slug", async (request, reply) => {
    const [campaign] = await runPreparedQuery(
      getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
      "/api/participations/campaign",
    );
    if (!campaign) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }
    const participations = await runPreparedQuery(
      getParticipations.run({ launchpad: campaign.launchpad_address, wallet }, dbConn),
      "/api/participations",
    );
    reply.send({ participations });
  });

  // Refund-eligible participations.
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string };
  }>("/api/refunds/:slug", async (request, reply) => {
    const [campaign] = await runPreparedQuery(
      getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
      "/api/refunds/campaign",
    );
    if (!campaign) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }
    const refunds = await runPreparedQuery(
      getRefunds.run({ launchpad: campaign.launchpad_address, wallet }, dbConn),
      "/api/refunds",
    );
    reply.send({ refunds });
  });

  // Unified payments ledger (EVM + Cardano) with valid/invalid status.
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string; status?: string };
  }>("/api/payments/:slug", async (request, reply) => {
    const [campaign] = await runPreparedQuery(
      getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
      "/api/payments/campaign",
    );
    if (!campaign) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const campaign_id = campaign.campaign_id;
    const wallet = request.query.wallet?.toLowerCase();
    const status = request.query.status?.toLowerCase();

    let payments;
    if (wallet) {
      payments = await runPreparedQuery(getPaymentsByWallet.run({ campaign_id, wallet }, dbConn), "/api/payments/wallet");
    } else if (status) {
      payments = await runPreparedQuery(getPaymentsByStatus.run({ campaign_id, status }, dbConn), "/api/payments/status");
    } else {
      payments = await runPreparedQuery(getPaymentsByCampaign.run({ campaign_id }, dbConn), "/api/payments");
    }
    reply.send({ payments });
  });

  // Admin dashboard: full campaign status (config + products + payments + counts).
  server.get<{ Params: { slug: string } }>(
    "/api/admin/status/:slug",
    async (request, reply) => {
      const [campaign] = await runPreparedQuery(
        getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
        "/api/admin/status/campaign",
      );
      if (!campaign) {
        reply.code(404).send({ error: "Launchpad not found" });
        return;
      }
      const coins = await loadCoins(dbConn);
      const items = await loadItems(dbConn, campaign.campaign_id, campaign.launchpad_address, coins);
      const payments = await runPreparedQuery(
        getPaymentsByCampaign.run({ campaign_id: campaign.campaign_id }, dbConn),
        "/api/admin/status/payments",
      );
      const referralRewards = await runPreparedQuery(
        getReferralRewardsByCampaign.run({ campaign_id: campaign.campaign_id }, dbConn),
        "/api/admin/status/referrals",
      );
      const nftMintsRes = await dbConn.query(
        `SELECT chain, wallet, item_id, quantity, status, tx_hash, error
         FROM nft_mints WHERE campaign_id = $1 ORDER BY wallet, item_id`,
        [campaign.campaign_id],
      );
      const nftMints = nftMintsRes.rows;
      const nftMintSummary = nftMints.reduce(
        (acc: Record<string, number>, m: { status: string }) => {
          acc[m.status] = (acc[m.status] ?? 0) + 1;
          return acc;
        },
        {},
      );
      const valid = payments.filter((p) => p.status === "valid").length;
      const invalid = payments.filter((p) => p.status === "invalid").length;
      reply.send({
        coins,
        referralRewards,
        nftMints,
        nftMintSummary,
        campaign: {
          campaignId: campaign.campaign_id,
          slug: campaign.slug,
          name: campaign.name,
          status: campaign.status,
          launchpad: campaign.launchpad_address,
          receiver: campaign.receiver,
          cardanoPaymentAddress: campaign.cardano_payment_address ?? undefined,
          admin: campaign.admin,
          referralDiscountBps: campaign.referral_discount_bps,
          referrerRewardBps: campaign.referrer_reward_bps,
        },
        items,
        payments,
        summary: { total: payments.length, valid, invalid },
      });
    },
  );

  // Minted NFTs owned by a wallet (populated after the admin finalises the sale).
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string };
  }>("/api/nfts/:slug", async (request, reply) => {
    const [campaign] = await runPreparedQuery(
      getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
      "/api/nfts/campaign",
    );
    if (!campaign) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }
    const result = await dbConn.query(
      `SELECT chain, item_id, token_id, policy_id, tx_hash
       FROM minted_nfts WHERE campaign_id = $1 AND wallet = $2
       ORDER BY item_id, token_id`,
      [campaign.campaign_id, wallet],
    );
    reply.send({ nfts: result.rows });
  });

  // Marketplace integration — item metadata.
  server.get<{ Params: { slug: string } }>(
    "/api/marketplace/items/:slug",
    async (request, reply) => {
      const [campaign] = await runPreparedQuery(
        getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
        "/api/marketplace/items/campaign",
      );
      if (!campaign) {
        reply.code(404).send({ error: "Launchpad not found" });
        return;
      }
      const coins = await loadCoins(dbConn);
      const items = await loadItems(dbConn, campaign.campaign_id, campaign.launchpad_address, coins);
      reply.send({
        launchpad: campaign.slug,
        name: campaign.name,
        coins,
        items: items.map((item) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          image: item.image ?? null,
          supply: item.supply ?? null,
          purchased: item.purchased,
          kind: item.kind,
          price: item.price,
          amounts: item.amounts,
        })),
      });
    },
  );

  // Marketplace integration — ownership records.
  server.get<{
    Params: { slug: string };
    Querystring: { wallet?: string };
  }>("/api/marketplace/ownership/:slug", async (request, reply) => {
    const [campaign] = await runPreparedQuery(
      getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
      "/api/marketplace/ownership/campaign",
    );
    if (!campaign) {
      reply.code(404).send({ error: "Launchpad not found" });
      return;
    }
    const wallet = request.query.wallet?.toLowerCase();
    if (!wallet) {
      reply.code(400).send({ error: "wallet query param required" });
      return;
    }
    const items = await runPreparedQuery(
      getUserItems.run({ launchpad: campaign.launchpad_address, wallet }, dbConn),
      "/api/marketplace/ownership",
    );
    reply.send({
      launchpad: campaign.slug,
      wallet,
      items: items.map((i) => ({ item_id: i.item_id, quantity: i.quantity })),
    });
  });

  // Cardano payments info.
  server.get<{
    Params: { slug: string };
  }>("/api/cardano-payments/:slug", async (request, reply) => {
    const [campaign] = await runPreparedQuery(
      getCampaignBySlug.run({ slug: request.params.slug }, dbConn),
      "/api/cardano-payments/campaign",
    );
    if (!campaign || !campaign.cardano_payment_address) {
      reply.code(404).send({ error: "Launchpad not found or no Cardano address" });
      return;
    }
    const payments = await runPreparedQuery(
      getCardanoPayments.run({ payment_address: campaign.cardano_payment_address }, dbConn),
      "/api/cardano-payments",
    );
    reply.send({ payments });
  });
};
