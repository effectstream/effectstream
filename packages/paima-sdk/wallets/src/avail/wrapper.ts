import type { Result } from "@paima/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import type { LoginInfoMap } from "../wallet-modes.ts";
import { type AvailJsApi, AvailConnector } from "./avail.ts";

// Problematic dependency for deno-fresh
import { Keyring } from "avail-js-sdk";

// Problematic dependency for deno-vite
// import { Keyring } from "@polkadot/api";

async function connectWallet(
  loginInfo: LoginInfoMap[WalletMode.AvailJs]
): Promise<Result<IProvider<AvailJsApi>>> {
  try {
    console.log(`availJsLoginWrapper: Attempting to log into ${loginInfo.connection.metadata.name}`);
    const keyring = new Keyring({ type: 'sr25519' });
    keyring.addFromUri(loginInfo.seed);

    const provider = await AvailConnector.instance().connectExternal({
      rpc: loginInfo.connection.api,
      keyring: keyring,
    });

    return {
      success: true,
      result: provider,
    };
  } catch (err: any) {
    console.log(`availJsLoginWrapper: Error while logging into wallet name}`);
    return {
      success: false,
      errorMessage: err.message ?? String(err),
    }
  }
}

export async function availJsLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.AvailJs]
): Promise<Result<IProvider<ApiForMode<WalletMode.AvailJs>>>> {
  const loginResult = await connectWallet(loginInfo);
  return loginResult;
}
