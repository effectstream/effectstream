// For each filler, build their wallet from the saved seed, register the
// freshly-received NIGHT UTXO for dust generation, and wait until dust > 0.
// This must run while the orchestrator is up and before the filler service
// starts — once dust is on-chain for the wallet, the filler's batcher
// adapter sees `dustBalance > 0` at init and skips its own (broken) call to
// `registerNightForDust`, which wedges on a rebuilt wallet's dust progress
// tracker in undeployed mode.
//
// Pattern mirrors mint-m20-to-fillers.ts — custom dust+unshielded readiness
// wait (see `registerNightForDust` in `@effectstream/midnight-contracts`), then
// build and submit a DustRegistration tx.

import * as Rx from "rxjs";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import {
  buildWalletFacade,
  waitForDustFunds,
} from "@effectstream/midnight-contracts";

globalThis.WebSocket = WebSocket;

const TAG = "[register-filler-dust]";
const log = {
  info: (...args: unknown[]) => console.log(TAG, ...args),
  warn: (...args: unknown[]) => console.warn(TAG, ...args),
  error: (...args: unknown[]) => console.error(TAG, ...args),
};

/**
 * How long faucet-created NIGHT UTXOs age before DustRegistration submits.
 * Default 180s matches prior template; ledger may reject (Rpc 1010 / custom byte)
 * if virtual-speck fees are still insufficient — override with env for experiments.
 *
 * Examples: `MIDNIGHT_VIRTUAL_DUST_AGING_MS=600000` (10m), `=3600000` (1h)
 */
function resolveVirtualDustAgingMs(): number {
  const raw = process.env.MIDNIGHT_VIRTUAL_DUST_AGING_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    log.warn(
      `[diag] MIDNIGHT_VIRTUAL_DUST_AGING_MS="${raw}" invalid — falling back to default`,
    );
  }
  return 3 * 60 * 1000;
}

const VIRTUAL_DUST_AGING_MS = resolveVirtualDustAgingMs();

/** Post-registration wait for dust balance (default 300s; chain/indexer can lag). */
function resolveFillerDustWaitMs(): number {
  const raw = process.env.MIDNIGHT_FILLER_DUST_WAIT_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
    log.warn(
      `[diag] MIDNIGHT_FILLER_DUST_WAIT_MS="${raw}" invalid — falling back to default`,
    );
  }
  return 300_000;
}

/** Brief pause after submit so indexer/façade catch up (0 disables). */
function resolvePostSubmitSettleMs(): number {
  const raw = process.env.MIDNIGHT_FILLER_POST_DUST_REGISTRATION_SETTLE_MS;
  if (raw === "0") return 0;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 3500;
}

const standaloneConfig = {
  indexer: "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: "http://127.0.0.1:9944",
  proofServer: "http://127.0.0.1:6300",
};

const sumBalances = (
  balances: Map<string, bigint> | Record<string, bigint> | undefined,
): bigint => {
  if (!balances) return 0n;
  if (balances instanceof Map) {
    return Array.from(balances.values()).reduce(
      (acc, v) => acc + (v ?? 0n),
      0n,
    );
  }
  return Object.values(balances).reduce<bigint>(
    (acc, v) => acc + ((v as bigint) ?? 0n),
    0n,
  );
};

