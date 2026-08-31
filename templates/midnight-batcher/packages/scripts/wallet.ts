// Wallet helpers for the midnight-batcher template scripts.
// Adapted from the engine's e2e faucet (e2e/shared/contracts/midnight/faucet.ts)
// with multi-output transfers, fee-less shielded transfers (for delegated
// balancing), and coin-count waits (the correct dust-readiness signal).

// Single WASM instance for ContractState & friends — must be first.
import "@midnight-ntwrk/onchain-runtime-v3";

import { Buffer } from "node:buffer";
import * as Rx from "rxjs";
import { HDWallet, Roles } from "@midnightntwrk/wallet-sdk-hd";
import { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnightntwrk/wallet-sdk-shielded";
import { DustWallet } from "@midnightntwrk/wallet-sdk-dust-wallet";
import {
  createKeystore,
  PublicKey,
  type UnshieldedKeystore,
  UnshieldedWallet,
} from "@midnightntwrk/wallet-sdk-unshielded-wallet";
import {
  DustSecretKey,
  type FinalizedTransaction,
  LedgerParameters,
  nativeToken,
  shieldedToken,
  type UnprovenTransaction,
  ZswapSecretKeys,
} from "@midnight-ntwrk/ledger-v8";
import {
  InMemoryTransactionHistoryStorage,
  NetworkId,
  TransactionHistoryStorage,
} from "@midnightntwrk/wallet-sdk-abstractions";
import { makeServerProvingService } from "@midnightntwrk/wallet-sdk-capabilities/proving";
import {
  MidnightBech32m,
  UnshieldedAddress,
} from "@midnightntwrk/wallet-sdk-address-format";

const TTL_DURATION_MS = 60 * 60 * 1000;
const SYNC_TIMEOUT_MS = Number(process.env.MIDNIGHT_WALLET_SYNC_TIMEOUT_MS ?? 300_000);
const THROTTLE_MS = 10_000;
const DUST_FEE_OVERHEAD = 300_000_000_000_000n; // 0.3 DUST — wallet-side per-coin margin

export const ttl = (): Date => new Date(Date.now() + TTL_DURATION_MS);

export interface NetworkConfig {
  id: string;
  node: string;
  indexer: string;
  indexerWS: string;
  proofServer: string;
}

export interface WalletCtx {
  wallet: WalletFacade;
  zswapSecretKeys: ZswapSecretKeys;
  dustSecretKey: DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
  unshieldedAddress: string;
  dustAddress: string;
  networkId: NetworkId.NetworkId;
}

export function deriveSeedForRole(
  seed: string,
  role: (typeof Roles)[keyof typeof Roles],
): Uint8Array {
  const hd = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hd.type !== "seedOk") throw new Error(`HD wallet: ${hd.type}`);
  const derived = hd.hdWallet.selectAccount(0).selectRole(role as never).deriveKeyAt(0);
  if (derived.type === "keyOutOfBounds") throw new Error(`derivation out of bounds`);
  return Buffer.from(derived.key);
}

export function resolveNetworkId(raw: string): NetworkId.NetworkId {
  switch (raw.toLowerCase()) {
    case "undeployed":
      return NetworkId.NetworkId.Undeployed;
    case "testnet":
      return NetworkId.NetworkId.TestNet;
    case "devnet":
      return NetworkId.NetworkId.DevNet;
    default:
      return raw as NetworkId.NetworkId;
  }
}

