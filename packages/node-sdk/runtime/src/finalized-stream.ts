/**
 * Bounded hand-off queue between the merge (producer) and the apply loop (consumer).
 *
 * The merge sends finalized blocks into an effection channel; the apply loop drains
 * them. effection channel subscribers buffer unbounded, so during deep catch-up the
 * merge (no I/O) outpaces the apply loop and the queue grows toward the whole backlog
 * → OOM (sync/CLAUDE.md Finding #1) — especially with empty-block coalescing removing
 * the per-block apply brake.
 *
 * This wraps the channel with backpressure: the producer blocks once `cap` produced
 * blocks are still unconsumed, and the consumer wakes it as it drains. The cap only
 * ever throttles the producer (the consumer always keeps pulling), so it can't
 * deadlock. `inFlight = produced − consumed` is the live queue depth, surfaced on
 * /debug/metrics.
 */
import { type Channel, createChannel, type Operation } from "effection";
import { conditionVariable } from "@effectstream/utils";
import type { ChainBlock } from "@effectstream/sync";
import {
  finalizedStreamStatus,
  recordConsumed,
  recordProduced,
} from "./api/stream-status.ts";
import type { FinalizedBlockSubscription } from "./coalesce.ts";

export type BoundedFinalizedStream = {
  /** Send side — hand to `startMerge`. `send` blocks the producer at the cap. */
  stream: Channel<ChainBlock, void>;
  /** Read side — hand to the coalescer / apply loop. Counts drains and wakes the producer. */
  subscription: FinalizedBlockSubscription;
};

export function* createBoundedFinalizedStream(
  cap: number,
): Operation<BoundedFinalizedStream> {
  const channel = createChannel<ChainBlock>();
  // Subscribe BEFORE the caller spawns the merge: effection channels drop sends
  // with no subscriber, so a fast restart could emit blocks before we subscribe
  // and stall at the pre-restart height.
  const subscription = yield* channel;

  const drained = conditionVariable<void>();
  const inFlight = () =>
    finalizedStreamStatus.produced - finalizedStreamStatus.consumed;

  // `startMerge` only uses `.send`; gate it. check-then-wait is atomic under
  // effection's cooperative scheduling, so there's no lost wakeup.
  const stream: Channel<ChainBlock, void> = {
    ...channel,
    *send(block: ChainBlock) {
      while (inFlight() >= cap) {
        yield* drained.wait();
      }
      recordProduced();
      yield* channel.send(block);
    },
  };

  // Count consumed at the pull point (exact channel depth, decoupled from the
  // coalescer's run length) and wake the merge once the queue drops below cap.
  const countedSubscription: FinalizedBlockSubscription = {
    *next() {
      const result = yield* subscription.next();
      if (!result.done) {
        recordConsumed(1);
        if (inFlight() < cap) drained.wake();
      }
      return result;
    },
  };

  return { stream, subscription: countedSubscription };
}