async function registerOneFiller(
  index: number,
  total: number,
  fillerSeed: string,
): Promise<void> {
  log.info(
    `[${index + 1}/${total}] building wallet for filler seed ${fillerSeed.slice(0, 4)}…${fillerSeed.slice(-4)}`,
  );

  const walletResult = await buildWalletFacade(
    standaloneConfig,
    fillerSeed,
    NetworkId.NetworkId.Undeployed,
  );

  try {
    // Align with `@effectstream/midnight-contracts` registerNightForDust: dust and
    // unshielded must be strictly synced before building a DustRegistration tx. Building
    // too early correlates with node rejections (Rpc 1010 Invalid Transaction).
    const SYNC_TIMEOUT_MS = 120_000;
    const t0 = Date.now();
    const ready: any = await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.filter((s: any) => {
          const dustDone =
            s.dust?.state?.progress?.isStrictlyComplete?.() ?? false;
          const unshieldedDone =
            s.unshielded?.progress?.isStrictlyComplete?.() ?? false;
          const unshieldedSum = sumBalances(s.unshielded?.balances);
          return dustDone && unshieldedDone && unshieldedSum > 0n;
        }),
        Rx.timeout({
          each: SYNC_TIMEOUT_MS,
          with: () =>
            Rx.throwError(
              () =>
                new Error(
                  `[${index + 1}/${total}] dust+unshielded sync timeout (${SYNC_TIMEOUT_MS}ms) — filler wallet didn't see NIGHT or dust subtree didn't complete`,
                ),
            ),
        }),
      ),
    );
    const unshieldedSum = sumBalances(ready.unshielded?.balances);
    log.info(
      `[${index + 1}/${total}] synced in ${((Date.now() - t0) / 1000).toFixed(1)}s (dust+unshielded OK) — unshielded NIGHT: ${unshieldedSum}`,
    );
    log.info(
      `[${index + 1}/${total}] dust address: ${walletResult.dustAddress} unshielded: ${walletResult.unshieldedAddress}`,
    );

    const unregisteredNightUtxos =
      (ready as any).unshielded?.availableCoins?.filter(
        (coin: any) => coin.meta?.registeredForDustGeneration === false,
      ) ?? [];
    log.info(
      `[${index + 1}/${total}] found ${unregisteredNightUtxos.length} unregistered NIGHT UTXO(s)`,
    );
    if (unregisteredNightUtxos.length === 0) {
      log.warn(
        `[${index + 1}/${total}] no unregistered UTXOs — skipping (wallet may already be registered)`,
      );
    } else {
      const wallet = walletResult.wallet as any;
      const keystore = walletResult.unshieldedKeystore;
      log.info(`[${index + 1}/${total}] building registration recipe`);
      const recipe = await wallet.registerNightUtxosForDustGeneration(
        unregisteredNightUtxos,
        keystore.getPublicKey(),
        (payload: Uint8Array) => keystore.signDataAsync(payload),
      );
      log.info(
        `[${index + 1}/${total}] finalizing registration recipe (no extra signing step)`,
      );
      const finalized = await wallet.finalizeRecipe(recipe);
      log.info(`[${index + 1}/${total}] submitting registration tx`);
      const txId = await wallet.submitTransaction(finalized);
      log.info(
        `[${index + 1}/${total}] registration tx submitted: ${txId}`,
      );
      const settleMs = resolvePostSubmitSettleMs();
      if (settleMs > 0) {
        log.info(
          `[${index + 1}/${total}] post-submit settle ${settleMs}ms (override MIDNIGHT_FILLER_POST_DUST_REGISTRATION_SETTLE_MS, 0=off)`,
        );
        await new Promise((resolve) => setTimeout(resolve, settleMs));
      }
    }

    // Wait for dust to actually appear so the filler service sees > 0 at
    // startup and skips its own (wedge-prone) registration path.
    const dustWaitMs = resolveFillerDustWaitMs();
    log.info(
      `[${index + 1}/${total}] waiting up to ${(dustWaitMs / 1000).toFixed(0)}s for dust (MIDNIGHT_FILLER_DUST_WAIT_MS)`,
    );
    const dustBalance = await waitForDustFunds(walletResult.wallet, {
      timeoutMs: dustWaitMs,
      waitNonZero: true,
    });
    log.info(
      `[${index + 1}/${total}] ✅ dust balance: ${dustBalance}`,
    );
  } finally {
    await walletResult.wallet.stop();
  }
}

export async function registerFillerDust(fillerSeeds: string[]): Promise<void> {
  if (fillerSeeds.length === 0) {
    log.info("No filler seeds — skipping dust registration");
    return;
  }
  setNetworkId(NetworkId.NetworkId.Undeployed);
  log.info(
    `Registering NIGHT→dust for ${fillerSeeds.length} filler wallet(s)`,
  );
  log.info(
    `[diag] Virtual-dust aging: ${VIRTUAL_DUST_AGING_MS}ms (${(VIRTUAL_DUST_AGING_MS / 1000).toFixed(0)}s) — override with MIDNIGHT_VIRTUAL_DUST_AGING_MS`,
  );

  // One-time aging wait. Each filler NIGHT UTXO was created just moments
  // ago by faucet; pause so virtual dust accrues before we submit any
  // registration tx. Single sleep covers all fillers (they age in parallel).
  log.info(
    `Aging filler NIGHT UTXOs for ${VIRTUAL_DUST_AGING_MS / 1000}s so virtual dust covers registration fees…`,
  );
  await new Promise((resolve) => setTimeout(resolve, VIRTUAL_DUST_AGING_MS));

  for (let i = 0; i < fillerSeeds.length; i++) {
    try {
      await registerOneFiller(i, fillerSeeds.length, fillerSeeds[i]);
    } catch (err) {
      log.error(`[${i + 1}/${fillerSeeds.length}] FAILED:`, err instanceof Error ? `${err.name}: ${err.message}` : String(err));
      // Continue with the next filler — partial success is better than
      // halting the whole startup sequence.
    }
  }

  log.info("🎉 Filler dust registration sweep complete");
}
