import { BuiltinEvents, PaimaEventManager } from "@effectstream/event-client";
import { ENV } from "@effectstream/utils/node-env";
import { getRuntime } from "@effectstream/utils/runtime";

// Singleton class to watch for block updates.
class BlockWatcher {
  // 1. A private static property to hold the single instance of the class.
  private static _instance: BlockWatcher;

  // 2. Private properties to hold the state.
  private readonly latestBlock: Record<string, number> = {};
  private initializationPromise: Promise<void> | null = null;
  private polling = false;

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
  ): Promise<void> {
    await this.ensureInitialized();
    const targetChain = chain;
    let currentBlock: number = this.latestBlock[targetChain] ?? 0;
    const targetBlock: number = Number(block ?? currentBlock + 1);
    while (currentBlock < targetBlock) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      currentBlock = this.latestBlock[targetChain] ?? 0;
    }
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
    const { runtime } = getRuntime();

    if (runtime === "bun") {
      await this.initHttpPolling();
    } else {
      await this.initMqttSubscription();
    }
  }

  // ── MQTT-based subscription (Node.js / Deno / browser) ────────────────────

  private async initMqttSubscription(): Promise<void> {
    console.log("Initializing block subscriptions...");
    this.latestBlock["__main__"] = 0;
    this.latestBlock["__timestamp__"] = 0;

    await Promise.all([
      PaimaEventManager.Instance.subscribe(
        {
          topic: BuiltinEvents.RollupBlock,
          filter: { block: undefined },
        },
        (event) => {
          const currentBlock = this.latestBlock["__main__"];
          this.latestBlock["__main__"] = Math.max(Number(event.block), currentBlock);

          const currentTimestamp = this.latestBlock["__timestamp__"];
          this.latestBlock["__timestamp__"] = Math.max(Number(event.timestamp), currentTimestamp);
        },
      ),
      PaimaEventManager.Instance.subscribe(
        {
          topic: BuiltinEvents.SyncChains,
          filter: { chain: undefined, block: undefined },
        },
        (event) => {
          const currentBlock = this.latestBlock[event.chain] || 0;
          this.latestBlock[event.chain] = Math.max(Number(event.block), currentBlock);
        },
      ),
    ]);
    console.log("Block subscriptions initialized.");
  }

  // ── HTTP polling fallback (Bun — ws.createWebSocketStream unsupported) ────

  private async initHttpPolling(): Promise<void> {
    console.log("Initializing block subscriptions (HTTP polling — Bun runtime)...");
    this.latestBlock["__main__"] = 0;
    this.latestBlock["__timestamp__"] = 0;

    // Do one initial fetch so callers know subscriptions are "ready"
    await this.pollOnce();

    this.polling = true;
    this.pollLoop();
    console.log("Block subscriptions initialized.");
  }

  private async pollLoop(): Promise<void> {
    while (this.polling) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.pollOnce();
    }
  }

  private async pollOnce(): Promise<void> {
    await Promise.all([
      this.pollBlockHeights(),
      this.pollRollupBlock(),
    ]);
  }

  /**
   * Fetches GET /block-heights — updates per-protocol synced pages.
   */
  private async pollBlockHeights(): Promise<void> {
    try {
      const res = await fetch(
        `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/block-heights`,
      );
      if (!res.ok) return;

      const data: Array<{
        protocol_name: string;
        synced_page: number | null;
        fetched_page: number | null;
      }> = await res.json();

      for (const entry of data) {
        const synced = entry.synced_page ?? 0;
        if (synced > (this.latestBlock[entry.protocol_name] ?? 0)) {
          this.latestBlock[entry.protocol_name] = synced;
        }
      }
    } catch {
      // API not ready yet — will retry on next poll
    }
  }

  /**
   * Fetches the rollup block height via POST /rpc/evm eth_blockNumber.
   * Updates __main__.
   */
  private async pollRollupBlock(): Promise<void> {
    try {
      const res = await fetch(
        `http://localhost:${ENV.EFFECTSTREAM_API_PORT}/rpc/evm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_blockNumber",
            params: [],
          }),
        },
      );
      if (!res.ok) return;

      const json = await res.json();
      if (json.result) {
        const blockHeight = parseInt(json.result, 16);
        if (blockHeight > (this.latestBlock["__main__"] ?? 0)) {
          this.latestBlock["__main__"] = blockHeight;
        }
      }
    } catch {
      // API not ready yet
    }
  }
}

export const blockWatcher = BlockWatcher.Instance;
