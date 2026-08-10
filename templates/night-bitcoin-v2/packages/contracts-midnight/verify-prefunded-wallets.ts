import * as Rx from "rxjs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { nativeToken } from "@midnight-ntwrk/ledger-v8";
import { NetworkId } from "@midnightntwrk/wallet-sdk-abstractions";
import {
  buildWalletFacade,
  midnightNetworkConfig,
  waitForDustFunds,
} from "@effectstream/midnight-contracts";
import {
  FILLER_WALLETS,
  GENESIS_PROFILE_ID,
  assertPrefundingObservation,
  assertUndeployedProfile,
  type PrefundingObservation,
} from "./wallet-profile.ts";

globalThis.WebSocket = WebSocket;

export interface GeneratedWalletState {
  readonly seed: string;
  readonly shieldedAddress: string;
  readonly unshieldedAddress: string;
  readonly genesisProfileId: string;
  readonly walletId: string;
  readonly expectedNightUtxos: number;
}

const VERIFY_TIMEOUT_MS = 120_000;

function normalizeTokenId(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const token = value as { raw?: unknown; tag?: unknown };
    if (typeof token.raw === "string") return token.raw;
    if (typeof token.tag === "string") return token.tag;
  }
  return String(value);
}

function nativeTokenId(): string {
  return normalizeTokenId(nativeToken());
}

function tokenBalance(
  balances: Map<unknown, bigint> | Record<string, bigint> | undefined,
  tokenId: string,
): bigint {
  if (!balances) return 0n;
  if (balances instanceof Map) {
    for (const [key, value] of balances.entries()) {
      if (normalizeTokenId(key) === tokenId) return value ?? 0n;
    }
    return 0n;
  }
  for (const [key, value] of Object.entries(balances)) {
    if (normalizeTokenId(key) === tokenId) return value ?? 0n;
  }
  return 0n;
}

function coinTokenId(coin: any): string {
  return normalizeTokenId(
    coin?.utxo?.type ?? coin?.type ?? coin?.tokenType ?? coin?.token,
  );
}

function coinAmount(coin: any): bigint {
  const value =
    coin?.utxo?.value ?? coin?.value ?? coin?.utxo?.amount ?? coin?.amount;
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error("Wallet SDK returned a NIGHT UTXO without an integer amount");
}

function unshieldedStateObservable(wallet: any): Rx.Observable<any> {
  const state = wallet?.unshielded?.state;
  if (state && typeof state.pipe === "function") return state;
  if (typeof state === "function") {
    const observable = state.call(wallet.unshielded);
    if (observable && typeof observable.pipe === "function") return observable;
  }
  throw new Error("Wallet SDK did not expose the unshielded state observable");
}

async function waitForUnshieldedState(wallet: any): Promise<any> {
  return Rx.firstValueFrom(
    unshieldedStateObservable(wallet).pipe(
      Rx.filter((state: any) =>
        state?.progress?.isStrictlyComplete?.() ?? state?.isSynced ?? false
      ),
      Rx.timeout({
        first: VERIFY_TIMEOUT_MS,
        with: () =>
          Rx.throwError(
            () =>
              new Error(
                `Unshielded wallet did not sync within ${VERIFY_TIMEOUT_MS}ms`,
              ),
          ),
      }),
    ),
  );
}

export function assertGeneratedWalletProfile(
  wallets: readonly GeneratedWalletState[],
): void {
  if (wallets.length !== FILLER_WALLETS.length) {
    throw new Error(
      `Expected ${FILLER_WALLETS.length} generated filler wallets, received ${wallets.length}`,
    );
  }
  wallets.forEach((wallet, index) => {
    const expected = FILLER_WALLETS[index];
    if (!expected) throw new Error(`Missing filler profile at index ${index}`);
    if (
      wallet.genesisProfileId !== GENESIS_PROFILE_ID ||
      wallet.walletId !== expected.id ||
      wallet.seed !== expected.seed
    ) {
      throw new Error(
        `Generated wallet-${index}.json does not match ${GENESIS_PROFILE_ID}; recreate wallets against the custom genesis`,
      );
    }
  });
}

async function verifyOneWallet(
  descriptor: GeneratedWalletState,
): Promise<PrefundingObservation> {
  const expected = FILLER_WALLETS.find(({ id }) => id === descriptor.walletId);
  if (!expected || expected.seed !== descriptor.seed) {
    throw new Error(`Unknown or mismatched filler descriptor ${descriptor.walletId}`);
  }

  const walletResult = await buildWalletFacade(
    midnightNetworkConfig,
    descriptor.seed,
    NetworkId.NetworkId.Undeployed,
  );
  try {
    if (walletResult.unshieldedAddress !== descriptor.unshieldedAddress) {
      throw new Error(
        `Prefunded wallet ${descriptor.walletId}: derived unshielded address does not match its generated descriptor`,
      );
    }

    const state = await waitForUnshieldedState(walletResult.wallet);
    const tokenId = nativeTokenId();
    const availableCoins = Array.isArray(state?.availableCoins)
      ? state.availableCoins
      : [];
    const nightCoins = availableCoins.filter(
      (coin: any) => coinTokenId(coin) === tokenId,
    );
    const dustBalance = await waitForDustFunds(walletResult.wallet, {
      timeoutMs: VERIFY_TIMEOUT_MS,
      waitNonZero: true,
      skipCatchUp: true,
      dustPollIntervalMs: 1_000,
    });

    const observation: PrefundingObservation = {
      walletId: descriptor.walletId,
      nightBalance: tokenBalance(state?.balances, tokenId),
      nightUtxos: nightCoins.map((coin: any) => ({
        amount: coinAmount(coin),
        registeredForDustGeneration:
          coin?.meta?.registeredForDustGeneration === true,
      })),
      dustBalance,
    };
    assertPrefundingObservation(observation);
    return observation;
  } finally {
    await walletResult.wallet.stop();
  }
}

/** Verify all filler wallets concurrently without creating any transaction. */
export async function verifyPrefundedWallets(
  wallets: readonly GeneratedWalletState[],
): Promise<readonly PrefundingObservation[]> {
  assertUndeployedProfile(String(midnightNetworkConfig.id));
  assertGeneratedWalletProfile(wallets);
  const observations = await Promise.all(wallets.map(verifyOneWallet));
  for (const observation of observations) {
    console.log(
      `[prefunded-wallets] ${observation.walletId}: ${observation.nightUtxos.length} NIGHT UTXOs, DUST=${observation.dustBalance}`,
    );
  }
  console.log(
    `[prefunded-wallets] ${GENESIS_PROFILE_ID} verified; submitted 0 NIGHT transfers and 0 DUST registrations`,
  );
  return observations;
}

if (import.meta.main) {
  const wallets = await Promise.all(
    FILLER_WALLETS.map(async ({ index }) =>
      JSON.parse(
        await readFile(
          path.join(process.cwd(), "generated", `wallet-${index}.json`),
          "utf8",
        ),
      ) as GeneratedWalletState
    ),
  );
  await verifyPrefundedWallets(wallets);
}
