import type { Result } from "@effectstream/utils/types";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import { type LoginInfoMap, connectInjected } from "../wallet-modes.ts";
import { MinaConnector } from "./mina.ts";

export async function minaLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.Mina]
): Promise<Result<IProvider<ApiForMode<WalletMode.Mina>>>> {
  const loginResult = await connectInjected(
    "minaLoginWrapper",
    loginInfo,
    MinaConnector.instance()
  );
  if (loginResult.success === false) {
    return loginResult;
  }
  return {
    success: true,
    result: loginResult.result,
  };
}
