import type { Result } from "@paima/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import type { LoginInfoMap } from "../wallet-modes.ts";
import { type EthersApi, EthersConnector } from "./ethers.ts";

async function connectWallet(
  loginInfo: LoginInfoMap[WalletMode.EvmEthers]
): Promise<Result<IProvider<EthersApi>>> {
  const name = loginInfo.connection.metadata.name;
  try {
    console.log(`ethersLoginWrapper: Attempting to log into ${name}`);
    const provider = await EthersConnector.instance().connectExternal(
      loginInfo.connection.api
    );
    return {
      success: true,
      result: provider,
    };
  } catch (err) {
    console.log(`ethersLoginWrapper: Error while logging into wallet name}`);

    return {
      success: false,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
export async function ethersLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.EvmEthers]
): Promise<Result<IProvider<ApiForMode<WalletMode.EvmEthers>>>> {
  const loginResult = await connectWallet(loginInfo);
  if (loginResult.success === false) {
    return loginResult;
  }
  try {
    // TODO Move this to the top level
    // await updateFee();
  } catch (err) {
    // errorFxn(PaimaMiddlewareErrorCode.ERROR_UPDATING_FEE, err);
    // The fee has a default value, so this is not fatal and we can continue.
    // If the fee has increased beyond the default value, posting won't work.
  }

  return {
    success: true,
    result: loginResult.result,
  };
}
