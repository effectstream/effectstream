// Wallet helpers shared by the swap e2e scripts: build a facade for a seed,
// wait for sync, read shielded balances, and move shielded tokens between
// wallets. Built on @effectstream/midnight-contracts (the same SDK the
// template's contracts-midnight scripts use).

import * as Rx from "rxjs";
import { UnshieldedAddress } from "@midnight-ntwrk/wallet-sdk-address-format";
import { buildWalletFacade } from "@effectstream/midnight-contracts";
import { midnightNetworkConfig as net } from "@effectstream/midnight-contracts/midnight-env";
import type { WalletResult } from "@effectstream/midnight-contracts/types";

const networkUrls = {
  id: net.id,
  indexer: net.indexer,
  indexerWS: net.indexerWS,
  node: net.node,
  proofServer: net.proofServer,
} as any;

export async function buildWallet(seed: string): Promise<WalletResult> {
  return buildWalletFacade(networkUrls, seed, net.id as any);
}

export function shieldedKeys(w: WalletResult) {
  return { shieldedSecretKeys: w.zswapSecretKeys, dustSecretKey: w.dustSecretKey };
}

const sumBalances = (b: Map<string, bigint> | Record<string, bigint> | undefined): bigint => {
  if (!b) return 0n;
  const vals = b instanceof Map ? Array.from(b.values()) : Object.values(b);
  return vals.reduce<bigint>((acc, v) => acc + ((v as bigint) ?? 0n), 0n);
};

/** Wait until shielded + unshielded (+ dust) subtrees are strictly synced.
 *  When `requireUnshieldedFunds` is set, also wait for NIGHT > 0 (genesis). */
export async function waitForSync(
  w: WalletResult,
  opts: { requireUnshieldedFunds?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  const { requireUnshieldedFunds = false, timeoutMs = 180_000 } = opts;
  await Rx.firstValueFrom(
    (w.wallet as any).state().pipe(
      Rx.filter((s: any) => {
        const isSynced = s.isSynced ?? false;
        const shieldedDone = s.shielded?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
        const unshieldedDone = s.unshielded?.progress?.isStrictlyComplete?.() ?? isSynced;
        const dustDone = s.dust?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
        if (!shieldedDone || !unshieldedDone || !dustDone) return false;
        return requireUnshieldedFunds ? sumBalances(s.unshielded?.balances) > 0n : true;
      }),
      Rx.timeout({
        each: timeoutMs,
        with: () => Rx.throwError(() => new Error(`waitForSync timeout after ${timeoutMs}ms`)),
      }),
    ),
  );
}

/** Read the current shielded balances (color → amount). */
export async function shieldedBalances(w: WalletResult): Promise<Record<string, bigint>> {
  const st = await w.wallet.shielded.waitForSyncedState();
  return (st.balances ?? {}) as Record<string, bigint>;
}

/** Poll the wallet's shielded balance for `color` until it reaches `min`. */
export async function waitForShielded(
  w: WalletResult,
  color: string,
  min: bigint,
  tries = 36,
  ms = 5000,
): Promise<bigint> {
  for (let i = 0; i < tries; i++) {
    const bal = (await shieldedBalances(w))[color] ?? 0n;
    if (bal >= min) return bal;
    await new Promise((r) => setTimeout(r, ms));
  }
  return (await shieldedBalances(w))[color] ?? 0n;
}

/** The wallet's UnshieldedAddress object (for unshielded swap-output recipients). */
export function unshieldedAddressObj(w: WalletResult): unknown {
  return UnshieldedAddress.codec.decode(net.id as any, w.unshieldedKeystore.getBech32Address());
}

/** Read current unshielded balances (color → amount). */
export async function unshieldedBalances(w: WalletResult): Promise<Record<string, bigint>> {
  const st: any = await (w.wallet as any).unshielded?.waitForSyncedState?.().catch(() => null);
  return (st?.balances ?? {}) as Record<string, bigint>;
}

/** Poll the wallet's unshielded balance for `color` until it reaches `min`. */
export async function waitForUnshielded(
  w: WalletResult,
  color: string,
  min: bigint,
  tries = 36,
  ms = 5000,
): Promise<bigint> {
  for (let i = 0; i < tries; i++) {
    const bal = (await unshieldedBalances(w))[color] ?? 0n;
    if (bal >= min) return bal;
    await new Promise((r) => setTimeout(r, ms));
  }
  return (await unshieldedBalances(w))[color] ?? 0n;
}

/** Send `amount` of a shielded `color` from `from` to a shielded address. */
export async function transferShielded(
  from: WalletResult,
  color: string,
  amount: bigint,
  toShieldedAddress: unknown,
  ttlMs = 30 * 60_000,
): Promise<void> {
  const recipe = await from.wallet.transferTransaction(
    [{ type: "shielded", outputs: [{ type: color, amount, receiverAddress: toShieldedAddress as any }] }],
    shieldedKeys(from),
    { ttl: new Date(Date.now() + ttlMs), payFees: true },
  );
  const finalized = await from.wallet.finalizeRecipe(recipe);
  await from.wallet.submitTransaction(finalized);
}
