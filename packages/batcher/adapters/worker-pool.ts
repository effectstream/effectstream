/**
 * Worker Pool for Midnight batcher adapters.
 *
 * A "worker" is a {wallet, UTXO-slot} pair that can independently process
 * one transaction at a time. The pool tracks busy/free state and usage
 * counts, and exposes a selection algorithm that:
 *   1. Prefers wallets with the fewest busy workers (maximize wallet spread)
 *   2. Breaks ties by lowest usage count (balance load over time)
 *
 * Each wallet also has a transaction mutex. Ledger-v9 fee wallets must keep
 * the lock from DUST selection through submission settlement; releasing it
 * after balance can let another worker select the same pending DUST input.
 * Different wallets use different mutexes and remain concurrent.
 */

// ---------------------------------------------------------------------------
// Per-wallet transaction mutex
// ---------------------------------------------------------------------------

/**
 * Simple async mutex. At most one holder at a time; additional callers
 * queue in FIFO order and receive a release function when it is their turn.
 */
export class BalanceMutex {
  private locked = false;
  private queue: ((release: () => void) => void)[] = [];

  acquire(): Promise<() => void> {
    return new Promise<() => void>((resolve) => {
      const release = (): void => {
        const next = this.queue.shift();
        if (next) {
          next(release);
        } else {
          this.locked = false;
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        // Park until the current holder (or a predecessor) releases.
        this.queue.push((rel) => {
          // `rel` is the *same* release function — re-arm it for this holder.
          // We create a fresh one-shot wrapper so the holder can only call it once.
          let called = false;
          resolve(() => {
            if (!called) {
              called = true;
              rel();
            }
          });
        });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Worker slot
// ---------------------------------------------------------------------------

export interface WorkerSlot {
  readonly walletIdx: number;
  readonly slotIdx: number;
  busy: boolean;
  /** Lifetime usage counter — how many txs this worker has processed. */
  usageCount: number;
}

// ---------------------------------------------------------------------------
// Worker pool
// ---------------------------------------------------------------------------

export class WorkerPool {
  private readonly workers: WorkerSlot[] = [];
  private readonly mutexes = new Map<number, BalanceMutex>();
  /** Latest requested physical/acquirable slot budget for each wallet. */
  private readonly desiredSlots = new Map<number, number>();

  /**
   * @param slotsPerWallet Array indexed by wallet index. `slotsPerWallet[i]`
   *   is the number of independent UTXO slots for wallet `i`.
   *   Pass `0` for wallets that are not yet initialized; call `setSlots`
   *   later when the UTXO count becomes known.
   */
  constructor(slotsPerWallet: number[]) {
    for (let w = 0; w < slotsPerWallet.length; w++) {
      this.mutexes.set(w, new BalanceMutex());
      this.desiredSlots.set(w, slotsPerWallet[w]);
      for (let s = 0; s < slotsPerWallet[w]; s++) {
        this.workers.push({ walletIdx: w, slotIdx: s, busy: false, usageCount: 0 });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Dynamic slot management
  // -----------------------------------------------------------------------

  /**
   * Update the number of slots for a wallet.  Adds or removes slots as
   * needed.  Busy workers are never removed; if the new count is lower
   * than the number of currently-busy workers the extra busy workers are
   * left in place and will be cleaned up on release.
   */
  setSlots(walletIdx: number, count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError(`Worker slot count must be a non-negative safe integer, got ${count}`);
    }
    if (!this.mutexes.has(walletIdx)) {
      this.mutexes.set(walletIdx, new BalanceMutex());
    }
    this.desiredSlots.set(walletIdx, count);
    this.reconcileWalletSlots(walletIdx);
  }

  /**
   * Converge a wallet's physical slots to its latest desired budget without
   * interrupting in-flight work. Busy excess workers remain until release;
   * free excess workers retire immediately. Growth always chooses the lowest
   * unused slot ID so shrink/regrow cycles cannot create duplicate identities.
   */
  private reconcileWalletSlots(walletIdx: number): void {
    const desired = this.desiredSlots.get(walletIdx) ?? 0;
    let existing = this.workers.filter((w) => w.walletIdx === walletIdx);

    if (existing.length > desired) {
      const removable = existing
        .filter((worker) => !worker.busy)
        .sort((a, b) => b.slotIdx - a.slotIdx);
      let excess = existing.length - desired;
      for (const worker of removable) {
        if (excess === 0) break;
        const index = this.workers.indexOf(worker);
        if (index >= 0) {
          this.workers.splice(index, 1);
          excess--;
        }
      }
      existing = this.workers.filter((w) => w.walletIdx === walletIdx);
    }

    if (existing.length < desired) {
      const usedSlotIds = new Set(existing.map((worker) => worker.slotIdx));
      let slotIdx = 0;
      while (existing.length < desired) {
        while (usedSlotIds.has(slotIdx)) slotIdx++;
        const worker = { walletIdx, slotIdx, busy: false, usageCount: 0 };
        this.workers.push(worker);
        existing.push(worker);
        usedSlotIds.add(slotIdx);
      }
    }
  }

  // -----------------------------------------------------------------------
  // Worker lifecycle
  // -----------------------------------------------------------------------

  /** Returns `true` when at least one eligible worker is free. */
  hasAvailableWorker(walletFilter?: (walletIdx: number) => boolean): boolean {
    return this.workers.some(
      (w) => !w.busy && (!walletFilter || walletFilter(w.walletIdx)),
    );
  }

  /**
   * Select the best free worker using the two-level heuristic:
   *   1. Prefer wallets with the fewest busy workers (spread across wallets)
   *   2. Among equally-preferred wallets, pick the worker with the lowest
   *      usage count (balance load over time)
   *
   * The selected worker is marked busy and its usage counter incremented.
   * Returns `null` if no worker is free.
   *
   * @param walletFilter Optional predicate to exclude wallets (e.g. those
   *   without available dust). Workers whose wallet is rejected by the filter
   *   are skipped. When every free worker is filtered out, returns null —
   *   inputs stay queued and the adapter's capacity gate decides when to
   *   resume (deliberately no fallback: assigning a worker from a wallet
   *   known to lack dust guarantees a doomed balance attempt).
   */
  acquireWorker(walletFilter?: (walletIdx: number) => boolean): WorkerSlot | null {
    const free = this.workers.filter((w) => !w.busy);
    if (free.length === 0) return null;

    const candidates = walletFilter
      ? free.filter((w) => walletFilter(w.walletIdx))
      : free;
    if (candidates.length === 0) return null;

    // Count busy workers per wallet (across ALL workers, not just free ones)
    const busyPerWallet = new Map<number, number>();
    for (const w of this.workers) {
      if (w.busy) {
        busyPerWallet.set(w.walletIdx, (busyPerWallet.get(w.walletIdx) ?? 0) + 1);
      }
    }

    // Sort free workers: first by wallet busy count (ascending), then by usage count (ascending)
    candidates.sort((a, b) => {
      const busyA = busyPerWallet.get(a.walletIdx) ?? 0;
      const busyB = busyPerWallet.get(b.walletIdx) ?? 0;
      if (busyA !== busyB) return busyA - busyB;
      return a.usageCount - b.usageCount;
    });

    const selected = candidates[0];
    selected.busy = true;
    selected.usageCount++;
    return selected;
  }

  /**
   * Release a worker, marking it as free for reuse.
   */
  releaseWorker(walletIdx: number, slotIdx: number): void {
    const w = this.workers.find(
      (w) => w.walletIdx === walletIdx && w.slotIdx === slotIdx,
    );
    if (w) {
      w.busy = false;
      this.reconcileWalletSlots(walletIdx);
    }
  }

  // -----------------------------------------------------------------------
  // Wallet transaction lock
  // -----------------------------------------------------------------------

  /**
   * Acquire the per-wallet transaction mutex. Returns a release function.
   *
   * Callers decide the protected lifecycle. Midnight ledger-v9 callers hold
   * this from balance through submit settlement to prevent DustDoubleSpend.
   */
  acquireBalanceLock(walletIdx: number): Promise<() => void> {
    let mutex = this.mutexes.get(walletIdx);
    if (!mutex) {
      mutex = new BalanceMutex();
      this.mutexes.set(walletIdx, mutex);
    }
    return mutex.acquire();
  }

  // -----------------------------------------------------------------------
  // Diagnostics
  // -----------------------------------------------------------------------

  /** Returns `true` when NO worker is busy (all work is complete). */
  isFullyIdle(): boolean {
    return this.workers.every((w) => !w.busy);
  }

  getFreeWorkerCount(): number {
    return this.workers.filter((w) => !w.busy).length;
  }

  getTotalWorkerCount(): number {
    return this.workers.length;
  }

  getStatus(): string {
    const byWallet = new Map<number, { total: number; busy: number }>();
    for (const w of this.workers) {
      const entry = byWallet.get(w.walletIdx) ?? { total: 0, busy: 0 };
      entry.total++;
      if (w.busy) entry.busy++;
      byWallet.set(w.walletIdx, entry);
    }
    const parts: string[] = [];
    for (const [wi, { total, busy }] of [...byWallet.entries()].sort((a, b) => a[0] - b[0])) {
      parts.push(`W${wi + 1}:${busy}/${total}`);
    }
    return parts.join(" ");
  }
}
