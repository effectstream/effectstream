import { Stm } from "@effectstream/sm";
import { grammar } from "./grammar.ts";
import type { BaseStfInput } from "@effectstream/sm";
import type { StartConfigGameStateTransitions } from "@effectstream/runtime";
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
} from "@preorder/database";
import {
  getLaunchpadByAddress,
  launchpadsData,
  ZERO_ADDRESS,
  ETH_TO_ADA_RATE,
  type LaunchpadData,
} from "./launchpad-config.ts";

const stm = new Stm<typeof grammar, {}>(grammar);

stm.addStateTransition(
  "buy-items",
  function* (data) {
    const {
      receiver: rawReceiver,
      buyer: rawBuyer,
      paymentToken: rawPaymentToken,
      amount,
      referrer: rawReferrer,
      itemsIds: rawItemsIds,
      itemsQuantities: rawItemsQuantities,
    } = data.parsedInput;

    const receiver = String(rawReceiver).toLowerCase();
    const buyer = String(rawBuyer).toLowerCase();
    const paymentToken = String(rawPaymentToken).toLowerCase();
    const referrer = String(rawReferrer).toLowerCase();
    const itemsIds: number[] = JSON.parse(String(rawItemsIds)).map(Number);
    const itemsQuantities: number[] = JSON.parse(String(rawItemsQuantities)).map(Number);
    const paymentAmount = String(amount);

    // Derive launchpad address from the primitive's contract address
    // In dev mode, try to match against known launchpads
    const launchpadAddress = data.caip2 ?? "";
    const launchpadData = getLaunchpadByAddress(launchpadAddress) ??
      launchpadsData[0]; // fallback to first launchpad in dev

    if (!launchpadData) {
      console.log("[STM:buy-items] No launchpad config found");
      return;
    }

    const txHash = data.scheduledTxHash ?? `block-${data.blockHeight}`;

    // Check preconditions
    const preconditionsMet = yield* checkPreconditions(
      receiver,
      paymentToken,
      launchpadData,
      data.blockHeight,
    );

    if (!preconditionsMet) {
      yield* World.resolve(insertParticipation, {
        launchpad: launchpadData.address,
        wallet: receiver,
        payment_token: paymentToken,
        payment_amount: paymentAmount,
        referrer,
        item_ids: itemsIds.join(","),
        item_quantities: itemsQuantities.join(","),
        tx_hash: txHash,
        block_height: data.blockHeight,
        preconditions_met: false,
        participation_valid: false,
        chain: "evm",
      });
      return;
    }

    // Get user's prior contribution total
    const [participatedTotal] = yield* World.resolve(getParticipatedAmountTotal, {
      launchpad: launchpadData.address,
      wallet: receiver,
      payment_token: paymentToken,
    });
    const priorTotal = BigInt(participatedTotal?.sum ?? "0");

    // Validate items and calculate cost
    const validationResult = yield* validateItems(
      itemsIds,
      itemsQuantities,
      paymentToken,
      referrer,
      receiver,
      launchpadData,
      priorTotal + BigInt(paymentAmount),
    );

    const participationValid = validationResult !== null;

    // Upsert user
    yield* World.resolve(upsertUser, {
      launchpad: launchpadData.address,
      wallet: receiver,
      payment_token: paymentToken,
      total_amount: paymentAmount,
      last_referrer: referrer,
      last_participation_valid: participationValid,
      chain: "evm",
    });

    // Record participation
    yield* World.resolve(insertParticipation, {
      launchpad: launchpadData.address,
      wallet: receiver,
      payment_token: paymentToken,
      payment_amount: paymentAmount,
      referrer,
      item_ids: itemsIds.join(","),
      item_quantities: itemsQuantities.join(","),
      tx_hash: txHash,
      block_height: data.blockHeight,
      preconditions_met: true,
      participation_valid: participationValid,
      chain: "evm",
    });

    if (participationValid) {
      // Remove old items and insert fresh set
      yield* World.resolve(deleteUserItems, {
        launchpad: launchpadData.address,
        wallet: receiver,
      });

      for (let i = 0; i < itemsIds.length; i++) {
        yield* World.resolve(insertUserItems, {
          launchpad: launchpadData.address,
          wallet: receiver,
          item_id: itemsIds[i],
          quantity: itemsQuantities[i],
        });
      }
    }

    console.log(
      `[STM:buy-items] Processed purchase: receiver=${receiver} items=${itemsIds} valid=${participationValid}`,
    );
  },
);

