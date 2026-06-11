// Mint test tokens at dev startup: two SHIELDED colors to the genesis wallet
// and one UNSHIELDED color to its unshielded address, via the deployed
// offer-files contract's mint circuits. Gives the e2e suite real multi-token
// swaps (A↔B) and produces `unshieldedCreatedOutputs` events on chain — the
// data the Midnight:UnshieldedCreate primitive ingests into created_unshielded.
//
// The circuit calls go through midnight-js (`callTx`), which proves via the
// local proof server and submits as a regular Midnight transaction — this
// deliberately avoids the unshielded-wallet submission machinery.
//
// Idempotent: domain separators are fixed, so re-runs add balance to the SAME
// token colors rather than creating new ones.
//
//   bun packages/contracts-midnight/mint-test-tokens.ts
//
// Pattern ported from night-bitcoin-v2's mint-m20-to-fillers.ts.

import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import * as Rx from "rxjs";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { NetworkId } from "@midnight-ntwrk/wallet-sdk-abstractions";
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";
import {
  buildWalletFacade,
  registerNightForDust,
  configureMidnightNodeProviders,
} from "@effectstream/midnight-contracts";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { OfferFilesContract, witnesses } from "@zswap-da/contract-offer-files";

const TAG = "[mint-test-tokens]";
const log = {
  info: (...a: unknown[]) => console.log(TAG, ...a),
  warn: (...a: unknown[]) => console.warn(TAG, ...a),
  error: (...a: unknown[]) => console.error(TAG, ...a),
};

globalThis.WebSocket = WebSocket;

// Fixed domain separators → stable token colors across runs.
const SHIELDED_SEP_A = new Uint8Array(32).fill(0xa1);
const SHIELDED_SEP_B = new Uint8Array(32).fill(0xb2);
const UNSHIELDED_SEP = new Uint8Array(32).fill(0xc3);
const MINT_AMOUNT = 1_000_000_000n;

const currentDir = resolve(dirname(new URL(import.meta.url).pathname));

const contractConfig = {
  privateStateStoreName: "offerFilesPrivateState",
  // Compact emits artifacts into `<pkg>/src/managed/{keys,zkir}/`.
  zkConfigPath: resolve(currentDir, "contract-offer-files", "src", "managed"),
};

