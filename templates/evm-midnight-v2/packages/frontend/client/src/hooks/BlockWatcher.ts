import { BuiltinEvents, EventManager } from "@effectstream/event-client";
import { BLOCK_HEIGHTS_ENDPOINT } from "../config.ts";

const USE_HTTP_POLLING = import.meta.env.VITE_IS_BUN === "true";
const POLL_INTERVAL_MS = 2000;

type BlockHeightEntry = {
  protocol_name: string;
  synced_page: number;
  fetched_page: number;
};

// Singleton class to watch for block updates.
// When VITE_IS_BUN=true, uses HTTP polling against /block-heights instead of
// MQTT subscriptions (Bun lacks ws.createWebSocketStream).
export class BlockWatcher {
  private static _instance: BlockWatcher;

  private readonly latestBlock: Record<string, number> = {};
  private initializationPromise: Promise<void> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {}

  public static get Instance(): BlockWatcher {
    if (!BlockWatcher._instance) {
      BlockWatcher._instance = new BlockWatcher();
    }
    return BlockWatcher._instance;
  }

  public async waitForBlock(
    chain: string = "__main__",
    block?: number | bigint,
  ): Promise<number> {
    await this.ensureInitialized();
    let currentBlock: number = this.latestBlock[chain] ?? 0;
    const targetBlock: number = Number(block ?? currentBlock + 1);
    while (currentBlock < targetBlock) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      currentBlock = this.latestBlock[chain] ?? 0;
    }
    return currentBlock;
  }

  public getLatestBlock(chain: string = "__main__"): number {
    return this.latestBlock[chain] ?? 0;
  }

  private ensureInitialized(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = USE_HTTP_POLLING
        ? this.initHttpPolling()
        : this.initBlockSubscription();
    }
    return this.initializationPromise;
  }

  // -- HTTP polling mode (Bun fallback) --

  private async initHttpPolling(): Promise<void> {
    console.log("Initializing block watcher (HTTP polling — VITE_IS_BUN=true)...");
    this.latestBlock["__main__"] = 0;

    await this.pollBlockHeights();

    this.pollTimer = setInterval(() => {
      this.pollBlockHeights().catch((err) =>
        console.warn("Block-heights poll failed:", err),
      );
    }, POLL_INTERVAL_MS);

    console.log("Block watcher initialized (HTTP polling).");
  }

  private async pollBlockHeights(): Promise<void> {
    const res = await fetch(BLOCK_HEIGHTS_ENDPOINT);
    if (!res.ok) return;
    const entries: BlockHeightEntry[] = await res.json();

    for (const entry of entries) {
      const current = this.latestBlock[entry.protocol_name] ?? 0;
      this.latestBlock[entry.protocol_name] = Math.max(
        entry.synced_page,
        current,
      );
    }

    // NTP protocol's synced_page tracks the rollup block counter.
    // Use it as __main__ so waitForBlock("__main__") works correctly.
    const ntp = entries.find((e) => e.protocol_name.toLowerCase().includes("ntp"));
    if (ntp) {
      const currentMain = this.latestBlock["__main__"] ?? 0;
      this.latestBlock["__main__"] = Math.max(ntp.synced_page, currentMain);
    }
  }

  // -- MQTT subscription mode (Node.js / default) --

  private async initBlockSubscription(): Promise<void> {
    console.log("Initializing block subscriptions (MQTT)...");
    this.latestBlock["__main__"] = 0;

    await Promise.all([
      EventManager.Instance.subscribe(
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
      EventManager.Instance.subscribe(
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
    console.log("Block subscriptions initialized (MQTT).");
  }
}

export const blockWatcher = BlockWatcher.Instance;
