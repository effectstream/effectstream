import { BatcherStatus, BuiltinEvents } from './builtin-events.ts';
import { EventManager } from './event-manager.ts';
import type { EventBrokerNames } from './types.ts';

let bestBlock = 0;

export async function setupInitialListeners(_broker: EventBrokerNames): Promise<void> {
  await EventManager.Instance.subscribe(
    {
      topic: BuiltinEvents.RollupBlock,
      filter: { block: undefined },
    },
    event => {
      bestBlock = Math.max(event.block, bestBlock);
    }
  );
}

/*
 * Helper to wait when batcher hash is processed by the STF
 */
export async function awaitBlockWS(blockHeight: number, maxTimeSec = 20): Promise<number> {
  const startTime = new Date().getTime();
  const checkTime = (): boolean => startTime + maxTimeSec * 1000 > new Date().getTime();

  while (bestBlock < blockHeight) {
    if (!checkTime) throw new Error('Block not processed');
    await wait(100);
  }
  return bestBlock;
}

/*
 * Helper to wait for batcher input hash, and then wait the for the corresponding block
 */
export function awaitBatcherHash(batchHash: string, maxTimeSec = 20): Promise<number> {
  const startTime = new Date().getTime();

  let subscriptionSymbol: Promise<symbol>;
  return Promise.race([
    (async (): Promise<number> => {
      await wait(maxTimeSec * 1000);
      throw new Error('TIMEOUT');
    })(),
    new Promise<number>((resolve, reject) => {
      subscriptionSymbol = EventManager.Instance.subscribe(
        {
          topic: BuiltinEvents.BatcherHash,
          filter: { batch: batchHash, status: BatcherStatus.Finalized },
        },
        event => {
          if (event.blockHeight == null) return; // should never happen thanks to the filter
          const remainingTime = maxTimeSec - (new Date().getTime() - startTime);
          awaitBlockWS(event.blockHeight, remainingTime)
            .then(resolve)
            .catch(e => reject(e.message));
        }
      );
    }),
  ]).finally(() => {
    if (subscriptionSymbol != null) {
      // note: it's okay that this doesn't happen right away
      void subscriptionSymbol.then(sym => EventManager.Instance.unsubscribe(sym));
    }
  });
}

const wait = async (ms: number): Promise<void> =>
  await new Promise<void>(resolve => {
    setTimeout(() => resolve(), ms);
  });