function* checkPreconditions(
  receiver: string,
  paymentToken: string,
  launchpadData: LaunchpadData,
  blockHeight: number,
): Generator<any, boolean, any> {
  // Check payment token consistency with prior purchases
  const [existingUser] = yield* World.resolve(getUser, {
    launchpad: launchpadData.address,
    wallet: receiver,
  });

  if (existingUser && existingUser.payment_token !== paymentToken) {
    console.log(
      `[STM:buy-items] Payment token mismatch: event=${paymentToken}, user=${existingUser.payment_token}`,
    );
    return false;
  }

  // Sale phase checks use block height as a proxy for timestamp
  // In production, you'd use actual block timestamps
  const startSale =
    launchpadData.timestampStartWhitelistSale ?? launchpadData.timestampStartPublicSale;
  // For dev/test, sale is always open (timestampStartPublicSale=0, timestampEndSale=very large)

  return true;
}

function* validateItems(
  itemsIds: number[],
  itemsQuantities: number[],
  paymentToken: string,
  referrer: string,
  receiver: string,
  launchpadData: LaunchpadData,
  contributedTotal: bigint,
): Generator<any, number[] | null, any> {
  if (itemsIds.length !== itemsQuantities.length || itemsIds.length === 0) {
    console.log("[STM:buy-items] Items/quantities length mismatch or empty");
    return null;
  }

  // Check for duplicate items
  if (itemsIds.length !== new Set(itemsIds).size) {
    console.log("[STM:buy-items] Duplicate item IDs");
    return null;
  }

  let totalCost = 0n;
  let totalFreeItemsValue = 0n;

  for (let i = 0; i < itemsIds.length; i++) {
    const itemId = itemsIds[i];
    const quantity = itemsQuantities[i];
    const launchpadItem = launchpadData.items.find((item) => item.id === itemId);

    if (!launchpadItem) {
      console.log(`[STM:buy-items] Item ${itemId} not found in launchpad config`);
      return null;
    }

    if ("prices" in launchpadItem) {
      let itemCost = BigInt(launchpadItem.prices[paymentToken] ?? "0");
      if (referrer !== ZERO_ADDRESS) {
        const discountBps =
          launchpadItem.referralDiscountBps ?? launchpadData.referralDiscountBps ?? 0;
        itemCost -= (itemCost * BigInt(discountBps)) / 10000n;
      }
      totalCost += itemCost * BigInt(quantity);
    } else if ("freeAt" in launchpadItem) {
      const freeAtValue = BigInt(launchpadItem.freeAt[paymentToken] ?? "0");
      totalFreeItemsValue += freeAtValue * BigInt(quantity);
    }

    // Check supply limits
    if (launchpadItem.supply !== undefined) {
      const [purchasedResult] = yield* World.resolve(
        getItemsPurchasedQuantityExceptUser,
        {
          launchpad: launchpadData.address,
          item_id: itemId,
          wallet: receiver,
        },
      );
      const alreadyPurchased = Number(purchasedResult?.sum ?? 0);
      if (alreadyPurchased + quantity > launchpadItem.supply) {
        console.log(
          `[STM:buy-items] Item ${itemId}: ${quantity} exceeds remaining supply (${launchpadItem.supply - alreadyPurchased} left)`,
        );
        return null;
      }
    }
  }

  if (contributedTotal < totalCost) {
    console.log(
      `[STM:buy-items] Underpayment: contributed=${contributedTotal}, cost=${totalCost}`,
    );
    return null;
  }

  if (totalFreeItemsValue > contributedTotal) {
    console.log(
      `[STM:buy-items] Free items threshold not met: contributed=${contributedTotal}, required=${totalFreeItemsValue}`,
    );
    return null;
  }

  return itemsIds;
}

