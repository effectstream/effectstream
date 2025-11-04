import type { Result } from "@effectstream/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import { type LoginInfoMap, connectInjected } from "../wallet-modes.ts";
import { AlgorandConnector } from "./algorand.ts";

export async function algorandLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.Algorand]
): Promise<Result<IProvider<ApiForMode<WalletMode.Algorand>>>> {
  const loginResult = await connectInjected(
    "algorandLoginWrapper",
    loginInfo,
    AlgorandConnector.instance()
  );
  if (loginResult.success === false) {
    return loginResult;
  }
  return {
    success: true,
    result: loginResult.result,
  };
}
