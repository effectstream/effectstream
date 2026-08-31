import { Stm } from "@effectstream/sm";
import { grammar } from "./grammar.ts";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigAppStateTransitions } from "@effectstream/runtime";
import { type SyncStateUpdateStream, World } from "@effectstream/coroutine";
import {
  getUser,
  upsertUser,
  insertParticipation,
  insertUserItems,
  deleteUserItems,
  getParticipatedAmountTotal,
  getItemsPurchasedQuantityExceptUser,
  insertCardanoPayment,
  upsertCampaign,
  endCampaign,
  getCampaignByReceiver,
  getCampaignById,
  getActiveCampaign,
  getMintableItems,
  insertNftMint,
  upsertProduct,
  getProductsByCampaign,
  upsertCoin,
  getCoins,
  upsertCuratedPackage,
  upsertCuratedPackageItem,
  insertPayment,
  insertReferralReward,
} from "@preorder/database";
import { ZERO_ADDRESS } from "./launchpad-config.ts";
import { ADMIN_ADDRESS } from "./addresses.ts";
import { AppEvents } from "@preorder/shared/app-events";
import { decodeUtxorpcTx } from "./decode-utxorpc-tx.ts";
import { RECEIPT_POLICY_ID } from "./cardano-receipt.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

// In-memory view of a campaign's catalog, loaded from the deterministic config tables.
type LoadedItem = {
  id: number;
  kind: string; // 'standard' | 'reward'
  supply: number | null;
  // Unitless integer price P (standard item) or unlock threshold (reward item).
  price: bigint;
};

function* loadItems(campaignId: string): Generator<any, Map<number, LoadedItem>, any> {
  const products = yield* World.resolve(getProductsByCampaign, { campaign_id: campaignId });
  const items = new Map<number, LoadedItem>();
  for (const p of products) {
    items.set(p.item_id, {
      id: p.item_id,
      kind: p.kind,
      supply: p.supply ?? null,
      price: BigInt(p.price ?? 0),
    });
  }
  return items;
}

// An allowed coin: the amount owed in its smallest unit for a unitless price P is EXACTLY
// P * x * 10^n — pure BigInt math, so there is never a floating-point approximation error.
type LoadedCoin = {
  token: string;
  chain: string; // 'evm' | 'cardano'
  paymentToken: string; // lower-cased on-chain token address
  x: bigint;
  n: number;
  decimals: number;
};

function* loadCoins(): Generator<any, LoadedCoin[], any> {
  const rows = yield* World.resolve(getCoins, undefined);
  return rows.map((r) => ({
    token: r.token,
    chain: r.chain,
    paymentToken: String(r.payment_token).toLowerCase(),
    x: BigInt(r.x),
    n: r.n,
    decimals: r.decimals,
  }));
}

function coinAmount(price: bigint, coin: LoadedCoin): bigint {
  return price * coin.x * (10n ** BigInt(coin.n));
}

// ──────────────────────────────────────────────────────────────────────────
// Admin / config transitions — submitted on-chain via EffectstreamL2, authorized
// deterministically by comparing the input signer to the configured admin address.
// ──────────────────────────────────────────────────────────────────────────

function isAdmin(data: BaseStfInput): boolean {
  const signer = String(data.signerAddress ?? "").toLowerCase();
  if (signer !== ADMIN_ADDRESS) {
    console.log(`[STM:admin] unauthorized signer=${signer} (admin=${ADMIN_ADDRESS})`);
    return false;
  }
  return true;
}

function* writeProduct(
  campaignId: string,
  item: any,
): Generator<any, void, any> {
  const kind = item.kind === "reward" ? "reward" : "standard";
  yield* World.resolve(upsertProduct, {
    campaign_id: campaignId,
    item_id: Number(item.id),
    name: String(item.name ?? ""),
    description: String(item.description ?? ""),
    image: item.image ?? null,
    supply: item.supply != null ? Number(item.supply) : null,
    kind,
    // Unitless integer price P (standard) or unlock threshold (reward); per-coin amount = P*x*10^n.
    price: String(item.price ?? 0),
  });
}