export async function buildWallet(
  net: NetworkConfig,
  seed: string,
): Promise<WalletCtx> {
  const networkId = resolveNetworkId(net.id);
  const shieldedSeed = deriveSeedForRole(seed, Roles.Zswap);
  const dustSeed = deriveSeedForRole(seed, Roles.Dust);
  const unshieldedSeed = deriveSeedForRole(seed, Roles.NightExternal);

  const configuration = {
    indexerClientConnection: {
      indexerHttpUrl: net.indexer,
      indexerWsUrl: net.indexerWS,
    },
    relayURL: new URL(net.node.replace("http", "ws")),
    networkId,
    costParameters: {
      additionalFeeOverhead: DUST_FEE_OVERHEAD,
      feeBlocksMargin: 5,
    },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(
      TransactionHistoryStorage.TransactionHistoryCommonSchema,
    ),
  };

  const unshieldedKeystore = createKeystore(unshieldedSeed, networkId);
  const unshieldedPublicKey = PublicKey.fromKeyStore(unshieldedKeystore);
  const dustParameters = LedgerParameters.initialParameters().dust;

  // Sync batching tuned for throughput, not UI responsiveness (per the
  // Midnight wallet team): larger batches = fewer intermediate state
  // snapshots = faster initial sync AND lower memory churn. Spacing kept >0
  // because these scripts run on the main event loop, not a worker.
  // Supported by the shielded and dust wallets (not unshielded).
  const num = (name: string, fallback: number): number => {
    const raw = process.env[name];
    const parsed = Number(raw);
    return raw != null && raw !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  const batchUpdates = {
    size: num("MIDNIGHT_SYNC_BATCH_SIZE", 100),
    timeout: num("MIDNIGHT_SYNC_BATCH_TIMEOUT_MS", 1),
    spacing: num("MIDNIGHT_SYNC_BATCH_SPACING_MS", 1),
  };
  // MIDNIGHT_SYNC_BATCH_DISABLE=1 omits batchUpdates entirely (SDK defaults,
  // UI-tuned) — used by bench-sync.ts for the A/B comparison.
  const syncTuning = process.env.MIDNIGHT_SYNC_BATCH_DISABLE === "1" ? {} : { batchUpdates };

  const wallet = await WalletFacade.init({
    configuration,
    shielded: (cfg) => ShieldedWallet({ ...cfg, ...syncTuning } as never).startWithSeed(shieldedSeed),
    unshielded: (cfg) => UnshieldedWallet(cfg).startWithPublicKey(unshieldedPublicKey),
    dust: (cfg) => DustWallet({ ...cfg, ...syncTuning } as never).startWithSeed(dustSeed, dustParameters),
    provingService: () =>
      makeServerProvingService({ provingServerUrl: new URL(net.proofServer) }),
  });

  const zswapSecretKeys = ZswapSecretKeys.fromSeed(shieldedSeed);
  const dustSecretKey = DustSecretKey.fromSeed(dustSeed);
  await wallet.start(ZswapSecretKeys.fromSeed(shieldedSeed), DustSecretKey.fromSeed(dustSeed));

  const dustState = await Rx.firstValueFrom(wallet.dust.state);

  return {
    wallet,
    zswapSecretKeys,
    dustSecretKey,
    unshieldedKeystore,
    unshieldedAddress: unshieldedKeystore.getBech32Address().asString(),
    dustAddress: MidnightBech32m.encode(networkId, (dustState as { address: never }).address).asString(),
    networkId,
  };
}

const sumBalances = (
  balances: Map<string, bigint> | Record<string, bigint> | undefined,
): bigint => {
  if (!balances) return 0n;
  const values = balances instanceof Map ? [...balances.values()] : Object.values(balances);
  return values.reduce((acc, v) => acc + (v ?? 0n), 0n);
};

/** Wait until all three sub-wallets report synced; returns balances. */
export async function waitSynced(
  ctx: WalletCtx,
  opts?: { timeoutMs?: number; label?: string },
): Promise<{ shielded: bigint; unshielded: bigint }> {
  const timeoutMs = opts?.timeoutMs ?? SYNC_TIMEOUT_MS;
  const label = opts?.label ?? "wallet";
  const state = await Rx.firstValueFrom(
    ctx.wallet.state().pipe(
      Rx.throttleTime(2_000),
      Rx.tap((s: any) => {
        const sh = s.shielded.state.progress.isStrictlyComplete() || (s.isSynced ?? false);
        const du = s.dust.state.progress.isStrictlyComplete() || (s.isSynced ?? false);
        const un = s.unshielded?.syncProgress?.synced ?? (s.isSynced ?? false);
        console.log(`[${label}] sync: shielded=${sh} unshielded=${un} dust=${du}`);
      }),
      Rx.filter((s: any) => {
        const isSynced = s.isSynced ?? false;
        const sh = s.shielded.state.progress.isStrictlyComplete() || isSynced;
        const du = s.dust.state.progress.isStrictlyComplete() || isSynced;
        const un = s.unshielded?.syncProgress?.synced ?? isSynced;
        return sh && du && un;
      }),
      Rx.timeout({
        each: timeoutMs,
        with: () => Rx.throwError(() => new Error(`[${label}] sync timeout after ${timeoutMs}ms`)),
      }),
    ),
  );
  return {
    shielded: (state as any).shielded.balances[shieldedToken().raw] ?? 0n,
    unshielded: sumBalances((state as any).unshielded?.balances),
  };
}

export async function getUnshieldedBalance(ctx: WalletCtx): Promise<bigint> {
  const state: any = await Rx.firstValueFrom(ctx.wallet.state());
  return sumBalances(state.unshielded?.balances);
}

export async function getShieldedBalance(ctx: WalletCtx): Promise<bigint> {
  const state: any = await Rx.firstValueFrom(ctx.wallet.state());
  return state.shielded.balances[shieldedToken().raw] ?? 0n;
}

export async function getUnshieldedCoinCount(ctx: WalletCtx): Promise<number> {
  const state: any = await Rx.firstValueFrom(ctx.wallet.state());
  return state.unshielded?.availableCoins?.length ?? 0;
}

/** Poll until the wallet holds at least `min` unshielded coins. */
export async function waitForUnshieldedCoins(
  ctx: WalletCtx,
  min: number,
  timeoutMs = SYNC_TIMEOUT_MS,
): Promise<number> {
  const start = Date.now();
  for (;;) {
    const count = await getUnshieldedCoinCount(ctx);
    if (count >= min) return count;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout waiting for ${min} unshielded coins (have ${count})`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

/**
 * Wait until a SELF-transfer has fully settled. Two traps to avoid:
 *  - never predict the resulting coin count arithmetically (coin selection may
 *    consume any number of inputs), and
 *  - never treat the first count change as confirmation — the sender's
 *    availableCoins drops immediately when inputs are BOOKED at build time,
 *    long before the tx lands.
 * A self-transfer never changes the wallet's total NIGHT (fees are dust), so
 * settlement = available balance back at `fullBalance` AND a stable count.
 */
export async function waitForSelfTransferSettled(
  ctx: WalletCtx,
  fullBalance: bigint,
  timeoutMs = SYNC_TIMEOUT_MS,
): Promise<number> {
  const start = Date.now();
  let lastCount = -1;
  let stable = 0;
  for (;;) {
    const balance = await getUnshieldedBalance(ctx);
    const count = await getUnshieldedCoinCount(ctx);
    if (balance >= fullBalance) {
      stable = count === lastCount ? stable + 1 : 0;
      lastCount = count;
      if (stable >= 2) return count;
    } else {
      stable = 0;
      lastCount = -1;
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `timeout waiting for self-transfer to settle (balance=${balance}/${fullBalance}, count=${count})`,
      );
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

export async function waitForUnshieldedBalanceAtLeast(
  ctx: WalletCtx,
  min: bigint,
  timeoutMs = SYNC_TIMEOUT_MS,
): Promise<bigint> {
  const start = Date.now();
  for (;;) {
    const balance = await getUnshieldedBalance(ctx);
    if (balance >= min) return balance;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`timeout waiting for unshielded balance >= ${min} (have ${balance})`);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

export interface DustCoinInfo {
  count: number;
  /** Coins whose *generated* value covers fee + wallet overhead. */
  spendable: number;
  values: bigint[];
  balance: bigint;
}

/**
 * Value a dust coin will be worth *now*.
 *
 * `generatedNow` is a snapshot taken at the wallet's last dust sync, not a
 * live value: on a quiet chain it can read 0 for a coin that has been
 * generating since genesis. The ledger computes generation lazily at spend
 * time, so readiness has to project the same way — otherwise a wallet full of
 * usable dust looks empty.
 *
 * Projection matches the ledger: value = min(maxCap, rate × elapsed) from the
 * coin's ctime. Decaying coins (dtime set) are left to the snapshot.
 */
function projectedDustValue(coin: any, now: number): bigint {
  const snapshot = BigInt(coin.generatedNow ?? coin.value ?? 0n);
  if (coin.dtime) return snapshot;
  const ctimeRaw = coin.token?.ctime ?? coin.ctime;
  const ctime = ctimeRaw ? new Date(ctimeRaw).getTime() : 0;
  const rate = BigInt(coin.rate ?? 0);
  if (!ctime || rate === 0n) return snapshot;
  const elapsedSeconds = BigInt(Math.max(0, Math.floor((now - ctime) / 1000)));
  const cap = BigInt(coin.maxCap ?? 0);
  let projected = rate * elapsedSeconds;
  if (cap > 0n && projected > cap) projected = cap;
  return projected > snapshot ? projected : snapshot;
}

export async function getDustCoins(
  ctx: WalletCtx,
  minSpendableValue: bigint = DUST_FEE_OVERHEAD,
): Promise<DustCoinInfo> {
  const state: any = await Rx.firstValueFrom(ctx.wallet.dust.state);
  const coins: any[] = state.availableCoins ?? [];
  // Coin shape (dust-wallet 4.2.0): { token, dtime, maxCap, maxCapReachedAt,
  // generatedNow, rate }.
  const now = Date.now();
  const values = coins.map((c) => projectedDustValue(c, now));
  const balance = values.reduce((a: bigint, b: bigint) => a + b, 0n);
  return {
    count: coins.length,
    spendable: values.filter((v) => v >= minSpendableValue).length,
    values,
    balance,
  };
}

/**
 * The CORRECT dust-readiness signal: at least `count` dust coins each with
 * enough *generated* value to cover fee + overhead. `dust.balance > 0` and
 * `availableCoins.length > 0` are both insufficient (see TESTING.md T4).
 */
export async function waitForDustCoins(
  ctx: WalletCtx,
  count: number,
  minValuePerCoin: bigint,
  timeoutMs = SYNC_TIMEOUT_MS,
): Promise<DustCoinInfo> {
  const start = Date.now();
  for (;;) {
    const info = await getDustCoins(ctx, minValuePerCoin);
    if (info.spendable >= count) return info;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `timeout waiting for ${count} spendable dust coins ` +
          `(have ${info.spendable}/${info.count}, values=${info.values.map(String).join(",")})`,
      );
    }
    console.log(
      `[dust] waiting: ${info.spendable}/${count} spendable coins ` +
        `(${info.count} total, balance=${info.balance})`,
    );
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

/** Register any unregistered NIGHT UTXOs for dust generation (address-level on the ledger). */
export async function registerForDust(ctx: WalletCtx): Promise<boolean> {
  const state: any = await Rx.firstValueFrom(
    ctx.wallet.state().pipe(Rx.filter((s: any) => s.isSynced)),
  );
  const unregistered = state.unshielded?.availableCoins?.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration === false,
  ) ?? [];
  if (unregistered.length === 0) {
    console.log("[dust] no unregistered NIGHT UTXOs");
    return false;
  }
  console.log(`[dust] registering ${unregistered.length} NIGHT UTXO(s) for dust generation...`);

  // A NIGHT-only wallet pays the registration fee from the dust its UTXOs
  // have ALREADY generated — wait until enough has accrued (canary pattern:
  // estimateRegistration → waitForGeneratedDust → register).
  const w = ctx.wallet as unknown as {
    estimateRegistration?: (utxos: unknown[]) => Promise<{ fee: bigint }>;
    waitForGeneratedDust?: (utxos: unknown[], fee: bigint, opts?: { timeoutMs?: number }) => Promise<void>;
  };
  try {
    if (w.estimateRegistration && w.waitForGeneratedDust) {
      const { fee } = await w.estimateRegistration(unregistered);
      // Wait for a margin above the estimate — the node re-checks generation
      // at inclusion time with its own clock.
      const target = (fee * 3n) / 2n;
      console.log(`[dust] registration fee estimate: ${fee} specks — waiting for ${target} generated dust...`);
      await w.waitForGeneratedDust(unregistered, target, { timeoutMs: 300_000 });
    }
  } catch (e) {
    console.warn(`[dust] estimate/wait for generated dust failed (continuing to retry loop): ${e}`);
  }

  // Canary pattern: the recipe is already signed via the callback above —
  // finalize it directly (an extra signUnprovenTransaction pass produces
  // InputsSignaturesLengthMismatch, node custom error 192).
  const txId = await retryOnInsufficientGeneratedDust(ctx, unregistered, async () => {
    const recipe = await ctx.wallet.registerNightUtxosForDustGeneration(
      unregistered,
      ctx.unshieldedKeystore.getPublicKey(),
      (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
    );
    const finalized = await ctx.wallet.finalizeRecipe(recipe as never);
    return await ctx.wallet.submitTransaction(finalized);
  });
  console.log(`[dust] registration submitted: ${txId}`);
  return true;
}

/**
 * Retry an operation that can throw the SDK's
 * "Insufficient generated dust to cover registration fee (have X, need N)"
 * error — waits for the required accrual (via waitForGeneratedDust when
 * available, else time-based) and retries.
 */
async function retryOnInsufficientGeneratedDust<T>(
  ctx: WalletCtx,
  utxos: unknown[],
  op: () => Promise<T>,
  maxAttempts = 6,
): Promise<T> {
  const w = ctx.wallet as unknown as {
    waitForGeneratedDust?: (utxos: unknown[], fee: bigint, opts?: { timeoutMs?: number }) => Promise<void>;
  };
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await op();
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const m = msg.match(/Insufficient generated dust .*need (\d+)/);
      if (!m) throw e;
      const need = BigInt(m[1]);
      console.log(`[dust] attempt ${attempt}: need ${need} generated specks — waiting...`);
      if (w.waitForGeneratedDust) {
        await w.waitForGeneratedDust(utxos, need, { timeoutMs: 300_000 }).catch(() => {});
      } else {
        await new Promise((r) => setTimeout(r, 30_000));
      }
    }
  }
  throw lastError;
}

/** Unshielded NIGHT transfer with multiple outputs. Fees paid by sender's dust. */
export async function transferUnshielded(
  ctx: WalletCtx,
  outputs: Array<{ receiver: string; amount: bigint }>,
): Promise<string> {
  const parsed = outputs.map((o) => ({
    amount: o.amount,
    type: resolveNativeTokenId(),
    receiverAddress: MidnightBech32m.parse(o.receiver).decode(
      UnshieldedAddress,
      ctx.networkId,
    ),
  }));
  const recipe = await ctx.wallet.transferTransaction(
    [{ type: "unshielded", outputs: parsed }],
    { shieldedSecretKeys: ctx.zswapSecretKeys, dustSecretKey: ctx.dustSecretKey },
    { ttl: ttl() },
  );
  const signed = await ctx.wallet.signUnprovenTransaction(
    recipe.transaction,
    (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
  );
  const finalized = await ctx.wallet.finalizeTransaction(signed);
  const txId = await ctx.wallet.submitTransaction(finalized);
  return String(txId);
}

/** Shielded transfer, fees paid by the sender. Used to fund the zswap maker. */
export async function transferShielded(
  ctx: WalletCtx,
  receiverAddress: unknown,
  outputs: Array<bigint>,
): Promise<string> {
  const token = shieldedToken().raw;
  const recipe = await ctx.wallet.transferTransaction(
    [{
      type: "shielded",
      outputs: outputs.map((amount) => ({
        type: token,
        amount,
        receiverAddress: receiverAddress as never,
      })),
    }],
    { shieldedSecretKeys: ctx.zswapSecretKeys, dustSecretKey: ctx.dustSecretKey },
    { ttl: ttl() },
  );
  const signed = await ctx.wallet.signUnprovenTransaction(
    recipe.transaction,
    (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
  );
  const finalized = await ctx.wallet.finalizeTransaction(signed);
  const txId = await ctx.wallet.submitTransaction(finalized);
  return String(txId);
}

/**
 * Build a shielded transfer WITHOUT paying fees: proven + bound but not
 * dust-balanced. This is the zswap workload — the batcher's balancing target
 * completes it via balanceFinalizedTransaction (dust only).
 */
export async function buildFeelessShieldedTransfer(
  ctx: WalletCtx,
  receiverAddress: unknown,
  amount: bigint,
): Promise<FinalizedTransaction> {
  const token = shieldedToken().raw;
  const recipe = await ctx.wallet.transferTransaction(
    [{
      type: "shielded",
      outputs: [{ type: token, amount, receiverAddress: receiverAddress as never }],
    }],
    { shieldedSecretKeys: ctx.zswapSecretKeys, dustSecretKey: ctx.dustSecretKey },
    { ttl: ttl(), payFees: false } as never,
  );
  const signed = await ctx.wallet.signUnprovenTransaction(
    recipe.transaction,
    (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload),
  );
  return await ctx.wallet.finalizeTransaction(signed);
}

export function resolveNativeTokenId(): string {
  const token = nativeToken() as unknown as { raw?: string };
  if (typeof token === "string") return token;
  if (token && typeof token.raw === "string") return token.raw;
  return String(token);
}

export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}