const compiledContract = CompiledContract.make(
  "contract-offer-files",
  OfferFilesContract.Contract as any,
).pipe(
  CompiledContract.withWitnesses(witnesses as unknown as never),
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

async function getContractAddress(): Promise<string> {
  const file = resolve(currentDir, "contract-offer-files.undeployed.json");
  const json = JSON.parse(await readFile(file, "utf-8"));
  log.info(`Using contract address from ${file}: ${json.contractAddress}`);
  return json.contractAddress;
}

function unshieldedToUserAddressBytes(unshieldedAddr: string): Uint8Array {
  if (!unshieldedAddr.startsWith("mn_addr_")) {
    throw new Error(`expected mn_addr_ bech32m unshielded address, got "${unshieldedAddr}"`);
  }
  const parsed = MidnightBech32m.parse(unshieldedAddr);
  return Uint8Array.prototype.slice.call(parsed.data, 0, 32);
}

const sumBalances = (b: Map<string, bigint> | Record<string, bigint> | undefined): bigint => {
  if (!b) return 0n;
  const vals = b instanceof Map ? Array.from(b.values()) : Object.values(b);
  return vals.reduce<bigint>((acc, v) => acc + ((v as bigint) ?? 0n), 0n);
};

const toHex = (u: Uint8Array): string =>
  Array.from(u, (x) => x.toString(16).padStart(2, "0")).join("");

export interface MintedTestTokens {
  shieldedA: string;
  shieldedB: string;
  unshielded: string;
}

export async function mintTestTokens(): Promise<MintedTestTokens> {
  setNetworkId(midnightNetworkConfig.id as any);

  const contractAddress = await getContractAddress();

  log.info("building genesis wallet facade…");
  const walletResult = await buildWalletFacade(
    {
      id: midnightNetworkConfig.id,
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
    } as any,
    midnightNetworkConfig.walletSeed,
    midnightNetworkConfig.id as any,
  );
  const wallet = walletResult.wallet;

  try {
    // Wait for shielded + unshielded sync with a funded unshielded balance.
    // Deliberately do NOT wait for dust-complete — the dust progress tracker
    // can hang on undeployed even when the wallet is fully usable.
    log.info("waiting for wallet sync (shielded + unshielded, NIGHT > 0)…");
    const SYNC_TIMEOUT_MS = 180_000;
    await Rx.firstValueFrom(
      (wallet as any).state().pipe(
        Rx.filter((state: any) => {
          const isSynced = state.isSynced ?? false;
          const shieldedDone =
            state.shielded?.state?.progress?.isStrictlyComplete?.() ?? isSynced;
          const unshieldedDone =
            state.unshielded?.progress?.isStrictlyComplete?.() ?? isSynced;
          return shieldedDone && unshieldedDone && sumBalances(state.unshielded?.balances) > 0n;
        }),
        Rx.timeout({
          each: SYNC_TIMEOUT_MS,
          with: () => Rx.throwError(() => new Error(`wallet sync timeout after ${SYNC_TIMEOUT_MS}ms`)),
        }),
      ),
    );

    // Dust pays the circuit-call fees; tolerate prior registration.
    try {
      await registerNightForDust(walletResult as any);
    } catch (e) {
      log.warn(`registerNightForDust: ${e instanceof Error ? e.message : String(e)} (continuing)`);
    }

    log.info("joining deployed offer-files contract…", { contractAddress });
    const providers = (await configureMidnightNodeProviders(
      walletResult.wallet,
      walletResult.zswapSecretKeys,
      walletResult.walletZswapSecretKeys,
      walletResult.dustSecretKey,
      walletResult.walletDustSecretKey,
      {
        indexer: midnightNetworkConfig.indexer,
        indexerWS: midnightNetworkConfig.indexerWS,
        node: midnightNetworkConfig.node,
        proofServer: midnightNetworkConfig.proofServer,
      },
      contractConfig.privateStateStoreName,
      contractConfig.zkConfigPath,
      walletResult.unshieldedKeystore,
    )) as any;

    const deployed = await findDeployedContract(providers, {
      contractAddress,
      compiledContract: compiledContract as any,
      privateStateId: "offerFilesPrivateState",
      initialPrivateState: {},
    });
    log.info(`joined contract at ${deployed.deployTxData.public.contractAddress}`);

    // ── 2 shielded mints to the genesis wallet (ownPublicKey = caller) ──
    // Nonces must be UNIQUE per run: re-minting the same (domain_sep, nonce)
    // recreates the identical coin commitment and the node rejects it as a
    // duplicate. Same separators + fresh nonces = same token colors, new coins.
    const nonceBase = BigInt(Date.now());
    const minted: Partial<MintedTestTokens> = {};
    let i = 0n;
    for (const [name, sep] of [
      ["shieldedA", SHIELDED_SEP_A],
      ["shieldedB", SHIELDED_SEP_B],
    ] as const) {
      const t0 = Date.now();
      const tx = await (deployed.callTx as any).mint_shielded(sep, MINT_AMOUNT, nonceBase + i++);
      const coin = tx.private?.result;
      const colorRaw = coin?.color ?? coin?.type;
      if (colorRaw == null) {
        throw new Error(`mint_shielded ${name}: could not read minted color from tx result (keys: ${coin ? Object.keys(coin).join(",") : "no result"})`);
      }
      const color = colorRaw instanceof Uint8Array ? toHex(colorRaw) : String(colorRaw).replace(/^0x/, "");
      minted[name] = color.toLowerCase();
      log.info(`✅ mint_shielded ${name} color=${minted[name]!.slice(0, 16)}… tx=${tx.public?.txId ?? tx.public?.txHash ?? "?"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    }

    // ── 1 unshielded mint to the genesis wallet's unshielded address ──
    const recipientBytes = unshieldedToUserAddressBytes(walletResult.unshieldedAddress);
    const t0 = Date.now();
    const utx = await (deployed.callTx as any).mint_unshielded(
      UNSHIELDED_SEP,
      MINT_AMOUNT,
      { bytes: recipientBytes },
    );
    const ures = utx.private?.result;
    minted.unshielded = (ures instanceof Uint8Array ? toHex(ures) : String(ures ?? toHex(UNSHIELDED_SEP)).replace(/^0x/, "")).toLowerCase();
    log.info(`✅ mint_unshielded color=${minted.unshielded.slice(0, 16)}… tx=${utx.public?.txId ?? utx.public?.txHash ?? "?"} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

    // Best-effort registration so the frontend shows friendly names; the node
    // API may not be up yet during startup — tolerate.
    const API = "http://127.0.0.1:9999";
    for (const [name, color, kind] of [
      ["TestTokenA", minted.shieldedA!, "shielded"],
      ["TestTokenB", minted.shieldedB!, "shielded"],
      ["TestTokenU", minted.unshielded!, "unshielded"],
    ] as const) {
      try {
        await fetch(`${API}/api/known-tokens`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ color, name, kind }),
          signal: AbortSignal.timeout(2000),
        });
      } catch {
        log.warn(`known-tokens registration skipped for ${name} (node API not up)`);
      }
    }

    const result = minted as MintedTestTokens;
    console.log(`${TAG} MINTED ${JSON.stringify(result)}`);
    return result;
  } finally {
    await (wallet as any).stop?.().catch(() => {});
  }
}

if (import.meta.main) {
  mintTestTokens()
    .then(() => process.exit(0))
    .catch((e) => {
      log.error("FAILED:", e);
      process.exit(1);
    });
}