stm.addStateTransition("create-campaign", function* (data) {
  if (!isAdmin(data)) return;
  const { campaignId, configJson } = data.parsedInput;
  const id = String(campaignId);

  let cfg: any;
  try {
    cfg = JSON.parse(String(configJson));
  } catch {
    console.log("[STM:create-campaign] invalid configJson");
    return;
  }

  yield* World.resolve(upsertCampaign, {
    campaign_id: id,
    slug: String(cfg.slug ?? id),
    name: String(cfg.name ?? ""),
    description: String(cfg.description ?? ""),
    image: cfg.image ?? null,
    launchpad_address: String(cfg.launchpadAddress ?? cfg.address ?? "").toLowerCase(),
    receiver: String(cfg.receiver ?? "").toLowerCase(),
    cardano_payment_address: cfg.cardanoPaymentAddress ?? null,
    cardano_payment_address_hex: cfg.cardanoPaymentAddressHex
      ? String(cfg.cardanoPaymentAddressHex).toLowerCase()
      : null,
    referral_discount_bps: Number(cfg.referralDiscountBps ?? 0),
    referrer_reward_bps: Number(cfg.referrerRewardBps ?? 0),
    ts_start_whitelist: cfg.timestampStartWhitelistSale != null
      ? String(cfg.timestampStartWhitelistSale)
      : null,
    ts_start_public: String(cfg.timestampStartPublicSale ?? 0),
    ts_end_sale: String(cfg.timestampEndSale ?? 9999999999),
    status: "active",
    admin: String(data.signerAddress ?? "").toLowerCase(),
    created_block: data.blockHeight,
  });

  for (const item of cfg.items ?? []) {
    yield* writeProduct(id, item);
  }

  for (const pkg of cfg.curatedPackages ?? []) {
    yield* World.resolve(upsertCuratedPackage, {
      campaign_id: id,
      package_name: String(pkg.name),
      description: String(pkg.description ?? ""),
    });
    for (const pi of pkg.items ?? []) {
      yield* World.resolve(upsertCuratedPackageItem, {
        campaign_id: id,
        package_name: String(pkg.name),
        item_id: Number(pi.id),
        quantity: Number(pi.quantity),
      });
    }
  }

  console.log(
    `[STM:create-campaign] campaign=${id} receiver=${String(cfg.receiver ?? "").toLowerCase()} items=${(cfg.items ?? []).length}`,
  );
});

stm.addStateTransition("set-product", function* (data) {
  if (!isAdmin(data)) return;
  const { campaignId, productJson } = data.parsedInput;
  let item: any;
  try {
    item = JSON.parse(String(productJson));
  } catch {
    console.log("[STM:set-product] invalid productJson");
    return;
  }
  yield* writeProduct(String(campaignId), item);
  console.log(`[STM:set-product] campaign=${campaignId} item=${item.id}`);
});

stm.addStateTransition("end-campaign", function* (data) {
  if (!isAdmin(data)) return;
  const { campaignId } = data.parsedInput;
  yield* World.resolve(endCampaign, { campaign_id: String(campaignId) });
  console.log(`[STM:end-campaign] ended ${campaignId}`);
});

// Update (or add) a payment coin's rate: amount = P * x * 10^n. Admin-only, on-chain.
stm.addStateTransition("set-coin", function* (data) {
  if (!isAdmin(data)) return;
  const { coinJson } = data.parsedInput;
  let c: any;
  try {
    c = JSON.parse(String(coinJson));
  } catch {
    console.log("[STM:set-coin] invalid coinJson");
    return;
  }
  yield* World.resolve(upsertCoin, {
    token: String(c.token).toLowerCase(),
    symbol: String(c.symbol ?? c.token).toUpperCase(),
    chain: String(c.chain ?? "evm"),
    payment_token: String(c.paymentToken ?? c.payment_token ?? ZERO_ADDRESS).toLowerCase(),
    type: String(c.type ?? ""),
    x: String(c.x ?? 1),
    n: Number(c.n ?? 0),
    decimals: Number(c.decimals ?? 18),
  });
  console.log(`[STM:set-coin] ${c.token} x=${c.x} n=${c.n}`);
});

