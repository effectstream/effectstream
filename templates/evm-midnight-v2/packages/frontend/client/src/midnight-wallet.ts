import { WalletMode, walletLogin } from "@effectstream/wallets";
import type {
  MidnightLocalApi,
  MidnightLocalNetworkUrls,
} from "@effectstream/wallets/midnight-local";
import type { WalletResult } from "@effectstream/midnight-contracts/types";
import type { WalletFacade } from "@midnightntwrk/wallet-sdk-facade";
import { map } from "rxjs";
import {
  assertMidnightLocalUndeployed,
  MIDNIGHT_NETWORK_ID,
  resolveUndeployedGenesisSeed,
  resolveMidnightLocalNetworkUrls,
} from "./config.ts";

export type WalletBalances = {
  shieldedBalance: bigint;
  unshieldedBalance: bigint;
  dustBalance: bigint;
};

export type ConnectMidnightWalletDependencies<Providers> = {
  networkId?: string;
  resolveSeed?: (networkId: string) => string;
  resolveNetworkUrls?: () => MidnightLocalNetworkUrls;
  login?: typeof walletLogin;
  sync: (walletResult: WalletResult) => Promise<WalletBalances>;
  configure: (
    walletResult: WalletResult,
    networkUrls: MidnightLocalNetworkUrls,
  ) => Promise<Providers>;
};

let cachedConnection:
  | { wallet: WalletFacade; providers: unknown }
  | undefined;

export async function connectMidnightLocalWallet<Providers>(
  dependencies: ConnectMidnightWalletDependencies<Providers>,
): Promise<{ wallet: WalletFacade; providers: Providers }> {
  const networkId = dependencies.networkId ?? MIDNIGHT_NETWORK_ID;

  // This is deliberately the first connect operation. Public network IDs must
  // fail even if an undeployed wallet is already cached, and before endpoint
  // resolution, genesis-seed access, wallet/provider startup, or network I/O.
  assertMidnightLocalUndeployed(networkId);

  if (cachedConnection != null) {
    console.log("♻️  Reusing already-built Midnight wallet");
    return cachedConnection as { wallet: WalletFacade; providers: Providers };
  }

  console.log("🔗 Building the undeployed MidnightLocal full facade...");
  const seed = (dependencies.resolveSeed ?? resolveUndeployedGenesisSeed)(
    networkId,
  );
  const networkUrls = (dependencies.resolveNetworkUrls ??
    resolveMidnightLocalNetworkUrls)();
  const login = dependencies.login ?? walletLogin;
  const connected = await login({
    mode: WalletMode.MidnightLocal,
    seed,
    networkId,
    networkUrls,
    syncMode: "all",
  });
  if (!connected.success) {
    throw new Error(`MidnightLocal login failed: ${connected.errorMessage}`);
  }

  const localApi = connected.result.provider.getConnection()
    .api as unknown as MidnightLocalApi;
  if (localApi.walletFacade == null || localApi.walletResult == null) {
    throw new Error(
      "MidnightLocal login did not return the required full wallet facade/result.",
    );
  }

  const walletResult = localApi.walletResult as WalletResult;
  const walletFacade = localApi.walletFacade as WalletFacade;
  if (walletResult.wallet !== walletFacade) {
    throw new Error("MidnightLocal facade/result identity mismatch.");
  }
  console.log("✅ Wallet built successfully");

  const { shieldedBalance, unshieldedBalance, dustBalance } =
    await dependencies.sync(walletResult);
  console.log(
    `✅ Wallet synced. Shielded: ${shieldedBalance}, Dust: ${dustBalance}, Unshielded: ${unshieldedBalance}`,
  );

  const providers = await dependencies.configure(walletResult, networkUrls);
  console.log("✅ Providers configured successfully");

  const originalState = walletFacade.state;
  // @ts-ignore - Preserve the template UI's top-level address compatibility.
  walletFacade.state = () => originalState.call(walletFacade).pipe(
    map((state: any) => ({
      ...state,
      address: state.shielded?.address?.coinPublicKeyString?.() || "",
    })),
  );

  cachedConnection = { wallet: walletFacade, providers };
  return { wallet: walletFacade, providers };
}