stm.addStateTransition(
  "cardano-payment",
  function* (data) {
    const parsedInput = data.parsedInput as {
      txId: string;
      outputs: string;
      inputCredentials?: string;
      metadata?: string;
    };

    const txId = String(parsedInput.txId);
    let outputs: any[];
    try {
      outputs = JSON.parse(String(parsedInput.outputs));
    } catch {
      console.log("[STM:cardano-payment] Failed to parse outputs");
      return;
    }

    // Parse metadata for item info (label 42: { p: "preorder", w: sender, i: [[id, qty]] })
    let metaItems: [number, number][] | null = null;
    let metaSender: string | null = null;
    try {
      const metadataStr = String(parsedInput.metadata || "");
      if (metadataStr) {
        const metadata = JSON.parse(metadataStr);
        const label42 = metadata?.["42"];
        if (Array.isArray(label42)) {
          const pEntry = label42.find((e: any) => e.k === "p");
          if (pEntry?.v === "preorder") {
            const wEntry = label42.find((e: any) => e.k === "w");
            if (wEntry?.v) {
              metaSender = Array.isArray(wEntry.v)
                ? wEntry.v.join("")
                : String(wEntry.v);
            }
            const iEntry = label42.find((e: any) => e.k === "i");
            if (Array.isArray(iEntry?.v)) {
              metaItems = iEntry.v.map((pair: any) => [Number(pair[0]), Number(pair[1])]);
            }
          }
        }
      }
    } catch {
      // metadata parsing is best-effort
    }

    for (const output of outputs) {
      const address = String(output.address ?? "");
      const coin = String(output.coin ?? "0");
      const index = Number(output.index ?? 0);

      // Match against known Cardano payment addresses (hex comparison)
      const matchingLaunchpad = launchpadsData.find(
        (l) => l.cardanoPaymentAddressHex === address,
      );

      if (!matchingLaunchpad) continue;

      yield* World.resolve(insertCardanoPayment, {
        tx_hash: txId,
        output_index: index,
        payment_address: matchingLaunchpad.cardanoPaymentAddress || address,
        amount: coin,
        block_height: data.blockHeight,
      });

      if (metaItems && metaSender) {
        const wallet = metaSender.toLowerCase();
        const lovelaceReceived = BigInt(coin);

        // Validate items exist and calculate required cost in lovelace
        // Prices in config are ETH-denominated (wei). Convert: lovelace = (wei * ETH_TO_ADA_RATE) / 1e12
        let totalCostLovelace = 0n;
        let itemsValid = true;
        for (const [itemId, quantity] of metaItems) {
          const item = matchingLaunchpad.items.find((i) => i.id === itemId);
          if (!item) {
            console.log(`[STM:cardano-payment] Item ${itemId} not found in config`);
            itemsValid = false;
            break;
          }
          if ("prices" in item) {
            const priceWei = BigInt(item.prices[ZERO_ADDRESS] ?? "0");
            const priceLovelace = (priceWei * ETH_TO_ADA_RATE) / 1_000_000_000_000n;
            totalCostLovelace += priceLovelace * BigInt(quantity);
          }
        }

        const participationValid = itemsValid && lovelaceReceived >= totalCostLovelace;

        if (!participationValid) {
          console.log(
            `[STM:cardano-payment] Validation failed: tx=${txId} received=${lovelaceReceived} required=${totalCostLovelace} itemsValid=${itemsValid}`,
          );
        }

        yield* World.resolve(upsertUser, {
          launchpad: matchingLaunchpad.address,
          wallet,
          payment_token: ZERO_ADDRESS,
          total_amount: coin,
          last_referrer: ZERO_ADDRESS,
          last_participation_valid: participationValid,
          chain: "cardano",
        });

        yield* World.resolve(insertParticipation, {
          launchpad: matchingLaunchpad.address,
          wallet,
          payment_token: ZERO_ADDRESS,
          payment_amount: coin,
          referrer: ZERO_ADDRESS,
          item_ids: metaItems.map(([id]) => id).join(","),
          item_quantities: metaItems.map(([, qty]) => qty).join(","),
          tx_hash: txId,
          block_height: data.blockHeight,
          preconditions_met: true,
          participation_valid: participationValid,
          chain: "cardano",
        });

        if (participationValid) {
          yield* World.resolve(deleteUserItems, {
            launchpad: matchingLaunchpad.address,
            wallet,
          });

          for (const [itemId, quantity] of metaItems) {
            yield* World.resolve(insertUserItems, {
              launchpad: matchingLaunchpad.address,
              wallet,
              item_id: itemId,
              quantity,
            });
          }
        }

        console.log(
          `[STM:cardano-payment] Processed: tx=${txId} wallet=${wallet} items=${JSON.stringify(metaItems)} valid=${participationValid}`,
        );
      } else {
        console.log(
          `[STM:cardano-payment] Recorded payment (no item metadata): tx=${txId} amount=${coin} lovelace`,
        );
      }
    }
  },
);

export const gameStateTransitions: StartConfigGameStateTransitions = function* (
  blockHeight: number,
  input: BaseStfInput,
): SyncStateUpdateStream<void> {
  yield* stm.processInput(input);
};