// Post-sale NFT distribution. Once a campaign is ended, enqueue one mint job per
// (chain, buyer, item) for every item a buyer owns. The off-chain nft-dispatch
// worker drains these and submits them to the batcher. Deterministic + idempotent
// (re-running adds nothing new thanks to the nft_mints primary key).
stm.addStateTransition("mint-nfts", function* (data) {
  if (!isAdmin(data)) return;
  const { campaignId } = data.parsedInput;
  const id = String(campaignId);

  const [campaign] = yield* World.resolve(getCampaignById, { campaign_id: id });
  if (!campaign) {
    console.log(`[STM:mint-nfts] unknown campaign ${id}`);
    return;
  }
  if (campaign.status !== "ended") {
    console.log(`[STM:mint-nfts] campaign ${id} not ended (status=${campaign.status})`);
    return;
  }

  // launchpad_user_items is keyed by the campaign's launchpad address (see buy-items).
  const launchpad = String(campaign.launchpad_address);
  const rows = yield* World.resolve(getMintableItems, { launchpad });

  let count = 0;
  for (const r of rows) {
    yield* World.resolve(insertNftMint, {
      campaign_id: id,
      chain: r.chain,
      wallet: r.wallet,
      item_id: r.item_id,
      quantity: r.quantity,
      created_block: data.blockHeight,
    });
    count++;
  }
  console.log(`[STM:mint-nfts] campaign=${id} enqueued ${count} mint job(s)`);
});

// ──────────────────────────────────────────────────────────────────────────
// Purchase transitions
// ──────────────────────────────────────────────────────────────────────────

stm.addStateTransition("buy-items", function* (data) {
  const {
    receiver: rawReceiver,
    buyer: rawBuyer,
    paymentToken: rawPaymentToken,
    amount,
    referrer: rawReferrer,
    itemsIds: rawItemsIds,
    itemsQuantities: rawItemsQuantities,
  } = data.parsedInput;

  // `receiver` is the campaign-routing key; `buyer` (msg.sender) is the contributor we credit.
  const receiver = String(rawReceiver).toLowerCase();
  const buyer = String(rawBuyer).toLowerCase();
  const paymentToken = String(rawPaymentToken).toLowerCase();
  const referrer = String(rawReferrer).toLowerCase();
  const itemsIds: number[] = JSON.parse(String(rawItemsIds)).map(Number);
  const itemsQuantities: number[] = JSON.parse(String(rawItemsQuantities)).map(Number);
  const paymentAmount = String(amount);
  // No real per-input tx hash is exposed to the STM; synthesize a deterministic one.
  const txHash = `evm-blk${data.blockHeight}-${buyer}`;

  // Receiver filter: only process events whose receiver matches an active campaign.
  const [campaign] = yield* World.resolve(getCampaignByReceiver, { receiver });
  if (!campaign) {
    console.log(`[STM:buy-items] no active campaign for receiver=${receiver}; filtered out`);
    yield* World.resolve(insertPayment, {
      campaign_id: "",
      chain: "evm",
      wallet: buyer,
      payment_token: paymentToken,
      amount: paymentAmount,
      item_ids: itemsIds.join(","),
      item_quantities: itemsQuantities.join(","),
      tx_hash: txHash,
      output_index: null,
      block_height: data.blockHeight,
      status: "invalid",
      reason: "no-active-campaign",
      created_block: data.blockHeight,
    });
    return;
  }

  const campaignId = campaign.campaign_id;
  const launchpad = String(campaign.launchpad_address);

  const items = yield* loadItems(campaignId);
  const coins = yield* loadCoins();
  // Match the EVM coin by the on-chain payment token (ETH = zero address, USDC = MockERC20).
  const coin = coins.find((c) => c.chain === "evm" && c.paymentToken === paymentToken);

  // Payment-token consistency precondition (relative to the buyer's prior purchases).
  const [existingUser] = yield* World.resolve(getUser, { launchpad, wallet: buyer });
  const preconditionsMet = !existingUser || existingUser.payment_token === paymentToken;

  // Buyer's prior valid contribution total (for free-reward thresholds + cost coverage).
  const [participatedTotal] = yield* World.resolve(getParticipatedAmountTotal, {
    launchpad,
    wallet: buyer,
    payment_token: paymentToken,
  });
  const priorTotal = BigInt(participatedTotal?.sum ?? "0");

  let participationValid = false;
  let reason = "";
  if (!preconditionsMet) {
    reason = "payment-token-mismatch";
  } else if (!coin) {
    reason = "unsupported-coin";
  } else {
    const result = yield* validateItems(
      items,
      coin,
      itemsIds,
      itemsQuantities,
      referrer,
      buyer,
      launchpad,
      Number(campaign.referral_discount_bps ?? 0),
      priorTotal + BigInt(paymentAmount),
    );
    participationValid = result.ok;
    reason = result.reason;
  }

  yield* World.resolve(upsertUser, {
    launchpad,
    wallet: buyer,
    payment_token: paymentToken,
    total_amount: paymentAmount,
    last_referrer: referrer,
    last_participation_valid: participationValid,
    chain: "evm",
  });

  yield* World.resolve(insertParticipation, {
    launchpad,
    wallet: buyer,
    payment_token: paymentToken,
    payment_amount: paymentAmount,
    referrer,
    item_ids: itemsIds.join(","),
    item_quantities: itemsQuantities.join(","),
    tx_hash: txHash,
    block_height: data.blockHeight,
    preconditions_met: preconditionsMet,
    participation_valid: participationValid,
    chain: "evm",
  });

  yield* World.resolve(insertPayment, {
    campaign_id: campaignId,
    chain: "evm",
    wallet: buyer,
    payment_token: paymentToken,
    amount: paymentAmount,
    item_ids: itemsIds.join(","),
    item_quantities: itemsQuantities.join(","),
    tx_hash: txHash,
    output_index: null,
    block_height: data.blockHeight,
    status: participationValid ? "valid" : "invalid",
    reason,
    created_block: data.blockHeight,
  });

  if (participationValid) {
    yield* World.resolve(deleteUserItems, { launchpad, wallet: buyer });
    for (let i = 0; i < itemsIds.length; i++) {
      yield* World.resolve(insertUserItems, {
        launchpad,
        wallet: buyer,
        item_id: itemsIds[i],
        quantity: itemsQuantities[i],
      });
    }
  }

  data.emit(AppEvents.PreorderPlaced, {
    buyer,
    launchpad,
    itemIds: itemsIds,
    quantities: itemsQuantities,
    paymentToken,
    paymentAmount,
    participationValid,
  });

  console.log(
    `[STM:buy-items] campaign=${campaignId} buyer=${buyer} items=${itemsIds} valid=${participationValid}${reason ? ` reason=${reason}` : ""}`,
  );
});

