// For each filler, build their wallet from the saved seed, register the
// freshly-received NIGHT UTXO for dust generation, and wait until dust > 0.
// This must run while the orchestrator is up and before the filler service
// starts — once dust is on-chain for the wallet, the filler's batcher
// adapter sees `dustBalance > 0` at init and skips its own (broken) call to
// `registerNightForDust`, which wedges on a rebuilt wallet's dust progress
// tracker in undeployed mode.
//
// Pattern mirrors mint-m20-to-fillers.ts — bypass `syncAndWaitForFunds`'s
// strict dust-progress check and do a custom shielded+unshielded readiness
// wait, then call the SDK's `registerNightForDust` on a fresh wallet whose
// dust subtree is empty (so its own filter passes quickly).

import * as Rx from "rxjs";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
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
    // Custom readiness — shielded+unshielded only, with non-zero NIGHT.
    // (Dust progress can wedge; we don't depend on it here, and
    // registerNightForDust will do its own dust check internally.)
    const SYNC_TIMEOUT_MS = 120_000;
    const t0 = Date.now();
    const ready: any = await Rx.firstValueFrom(
      walletResult.wallet.state().pipe(
        Rx.filter((s: any) => {
          const shieldedDone =
            s.shielded?.state?.progress?.isStrictlyComplete?.() ?? false;
          const unshieldedDone =
            s.unshielded?.progress?.isStrictlyComplete?.() ?? false;
          const unshieldedSum = sumBalances(s.unshielded?.balances);
          return shieldedDone && unshieldedDone && unshieldedSum > 0n;
        }),
        Rx.timeout({
          each: SYNC_TIMEOUT_MS,
          with: () =>
            Rx.throwError(
              () =>
                new Error(
                  `[${index + 1}/${total}] shielded+unshielded sync timeout (${SYNC_TIMEOUT_MS}ms) — filler wallet didn't see NIGHT`,
                ),
            ),
        }),
      ),
    );
    const unshieldedSum = sumBalances(ready.unshielded?.balances);
    log.info(
      `[${index + 1}/${total}] synced in ${((Date.now() - t0) / 1000).toFixed(1)}s — unshielded NIGHT: ${unshieldedSum}`,
    );

    // Ledger v8 registration: `signRecipe` → `finalizeRecipe` →
    // `submitTransaction`. (Skipping `signRecipe` and calling `finalizeRecipe`
    // on an unsigned recipe produces a tx that the node drops during validation;
    // the SDK helper historically used `signUnprovenTransaction` +
    // `finalizeTransaction` on `recipe.transaction` and hit error 192 — both are
    // wrong for v8.)
    //
    // The node permits this tx to be fee-paid via *virtual DUST* (the dust
    // that would have accrued on the NIGHT UTXO since its creation), so a
    // fresh wallet with 0 dust balance can still submit it.
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
        (payload: Uint8Array) => keystore.signData(payload),
      );
      log.info(`[${index + 1}/${total}] signing registration recipe`);
      const signedRecipe = await wallet.signRecipe(
        recipe,
        (payload: Uint8Array) => keystore.signData(payload),
      );
      log.info(`[${index + 1}/${total}] finalizing recipe`);
      const finalized = await wallet.finalizeRecipe(signedRecipe);
      log.info(`[${index + 1}/${total}] submitting registration tx`);
      const txId = await wallet.submitTransaction(finalized);
      log.info(
        `[${index + 1}/${total}] registration tx submitted: ${txId}`,
      );
    }

    // Wait for dust to actually appear so the filler service sees > 0 at
    // startup and skips its own (wedge-prone) registration path. 3 min is
    // generous — confirmation + first dust accrual is usually < 1 min once
    // the tx lands in a block.
    const DUST_TIMEOUT_MS = 180_000;
    const dustBalance = await waitForDustFunds(walletResult.wallet, {
      timeoutMs: DUST_TIMEOUT_MS,
      waitNonZero: true,
    });
    log.info(
      `[${index + 1}/${total}] ✅ dust balance: ${dustBalance}`,
    );
  } finally {
    await walletResult.wallet.stop();
  }
}

// How long to let the filler NIGHT UTXOs age before submitting registration
// txs. The chain pays the registration fee out of virtual dust (the dust
// that would have accrued on the UTXO since its creation). On a freshly
// transferred UTXO (seconds old) the virtual dust is ~0 and the block
// producer drops the tx during validation; aging the UTXO for a few minutes
// gives it enough virtual dust to cover its own registration fee.
const VIRTUAL_DUST_AGING_MS = 3 * 60 * 1000;

export async function registerFillerDust(fillerSeeds: string[]): Promise<void> {
  if (fillerSeeds.length === 0) {
    log.info("No filler seeds — skipping dust registration");
    return;
  }
  setNetworkId(NetworkId.NetworkId.Undeployed);
  log.info(
    `Registering NIGHT→dust for ${fillerSeeds.length} filler wallet(s)`,
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
      log.error(
        `[${i + 1}/${fillerSeeds.length}] FAILED:`,
        err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      );
      // Continue with the next filler — partial success is better than
      // halting the whole startup sequence.
    }
  }

  log.info("🎉 Filler dust registration sweep complete");
}
