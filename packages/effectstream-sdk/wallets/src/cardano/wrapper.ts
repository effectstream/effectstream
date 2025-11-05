import type { Result } from "@effectstream/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import { type LoginInfoMap, connectInjected } from "../wallet-modes.ts";
import { CardanoConnector } from "./cardano.ts";

export async function checkCardanoWalletStatus(): Promise<Result<string>> {
  const provider = CardanoConnector.instance().getProvider();
  if (provider == null) {
    return {
      success: false,
      errorMessage: "No Cardano wallet found",
    };
  }

  return { success: true, result: "OK" };
}

export async function cardanoLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.Cardano]
): Promise<Result<IProvider<ApiForMode<WalletMode.Cardano>>>> {
  const loginResult = await connectInjected(
    "cardanoLoginWrapper",
    loginInfo,
    CardanoConnector.instance()
  );
  if (loginResult.success === false) {
    return loginResult;
  }
  return {
    success: true,
    result: loginResult.result,
  };
}