function* validateItems(
  items: Map<number, LoadedItem>,
  coin: LoadedCoin,
  itemsIds: number[],
  itemsQuantities: number[],
  referrer: string,
  wallet: string,
  launchpad: string,
  referralDiscountBps: number,
  contributedTotal: bigint,
): Generator<any, { ok: boolean; reason: string }, any> {
  if (itemsIds.length !== itemsQuantities.length || itemsIds.length === 0) {
    return { ok: false, reason: "items-length-mismatch" };
  }
  if (itemsIds.length !== new Set(itemsIds).size) {
    return { ok: false, reason: "duplicate-items" };
  }

  let totalCost = 0n;
  let totalFreeItemsValue = 0n;

  for (let i = 0; i < itemsIds.length; i++) {
    const itemId = itemsIds[i];
    const quantity = itemsQuantities[i];
    const item = items.get(itemId);
    if (!item) {
      return { ok: false, reason: `unknown-item-${itemId}` };
    }

    // Required amount in this coin's smallest unit: P * x * 10^n (exact integer math).
    const amount = coinAmount(item.price, coin);
    if (item.kind !== "reward") {
      let itemCost = amount;
      if (referrer !== ZERO_ADDRESS && referralDiscountBps > 0) {
        itemCost -= (itemCost * BigInt(referralDiscountBps)) / 10000n;
      }
      totalCost += itemCost * BigInt(quantity);
    } else {
      totalFreeItemsValue += amount * BigInt(quantity);
    }

    if (item.supply !== null && item.supply !== undefined) {
      const [purchasedResult] = yield* World.resolve(getItemsPurchasedQuantityExceptUser, {
        launchpad,
        item_id: itemId,
        wallet,
      });
      const alreadyPurchased = Number(purchasedResult?.sum ?? 0);
      if (alreadyPurchased + quantity > item.supply) {
        return { ok: false, reason: `supply-exceeded-${itemId}` };
      }
    }
  }

  if (contributedTotal < totalCost) {
    return { ok: false, reason: "underpaid" };
  }
  if (totalFreeItemsValue > contributedTotal) {
    return { ok: false, reason: "free-threshold-not-met" };
  }
  return { ok: true, reason: "" };
}

