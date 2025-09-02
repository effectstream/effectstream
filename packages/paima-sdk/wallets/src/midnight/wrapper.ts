import type { Result } from "@paima/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import { type LoginInfoMap, connectInjected } from "../wallet-modes.ts";
import { MidnightConnector } from "./midnight.ts";

export async function checkMidnightWalletStatus(): Promise<Result<string>> {
  const provider = MidnightConnector.instance().getProvider();
  if (provider == null) {
    return {
      success: false,
      errorMessage: "No Midnight wallet found",
    };
  }

  return { success: true, result: "OK" };
}

export async function midnightLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.Midnight]
): Promise<Result<IProvider<ApiForMode<WalletMode.Midnight>>>> {
  const loginResult = await connectInjected(
    "midnightLoginWrapper",
    loginInfo,
    MidnightConnector.instance()
  );
  if (loginResult.success === false) {
    return loginResult;
  }
  return {
    success: true,
    result: loginResult.result,
  };
}
