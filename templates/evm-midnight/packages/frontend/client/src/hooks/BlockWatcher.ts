import { BuiltinEvents, PaimaEventManager } from "@effectstream/event-client";

// Singleton class to watch for block updates.
export class BlockWatcher {
  // 1. A private static property to hold the single instance of the class.
  private static _instance: BlockWatcher;

  // 2. Private properties to hold the state.
  private readonly latestBlock: Record<string, number> = {};
  private initializationPromise: Promise<void> | null = null;

  // 3. A private constructor prevents creating new instances with `new BlockWatcher()`.
  private constructor() {}

  public static get Instance(): BlockWatcher {
    if (!BlockWatcher._instance) {
      BlockWatcher._instance = new BlockWatcher();
    }
    return BlockWatcher._instance;
  }

  // --- PUBLIC API METHODS ---

  /**
   * Waits for a specific chain to reach a target block number.
   * It automatically triggers initialization on the first call.
   */
  public async waitForBlock(
    chain: string = "__main__",
    block?: number | bigint,
  ): Promise<number> {
    await this.ensureInitialized();
    const targetChain = chain;
    let currentBlock: number = this.latestBlock[targetChain] ?? 0;
    const targetBlock: number = Number(block ?? currentBlock + 1);
    while (currentBlock < targetBlock) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      currentBlock = this.latestBlock[targetChain] ?? 0;
    }
    return currentBlock;
  }

  /**
   * Safely gets the latest known block number for a chain.
   */
  public getLatestBlock(chain: string = "__main__"): number {
    return this.latestBlock[chain] ?? 0;
  }

  // --- PRIVATE HELPER METHODS ---

  /**
   * An idempotent function that triggers and waits for the subscriptions to be set up.
   * This is the core of the lazy-initialization pattern.
   */
  private ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initBlockSubscription();
    }
    return this.initializationPromise;
  }

  private async initBlockSubscription(): Promise<void> {
    console.log("Initializing block subscriptions...");
    this.latestBlock["__main__"] = 0;

    await Promise.all([
      PaimaEventManager.Instance.subscribe(
        {
          topic: BuiltinEvents.RollupBlock,
          filter: { block: undefined },
        },
        (event) => {
          const currentBlock = isNaN(this.latestBlock["__main__"])
            ? 0
            : this.latestBlock["__main__"];
          this.latestBlock["__main__"] = Math.max(
            Number(event.block),
            currentBlock,
          );
        },
      ),
      PaimaEventManager.Instance.subscribe(
        {
          topic: BuiltinEvents.SyncChains,
          filter: { chain: undefined, block: undefined },
        },
        (event) => {
          const currentBlock = this.latestBlock[event.chain] || 0;
          this.latestBlock[event.chain] = Math.max(event.block, currentBlock);
        },
      ),
    ]);
    console.log("Block subscriptions initialized.");
  }
}

export const blockWatcher = BlockWatcher.Instance;