// Capture the launchpad's on-chain ReferrerReward payouts (EVM).
stm.addStateTransition("referrer-reward", function* (data) {
  const {
    referrer: rawReferrer,
    buyer: rawBuyer,
    paymentToken: rawPaymentToken,
    amount,
  } = data.parsedInput;
  const referrer = String(rawReferrer).toLowerCase();
  const buyer = String(rawBuyer).toLowerCase();
  const paymentToken = String(rawPaymentToken).toLowerCase();

  // 1 node = 1 campaign: attribute the reward to the active campaign.
  const [campaign] = yield* World.resolve(getActiveCampaign, undefined);

  yield* World.resolve(insertReferralReward, {
    campaign_id: campaign?.campaign_id ?? "",
    referrer,
    buyer,
    chain: "evm",
    payment_token: paymentToken,
    amount: String(amount),
    tx_hash: `evm-rref-blk${data.blockHeight}-${buyer}`,
    block_height: data.blockHeight,
    created_block: data.blockHeight,
  });

  console.log(`[STM:referrer-reward] referrer=${referrer} buyer=${buyer} amount=${amount}`);
});

stm.addStateTransition("cardano-payment", function* (data) {
  const { bytes } = data.parsedInput as { hash: string; bytes: string };

  let tx;
  try {
    tx = decodeUtxorpcTx(String(bytes));
  } catch (e) {
    console.log("[STM:cardano-payment] failed to decode tx bytes:", String(e));
    return;
  }

  // 1 node = 1 campaign: route Cardano receipts to the active campaign.
  const [campaign] = yield* World.resolve(getActiveCampaign, undefined);
  if (!campaign) {
    console.log("[STM:cardano-payment] no active campaign");
    return;
  }
  const campaignId = campaign.campaign_id;
  const launchpad = String(campaign.launchpad_address);
  const cardanoHex = (campaign.cardano_payment_address_hex ?? "").toLowerCase();

  // Recover the buyer pkh (receipt token asset name) and sum lovelace paid to the launchpad.
  let buyerPkh: string | null = null;
  let paidLovelace = 0n;
  for (const out of tx.outputs) {
    for (const a of out.assets) {
      if (RECEIPT_POLICY_ID && a.policyId === RECEIPT_POLICY_ID) buyerPkh = a.assetName;
    }
    if (cardanoHex && out.address.toLowerCase() === cardanoHex) {
      paidLovelace += BigInt(out.coin);
    }
  }
  if (!buyerPkh) {
    console.log("[STM:cardano-payment] no receipt token found; ignoring tx", tx.txId);
    return;
  }

  // Parse label-42 metadata for items + sender + referrer: { "42": [ {k,v}, ... ] }
  let metaItems: [number, number][] | null = null;
  let metaSender: string | null = null;
  let metaReferrer: string | null = null;
  try {
    const label42 = (tx.metadata as any)?.["42"];
    if (Array.isArray(label42)) {
      const pEntry = label42.find((e: any) => e.k === "p");
      if (pEntry?.v === "preorder") {
        const wEntry = label42.find((e: any) => e.k === "w");
        if (wEntry?.v) {
          metaSender = Array.isArray(wEntry.v) ? wEntry.v.join("") : String(wEntry.v);
        }
        const iEntry = label42.find((e: any) => e.k === "i");
        if (Array.isArray(iEntry?.v)) {
          metaItems = iEntry.v.map((pair: any) => [Number(pair[0]), Number(pair[1])]);
        }
        const rEntry = label42.find((e: any) => e.k === "r");
        if (rEntry?.v) {
          metaReferrer = Array.isArray(rEntry.v) ? rEntry.v.join("") : String(rEntry.v);
        }
      }
    }
  } catch {
    // best-effort
  }

  // Always record the raw payment.
  yield* World.resolve(insertCardanoPayment, {
    tx_hash: tx.txId,
    output_index: 0,
    payment_address: campaign.cardano_payment_address || cardanoHex,
    amount: paidLovelace.toString(),
    block_height: data.blockHeight,
  });

  if (!metaItems || !metaSender) {
    console.log(`[STM:cardano-payment] receipt minted but no item metadata: tx=${tx.txId}`);
    yield* World.resolve(insertPayment, {
      campaign_id: campaignId,
      chain: "cardano",
      wallet: buyerPkh.toLowerCase(),
      payment_token: ZERO_ADDRESS,
      amount: paidLovelace.toString(),
      item_ids: "",
      item_quantities: "",
      tx_hash: tx.txId,
      output_index: 0,
      block_height: data.blockHeight,
      status: "invalid",
      reason: "no-item-metadata",
      created_block: data.blockHeight,
    });
    return;
  }

  const wallet = metaSender.toLowerCase();

  // Defense in depth: recompute the required lovelace from config (P * x * 10^n for the ADA coin).
  const items = yield* loadItems(campaignId);
  const coins = yield* loadCoins();
  const adaCoin = coins.find((c) => c.chain === "cardano");
  const referralDiscountBps = Number(campaign.referral_discount_bps ?? 0);
  let totalCostLovelace = 0n;
  let itemsValid = true;
  for (const [itemId, quantity] of metaItems) {
    const item = items.get(itemId);
    if (!item) {
      itemsValid = false;
      break;
    }
    if (item.kind !== "reward" && adaCoin) {
      let cost = coinAmount(item.price, adaCoin);
      // Mirror the EVM referral discount: a referred buyer pays less.
      if (metaReferrer && referralDiscountBps > 0) {
        cost -= (cost * BigInt(referralDiscountBps)) / 10000n;
      }
      totalCostLovelace += cost * BigInt(quantity);
    }
  }
  const participationValid = itemsValid && !!adaCoin && paidLovelace >= totalCostLovelace;
  const reason = participationValid
    ? ""
    : !itemsValid
      ? "unknown-item"
      : !adaCoin
        ? "no-ada-coin"
        : "underpaid";

  const referrer = metaReferrer ? metaReferrer.toLowerCase() : ZERO_ADDRESS;

  yield* World.resolve(upsertUser, {
    launchpad,
    wallet,
    payment_token: ZERO_ADDRESS,
    total_amount: paidLovelace.toString(),
    last_referrer: referrer,
    last_participation_valid: participationValid,
    chain: "cardano",
  });

  yield* World.resolve(insertParticipation, {
    launchpad,
    wallet,
    payment_token: ZERO_ADDRESS,
    payment_amount: paidLovelace.toString(),
    referrer,
    item_ids: metaItems.map(([id]) => id).join(","),
    item_quantities: metaItems.map(([, qty]) => qty).join(","),
    tx_hash: tx.txId,
    block_height: data.blockHeight,
    preconditions_met: true,
    participation_valid: participationValid,
    chain: "cardano",
  });

  yield* World.resolve(insertPayment, {
    campaign_id: campaignId,
    chain: "cardano",
    wallet,
    payment_token: ZERO_ADDRESS,
    amount: paidLovelace.toString(),
    item_ids: metaItems.map(([id]) => id).join(","),
    item_quantities: metaItems.map(([, qty]) => qty).join(","),
    tx_hash: tx.txId,
    output_index: 0,
    block_height: data.blockHeight,
    status: participationValid ? "valid" : "invalid",
    reason,
    created_block: data.blockHeight,
  });

  // Capture the referrer payout — the validator enforced an output of >= reward to the referrer.
  if (metaReferrer) {
    const reward = (paidLovelace * BigInt(campaign.referrer_reward_bps ?? 0)) / 10000n;
    yield* World.resolve(insertReferralReward, {
      campaign_id: campaignId,
      referrer,
      buyer: wallet,
      chain: "cardano",
      payment_token: ZERO_ADDRESS,
      amount: reward.toString(),
      tx_hash: tx.txId,
      block_height: data.blockHeight,
      created_block: data.blockHeight,
    });
  }

  if (participationValid) {
    yield* World.resolve(deleteUserItems, { launchpad, wallet });
    for (const [itemId, quantity] of metaItems) {
      yield* World.resolve(insertUserItems, { launchpad, wallet, item_id: itemId, quantity });
    }
  }

  data.emit(AppEvents.PreorderPlaced, {
    buyer: wallet,
    launchpad,
    itemIds: metaItems.map(([id]) => id),
    quantities: metaItems.map(([, qty]) => qty),
    paymentToken: ZERO_ADDRESS,
    paymentAmount: paidLovelace.toString(),
    participationValid,
  });

  console.log(
    `[STM:cardano-payment] processed receipt tx=${tx.txId} wallet=${wallet} valid=${participationValid}`,
  );
});

export const appStateTransitions: StartConfigAppStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
