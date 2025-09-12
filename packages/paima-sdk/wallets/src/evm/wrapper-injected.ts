import type { Result } from "@paima/utils";
import type { IProvider } from "../IProvider.ts";
import type { WalletMode, ApiForMode } from "../utils.ts";
import { type LoginInfoMap, connectInjected } from "../wallet-modes.ts";
import { EvmInjectedConnector } from "./injected.ts";
interface SwitchError {
  code: number;
}

async function switchChain(chainName: string | undefined): Promise<boolean> {
  // TODO resolve this from the chain name or passed config
  const config = {
    chainId: 1,
    chainName: "Hardhat",
    chainCurrencyName: "Ether",
    chainCurrencySymbol: "ETH",
    chainCurrencyDecimals: 18,
    chainUri: "http://127.0.0.1:8545",
    chainExplorerUri: "https://etherscan.io",
  };

  const CHAIN_NOT_ADDED_ERROR_CODE = 4902;
  const hexChainId = "0x" + config.chainId.toString(16);

  try {
    await EvmInjectedConnector.instance()
      .getOrThrowProvider()
      .switchChain(hexChainId);
    return await verifyWalletChain();
  } catch (switchError) {
    // This error code indicates that the chain has not been added to the wallet.
    const se = switchError as SwitchError;
    if (se.hasOwnProperty("code") && se.code === CHAIN_NOT_ADDED_ERROR_CODE) {
      try {
        await EvmInjectedConnector.instance()
          .getOrThrowProvider()
          .addChain({
            chainId: hexChainId,
            chainName: chainName,
            nativeCurrency: {
              name: config.chainCurrencyName,
              symbol: config.chainCurrencySymbol,
              decimals: config.chainCurrencyDecimals,
            },
            rpcUrls: [config.chainUri],
            // blockExplorerUrls: Chain not added with empty string.
            blockExplorerUrls: config.chainExplorerUri
              ? [config.chainExplorerUri]
              : undefined,
          });
        await EvmInjectedConnector.instance()
          .getOrThrowProvider()
          .switchChain(hexChainId);
        return await verifyWalletChain();
      } catch (addError) {
        // errorFxn(PaimaMiddlewareErrorCode.ERROR_ADDING_CHAIN, addError);
        return false;
      }
    } else {
      // errorFxn(PaimaMiddlewareErrorCode.ERROR_SWITCHING_TO_CHAIN, switchError);
      return false;
    }
  }
}

async function verifyWalletChain(): Promise<boolean> {
  return await EvmInjectedConnector.instance()
    .getOrThrowProvider()
    .verifyWalletChain();
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
    if (!(await verifyWalletChain())) {
      return { success: false, errorMessage: "EVM_WRONG_CHAIN" };
    }
  } catch (err) {
    return { success: false, errorMessage: "EVM_CHAIN_VERIFICATION" };
  }

  return { success: true, result: "OK" };
}

export async function evmLoginWrapper(
  loginInfo: LoginInfoMap[WalletMode.EvmInjected]
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
    EvmInjectedConnector.instance()
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
      if (!(await verifyWalletChain())) {
        if (!(await switchChain(undefined))) {
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
