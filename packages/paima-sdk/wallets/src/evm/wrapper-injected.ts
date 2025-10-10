import type { Result } from "@paima/utils";
import type { IProvider } from "../IProvider.ts";
import type { ApiForMode, WalletMode } from "../utils.ts";
import { connectInjected, type LoginInfoMap } from "../wallet-modes.ts";
import { EvmInjectedConnector } from "./injected.ts";
import type { Chain } from "viem/chains";
interface SwitchError {
  code: number;
}

async function switchChain(chain: Chain | undefined): Promise<boolean> {
  if (!chain) {
    // We can't switch to a chain if we don't know what chain to switch to.
    return false;
  }
  const hexChainId = "0x" + chain.id.toString(16);
  await EvmInjectedConnector.instance().switchChain(
    hexChainId,
    chain,
  );
  return await verifyWalletChain(chain);
}

async function verifyWalletChain(chain: Chain | undefined): Promise<boolean> {
  if (!chain) {
    return false;
  }
  const hexChainId = "0x" + chain.id.toString(16);
  return await EvmInjectedConnector.instance().verifyWalletChain(hexChainId);
}

export async function checkEthWalletStatus(): Promise<Result<string>> {
  // const errorFxn = buildEndpointErrorFxn('checkEthWalletStatus');

  // if (!hasLogin(WalletMode.EvmInjected)) {
  //   return { success: true, message: '' };
  // }
  if (EvmInjectedConnector.instance().getProvider() === null) {
    return { success: false, errorMessage: "No address selected" };
  }

  try {
    if (!(await verifyWalletChain(undefined))) {
      return { success: false, errorMessage: "EVM_WRONG_CHAIN" };
    }
  } catch (err) {
    return { success: false, errorMessage: "EVM_CHAIN_VERIFICATION" };
  }

  return { success: true, result: "OK" };
}

export async function evmLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.EvmInjected],
): Promise<Result<IProvider<ApiForMode<WalletMode.EvmInjected>>>> {
  // const errorFxn = buildEndpointErrorFxn('evmLoginWrapper');

  // const evmConfig = await GlobalConfig.mainEvmConfig();
  // if (evmConfig == null) {
  //   return errorFxn(
  //     PaimaMiddlewareErrorCode.EVM_LOGIN,
  //     new Error(`No EVM network found in configuration`)
  //   );
  // }
  // const [_, config] = evmConfig;
  // const gameInfo = {
  //   gameName: getGameName(),
  //   gameChainId: '0x' + config.chainId.toString(16),
  // };
  const loginResult = await connectInjected(
    "evmLoginWrapper",
    loginInfo,
    EvmInjectedConnector.instance(),
  );
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
  try {
    if (loginInfo.checkChainId !== false) {
      if (!(await verifyWalletChain(loginInfo.chain))) {
        if (!(await switchChain(loginInfo.chain))) {
          return { success: false, errorMessage: "EVM_CHAIN_SWITCH" };
        }
      }
    }
  } catch (err) {
    return { success: false, errorMessage: "EVM_CHAIN_SWITCH" };
  }

  return {
    success: true,
    result: loginResult.result,
  };
}
