import { Type } from "@sinclair/typebox";
import { genEvent, registerEvents } from "@effectstream/event-client";

/**
 * Custom app events emitted by the preorder state machine.
 *
 * `blockHeight` is auto-prepended as the first indexed field by
 * `registerEvents` — apps never declare or set it. Subscribers can filter on
 * it (`blockHeight: 42`) or wildcard it (`blockHeight: undefined`).
 *
 * Emit pattern (in `state-machine.ts`):
 *   data.emit(AppEvents.PreorderPlaced, {
 *     buyer, launchpad, itemIds, quantities, paymentAmount, participationValid,
 *   });
 *
 * Subscribe pattern (in the frontend):
 *   EventManager.Instance.subscribe(
 *     { topic: AppEvents.PreorderPlaced,
 *       filter: { buyer: myAddress, launchpad: undefined, blockHeight: undefined } },
 *     (e) => { /* update UI *\/ },
 *   );
 *
 * Delivery is post-COMMIT: when a subscriber receives an event, a follow-up
 * API call will see the corresponding DB rows. See the runtime plan invariants
 * I1 (read-your-writes) and I2 (rollback drops events).
 */
export const AppEvents = registerEvents({
  PreorderPlaced: genEvent({
    name: "PreorderPlaced",
    fields: [
      // Buyer wallet address (lower-cased EVM or Cardano address). Indexed so
      // the frontend can filter to only the current user's purchases.
      { name: "buyer", type: Type.String(), indexed: true },
      // Launchpad contract address. Indexed so the frontend can subscribe to
      // a specific launchpad without seeing events from other launchpads.
      { name: "launchpad", type: Type.String(), indexed: true },
      // Body fields below are not indexed — they're delivered in the payload.
      { name: "itemIds", type: Type.Array(Type.Number()) },
      { name: "quantities", type: Type.Array(Type.Number()) },
      { name: "paymentToken", type: Type.String() },
      { name: "paymentAmount", type: Type.String() }, // stringified BigInt
      { name: "participationValid", type: Type.Boolean() },
    ],
  }),
});
