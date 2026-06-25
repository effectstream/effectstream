import type { Result } from "@effectstream/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import { type LoginInfoMap, connectInjected } from "../wallet-modes.ts";
import { SolanaConnector } from "./solana.ts";

export async function solanaLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.Solana],
): Promise<Result<IProvider<ApiForMode<WalletMode.Solana>>>> {
  const loginResult = await connectInjected(
    "solanaLoginWrapper",
    loginInfo,
    SolanaConnector.instance(),
  );
  if (loginResult.success === false) {
    return loginResult;
  }
  return {
    success: true,
    result: loginResult.result,
  };
}
